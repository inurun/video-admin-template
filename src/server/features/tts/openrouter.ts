import { z } from "zod";
import type { ServerEnv } from "@/server/core/env";
import { requestOpenRouterJson, type OpenRouterUsage } from "@/server/core/openrouter";
import type { G2pDictionaryHint } from "@/server/features/tts/g2p-dictionary";
import type { G2pPageContext } from "@/server/features/tts/g2p-context";
import { LLM_G2P_PROFILE } from "@/server/features/tts/llm-g2p-profile";
import { getOpenRouterG2pSystemPrompt } from "./openrouter-prompt";

const kanaOutputSchema = z.object({
  items: z.array(z.object({ id: z.string().min(1), kana: z.string() })),
});

const kanaJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "kana"],
        properties: {
          id: { type: "string" },
          kana: { type: "string" },
        },
      },
    },
  },
} as const;

export type OpenRouterRepairItem = {
  id: string;
  text: string;
  previousKana: string;
  errors: Array<{ reason: string; message: string }>;
  dictionary?: G2pDictionaryHint[];
};

export type OpenRouterG2pRequest =
  | { kind: "generate"; pages: G2pPageContext[] }
  | { kind: "repair"; items: OpenRouterRepairItem[] };

export type OpenRouterG2pResult = {
  requestId?: string;
  model: string;
  provider?: string;
  finishReason?: string;
  kanaById: Map<string, string>;
  usage: OpenRouterUsage;
};

export async function requestOpenRouterG2p(
  serverEnv: ServerEnv,
  request: OpenRouterG2pRequest,
): Promise<OpenRouterG2pResult> {
  const userContent =
    request.kind === "generate" ? { pages: request.pages } : { items: request.items };
  const { output, ...result } = await requestOpenRouterJson(serverEnv, {
    profile: LLM_G2P_PROFILE,
    system: getOpenRouterG2pSystemPrompt({ repair: request.kind === "repair" }),
    user: JSON.stringify(userContent),
    schemaName: "g2p_kana",
    jsonSchema: kanaJsonSchema,
    output: kanaOutputSchema,
  });
  return { ...result, kanaById: new Map(output.items.map((item) => [item.id, item.kana])) };
}
