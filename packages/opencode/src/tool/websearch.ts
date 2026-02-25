import z from "zod"
import { Tool } from "./tool"
import DESCRIPTION from "./websearch.txt"
import { abortAfterAny } from "../util/abort"

interface SearchResult {
  title: string
  url: string
  snippet: string
}

function parseHTML(html: string): SearchResult[] {
  const results: SearchResult[] = []

  // DuckDuckGo lite returns results in <a class="result-link"> and surrounding elements
  // We use two strategies to maximize extraction

  // Strategy 1: result__a links (standard DDG HTML)
  const linkPattern = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi
  const snippetPattern = /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi

  const links: { url: string; title: string }[] = []
  let m: RegExpExecArray | null
  while ((m = linkPattern.exec(html)) !== null) {
    links.push({
      url: decodeURIComponent(m[1].replace(/.*uddg=/, "").replace(/&.*/, "")),
      title: m[2].replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').trim(),
    })
  }

  const snippets: string[] = []
  while ((m = snippetPattern.exec(html)) !== null) {
    snippets.push(
      m[1].replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').trim(),
    )
  }

  for (let i = 0; i < links.length; i++) {
    results.push({
      title: links[i].title,
      url: links[i].url,
      snippet: snippets[i] ?? "",
    })
  }

  if (results.length > 0) return results

  // Strategy 2: fallback — parse <a> tags inside result blocks from the lite endpoint
  const litePattern = /<a[^>]*rel="nofollow"[^>]*href="([^"]*)"[^>]*class="result-link"[^>]*>([\s\S]*?)<\/a>/gi
  while ((m = litePattern.exec(html)) !== null) {
    results.push({
      url: m[1],
      title: m[2].replace(/<[^>]*>/g, "").trim(),
      snippet: "",
    })
  }

  // Strategy 3: very minimal fallback — grab any links that look like results
  if (results.length === 0) {
    const genericPattern = /<td[^>]*>[\s\S]*?<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/td>[\s\S]*?<td[^>]*class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi
    while ((m = genericPattern.exec(html)) !== null) {
      results.push({
        url: m[1],
        title: m[2].replace(/<[^>]*>/g, "").trim(),
        snippet: m[3].replace(/<[^>]*>/g, "").trim(),
      })
    }
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
        const response = await fetch("https://html.duckduckgo.com/html/", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
          body: `q=${encodeURIComponent(params.query)}&b=`,
          signal,
        })

        clearTimeout()

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`DuckDuckGo search error (${response.status}): ${errorText}`)
        }

        const html = await response.text()
        const results = parseHTML(html).slice(0, limit)

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
