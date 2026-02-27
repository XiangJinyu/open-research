import z from "zod"
import { Tool } from "./tool"
import DESCRIPTION from "./websearch.txt"
import { abortAfterAny } from "../util/abort"

interface SearchResult {
  title: string
  url: string
  snippet: string
}

function stripHTML(s: string): string {
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim()
}

function decodeDDGUrl(raw: string): string {
  const match = raw.match(/uddg=([^&]+)/)
  if (match) return decodeURIComponent(match[1])
  if (raw.startsWith("http")) return raw
  if (raw.startsWith("//")) return "https:" + raw
  return raw
}

function parseLiteHTML(html: string): SearchResult[] {
  const results: SearchResult[] = []

  const rows = html.split(/<tr>/i).slice(1)
  let i = 0
  while (i < rows.length) {
    const row = rows[i]

    const linkMatch = row.match(
      /<a[^>]*rel="nofollow"[^>]*href="([^"]*)"[^>]*class\s*=\s*['"]result-link['"][^>]*>([\s\S]*?)<\/a>/i,
    ) ?? row.match(
      /<a[^>]*class\s*=\s*['"]result-link['"][^>]*rel="nofollow"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i,
    )

    if (linkMatch) {
      const url = decodeDDGUrl(linkMatch[1])
      const title = stripHTML(linkMatch[2])

      let snippet = ""
      for (let j = i + 1; j < Math.min(i + 4, rows.length); j++) {
        if (rows[j].includes("result-snippet")) {
          const snipMatch = rows[j].match(/<td[^>]*class\s*=\s*['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/i)
          if (snipMatch) snippet = stripHTML(snipMatch[1])
          break
        }
      }

      if (url.startsWith("http") && !url.includes("duckduckgo.com")) {
        results.push({ title, url, snippet })
      }
    }
    i++
  }

  return results
}

function formatResults(results: SearchResult[], query: string): string {
  if (results.length === 0) {
    return "No search results found. Please try a different query."
  }

  const header = `Web search results for: "${query}" (${results.length} results)\n`
  const body = results
    .map(
      (r, i) =>
        `[${i + 1}] ${r.title}\n    URL: ${r.url}${r.snippet ? `\n    ${r.snippet}` : ""}`,
    )
    .join("\n\n")

  return header + "\n" + body
}

export const WebSearchTool = Tool.define("websearch", async () => {
  return {
    get description() {
      return DESCRIPTION.replace("{{year}}", new Date().getFullYear().toString())
    },
    parameters: z.object({
      query: z.string().describe("Web search query"),
      numResults: z.number().optional().describe("Number of search results to return (default: 8, max: 20)"),
    }),
    async execute(params, ctx) {
      await ctx.ask({
        permission: "websearch",
        patterns: [params.query],
        always: ["*"],
        metadata: {
          query: params.query,
          numResults: params.numResults,
        },
      })

      const limit = Math.min(params.numResults ?? 8, 20)
      const { signal, clearTimeout } = abortAfterAny(25000, ctx.abort)

      try {
        const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(params.query)}`
        const response = await fetch(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
          signal,
        })

        clearTimeout()

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`DuckDuckGo search error (${response.status}): ${errorText.slice(0, 200)}`)
        }

        const html = await response.text()

        if (html.includes("anomaly")) {
          throw new Error("DuckDuckGo rate limit hit (captcha). Try again later.")
        }

        const results = parseLiteHTML(html).slice(0, limit)

        return {
          output: formatResults(results, params.query),
          title: `Web search: ${params.query}`,
          metadata: {},
        }
      } catch (error) {
        clearTimeout()

        if (error instanceof Error && error.name === "AbortError") {
          throw new Error("Search request timed out")
        }

        throw error
      }
    },
  }
})
