import z from "zod"
import { Tool } from "./tool"
import DESCRIPTION from "./journal.txt"

const REGIONS = [
  "spark_chamber",
  "archive_labyrinth",
  "hypothesis_forge",
  "experiment_grounds",
  "revelation_hall",
  "chronicle_tower",
] as const

const Artifact = z.object({
  region: z.enum(REGIONS),
  name: z.string(),
  collected: z.boolean(),
})

export const JournalTool = Tool.define("journal", {
  description: DESCRIPTION,
  parameters: z.object({
    region: z.enum(REGIONS).describe("Current region"),
    artifacts: z.array(Artifact).describe("All artifacts across all regions"),
    bossCleared: z
      .record(z.enum(REGIONS), z.boolean())
      .optional()
      .describe("Boss cleared status per region"),
    secretPassages: z
      .array(
        z.object({
          name: z.string(),
          explored: z.boolean(),
        }),
      )
      .optional()
      .describe("Discovered secret passages"),
    notification: z
      .string()
      .optional()
      .describe("Short event notification (e.g. 'Artifact collected: Research Question')"),
  }),
  async execute(params, ctx) {
    await ctx.ask({
      permission: "journal",
      patterns: ["*"],
      always: ["*"],
      metadata: {},
    })

    const regionLabels: Record<string, string> = {
      spark_chamber: "Spark Chamber",
      archive_labyrinth: "Archive Labyrinth",
      hypothesis_forge: "Hypothesis Forge",
      experiment_grounds: "Experiment Grounds",
      revelation_hall: "Revelation Hall",
      chronicle_tower: "Chronicle Tower",
    }

    const regionTotals: Record<string, number> = {
      spark_chamber: 3,
      archive_labyrinth: 3,
      hypothesis_forge: 3,
      experiment_grounds: 3,
      revelation_hall: 2,
      chronicle_tower: 2,
    }

    const lines: string[] = []
    for (const r of REGIONS) {
      const total = regionTotals[r] ?? 3
      const collected = params.artifacts.filter((a) => a.region === r && a.collected).length
      const cleared = params.bossCleared?.[r] ?? false
      const isCurrent = r === params.region
      const marker = isCurrent ? ">" : " "
      const status = cleared ? " CLEARED" : ""
      lines.push(`${marker} ${regionLabels[r]}: ${collected}/${total}${status}`)
    }

    if (params.secretPassages?.length) {
      lines.push("")
      lines.push("Secret Passages:")
      for (const sp of params.secretPassages) {
        lines.push(`  ${sp.explored ? "✦" : "○"} ${sp.name}`)
      }
    }

    if (params.notification) {
      lines.push("")
      lines.push(`★ ${params.notification}`)
    }

    return {
      title: `Journal: ${regionLabels[params.region]}`,
      output: lines.join("\n"),
      metadata: {
        region: params.region,
        artifacts: params.artifacts,
        bossCleared: params.bossCleared ?? {},
        secretPassages: params.secretPassages ?? [],
        notification: params.notification,
        truncated: true,
      },
    }
  },
})
