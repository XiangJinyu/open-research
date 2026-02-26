import z from "zod"
import { Tool } from "./tool"
import DESCRIPTION from "./papersearch.txt"
import { abortAfterAny } from "../util/abort"

interface Paper {
  title: string
  authors: string[]
  year?: number
  abstract?: string
  citationCount?: number
  url?: string
  doi?: string
  tldr?: string
  source: "semantic_scholar" | "openalex"
}

// ---------------------------------------------------------------------------
// Semantic Scholar
// ---------------------------------------------------------------------------
async function searchSemanticScholar(
  query: string,
  opts: { limit: number; year?: string; fieldsOfStudy?: string },
  signal: AbortSignal,
): Promise<Paper[]> {
  const fields = [
    "title",
    "authors",
    "year",
    "abstract",
    "citationCount",
    "url",
    "externalIds",
    "tldr",
  ].join(",")

  const params = new URLSearchParams({
    query,
    limit: String(opts.limit),
    fields,
  })
  if (opts.year) params.set("year", opts.year)
  if (opts.fieldsOfStudy) params.set("fieldsOfStudy", opts.fieldsOfStudy)

  const res = await fetch(
    `https://api.semanticscholar.org/graph/v1/paper/search?${params}`,
    { signal },
  )

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Semantic Scholar API error (${res.status}): ${text}`)
  }

  const json = (await res.json()) as {
    data?: Array<{
      title: string
      authors?: Array<{ name: string }>
      year?: number
      abstract?: string
      citationCount?: number
      url?: string
      externalIds?: { DOI?: string }
      tldr?: { text: string }
    }>
  }

  return (json.data ?? []).map((p) => ({
    title: p.title,
    authors: (p.authors ?? []).map((a) => a.name),
    year: p.year,
    abstract: p.abstract ?? undefined,
    citationCount: p.citationCount,
    url: p.url ?? undefined,
    doi: p.externalIds?.DOI ?? undefined,
    tldr: p.tldr?.text ?? undefined,
    source: "semantic_scholar" as const,
  }))
}

// ---------------------------------------------------------------------------
// OpenAlex
// ---------------------------------------------------------------------------
async function searchOpenAlex(
  query: string,
  opts: { limit: number; year?: string },
  signal: AbortSignal,
): Promise<Paper[]> {
  const params = new URLSearchParams({
    search: query,
    per_page: String(opts.limit),
    select: "title,authorships,publication_year,cited_by_count,doi,primary_location,abstract_inverted_index",
  })

  if (opts.year) {
    // Support "2020-2024" range or single year "2023"
    const match = opts.year.match(/^(\d{4})(?:-(\d{4}))?$/)
    if (match) {
      const from = match[1]
      const to = match[2] ?? match[1]
      params.set("filter", `publication_year:${from}-${to}`)
    }
  }

  const res = await fetch(
    `https://api.openalex.org/works?${params}`,
    {
      headers: { "User-Agent": "OpenResearch/0.1 (https://github.com/XiangJinyu/open-research)" },
      signal,
    },
  )

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OpenAlex API error (${res.status}): ${text}`)
  }

  const json = (await res.json()) as {
    results?: Array<{
      title?: string
      authorships?: Array<{ author: { display_name: string } }>
      publication_year?: number
      cited_by_count?: number
      doi?: string
      primary_location?: { landing_page_url?: string }
      abstract_inverted_index?: Record<string, number[]>
    }>
  }

  return (json.results ?? []).map((p) => ({
    title: p.title ?? "Untitled",
    authors: (p.authorships ?? []).map((a) => a.author.display_name),
    year: p.publication_year,
    abstract: reconstructAbstract(p.abstract_inverted_index),
    citationCount: p.cited_by_count,
    url: p.primary_location?.landing_page_url ?? (p.doi ? `https://doi.org/${p.doi.replace("https://doi.org/", "")}` : undefined),
    doi: p.doi?.replace("https://doi.org/", "") ?? undefined,
    tldr: undefined,
    source: "openalex" as const,
  }))
}

function reconstructAbstract(inverted?: Record<string, number[]>): string | undefined {
  if (!inverted) return undefined
  const words: [number, string][] = []
  for (const [word, positions] of Object.entries(inverted)) {
    for (const pos of positions) {
      words.push([pos, word])
    }
  }
  words.sort((a, b) => a[0] - b[0])
  return words.map(([, w]) => w).join(" ")
}

