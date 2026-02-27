import z from "zod"
import { Tool } from "./tool"
import { Question } from "../question"
import DESCRIPTION from "./challenge.txt"

const REGIONS = [
  "spark_chamber",
  "archive_labyrinth",
  "hypothesis_forge",
  "experiment_grounds",
  "revelation_hall",
  "chronicle_tower",
] as const

export const ChallengeTool = Tool.define("challenge", {
  description: DESCRIPTION,
  parameters: z.object({
    type: z.enum(["decode", "boss"]).describe("Challenge type"),
    region: z.enum(REGIONS).describe("Region this challenge belongs to"),
    prompt: z.string().describe("The challenge question"),
    hint: z.string().optional().describe("Optional hint"),
  }),
  async execute(params, ctx) {
    const header =
      params.type === "boss" ? "Boss Challenge" : "Decode Moment"

    const options: Question.Option[] = [
      { label: "Skip", description: "Skip this challenge and continue" },
    ]
    if (params.hint) {
      options.push({ label: "Hint", description: "Show a hint" })
    }

    let answer: string
    try {
      const answers = await Question.ask({
        sessionID: ctx.sessionID,
        questions: [
          {
            question: params.prompt,
            header,
            options,
            custom: true,
          },
        ],
        tool: ctx.callID
          ? { messageID: ctx.messageID, callID: ctx.callID }
          : undefined,
      })

      const raw = answers[0]
      if (!raw?.length || raw[0] === "Skip") {
        answer = "(skipped)"
      } else if (raw[0] === "Hint") {
        answer = `(requested hint: "${params.hint}")`
      } else {
        answer = raw.join(" ")
      }
    } catch {
      answer = "(skipped)"
    }

    return {
      title: `${header}: ${params.region}`,
      output: `Challenge: ${params.prompt}\n\nExplorer's answer: ${answer}`,
      metadata: {
        type: params.type,
        region: params.region,
        prompt: params.prompt,
        hint: params.hint,
        answer,
        truncated: true,
      },
    }
  },
})