// ---------------------------------------------------------------------------
// Format
// ---------------------------------------------------------------------------
function formatPaper(p: Paper, idx: number): string {
  const parts = [`[${idx + 1}] ${p.title}`]
  if (p.authors.length) parts.push(`    Authors: ${p.authors.slice(0, 5).join(", ")}${p.authors.length > 5 ? ` (+${p.authors.length - 5} more)` : ""}`)
  if (p.year) parts.push(`    Year: ${p.year}`)
  if (p.citationCount !== undefined) parts.push(`    Citations: ${p.citationCount}`)
  if (p.doi) parts.push(`    DOI: ${p.doi}`)
  if (p.url) parts.push(`    URL: ${p.url}`)
  if (p.tldr) parts.push(`    TLDR: ${p.tldr}`)
  if (p.abstract) {
    const abs = p.abstract.length > 300 ? p.abstract.slice(0, 300) + "..." : p.abstract
    parts.push(`    Abstract: ${abs}`)
  }
  parts.push(`    Source: ${p.source === "semantic_scholar" ? "Semantic Scholar" : "OpenAlex"}`)
  return parts.join("\n")
}

function dedup(papers: Paper[]): Paper[] {
  const seen = new Set<string>()
  return papers.filter((p) => {
    const key = p.doi ?? p.title.toLowerCase().replace(/\s+/g, " ").trim()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------
export const PaperSearchTool = Tool.define("papersearch", async () => {
  return {
    description: DESCRIPTION,
    parameters: z.object({
      query: z.string().describe("Search query for academic papers"),
      source: z
        .enum(["semantic_scholar", "openalex", "both"])
        .optional()
        .describe("Which database to search (default: 'semantic_scholar')"),
      limit: z.number().optional().describe("Number of results per source (default: 10, max: 20)"),
      year: z
        .string()
        .optional()
        .describe("Filter by year or range, e.g. '2023' or '2020-2024'"),
      fieldsOfStudy: z
        .string()
        .optional()
        .describe("Field of study filter for Semantic Scholar (e.g. 'Computer Science', 'Biology', 'Physics')"),
    }),
    async execute(params, ctx) {
      await ctx.ask({
        permission: "papersearch",
        patterns: [params.query],
        always: ["*"],
        metadata: { query: params.query, source: params.source },
      })

      const source = params.source ?? "both"
      const limit = Math.min(params.limit ?? 10, 20)
      const { signal, clearTimeout } = abortAfterAny(30000, ctx.abort)

      try {
        let papers: Paper[] = []
        const warnings: string[] = []

        if (source === "semantic_scholar" || source === "both") {
          try {
            const results = await searchSemanticScholar(
              params.query,
              { limit, year: params.year, fieldsOfStudy: params.fieldsOfStudy },
              signal,
            )
            papers.push(...results)
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            if (source === "semantic_scholar") {
              warnings.push(`Semantic Scholar unavailable: ${msg}`)
            } else {
              warnings.push(`Semantic Scholar unavailable (${msg}), showing OpenAlex results only`)
            }
          }
        }

        if (source === "openalex" || source === "both") {
          try {
            const results = await searchOpenAlex(
              params.query,
              { limit, year: params.year },
              signal,
            )
            papers.push(...results)
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            if (source === "openalex") {
              warnings.push(`OpenAlex unavailable: ${msg}`)
            } else {
              warnings.push(`OpenAlex unavailable (${msg}), showing Semantic Scholar results only`)
            }
          }
        }

        clearTimeout()

        papers = dedup(papers)

        if (papers.length === 0) {
          const fallback = warnings.length
            ? `Search failed.\n${warnings.join("\n")}\nTry again later or use different keywords.`
            : "No papers found. Try different keywords or broaden the search."
          return {
            output: fallback,
            title: `Paper search: ${params.query}`,
            metadata: {},
          }
        }

        const warningBlock = warnings.length ? `Note: ${warnings.join("; ")}\n\n` : ""
        const header = `Found ${papers.length} papers for "${params.query}"${params.year ? ` (year: ${params.year})` : ""}:\n`
        const body = papers.map((p, i) => formatPaper(p, i)).join("\n\n")

        return {
          output: warningBlock + header + "\n" + body,
          title: `Paper search: ${params.query}`,
          metadata: {},
        }
      } catch (error) {
        clearTimeout()
        if (error instanceof Error && error.name === "AbortError") {
          throw new Error("Paper search request timed out")
        }
        throw error
      }
    },
  }
})
