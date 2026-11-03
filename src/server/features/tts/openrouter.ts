import { z } from "zod";
import type { ServerEnv } from "@/server/core/env";
import { requestOpenRouterJson, type OpenRouterUsage } from "@/server/core/openrouter";
import type { G2pDictionaryHint } from "@/server/features/tts/g2p-dictionary";
import type { G2pPageContext } from "@/server/features/tts/g2p-context";
import { LLM_G2P_PROFILE, LLM_G2P_REPAIR_PROFILE } from "@/server/features/tts/llm-g2p-profile";
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

/**
 * id は target ごとに "1", "2"… へ置き換えて送る。UUID は出力にも書き戻されるので、そのまま送ると出力トークンを食う。
 * 文脈だけの発話と page には id を付けず、空の title も送らない。
 */
function toUserContent(request: OpenRouterG2pRequest) {
  if (request.kind === "repair") {
    const aliases = new Map(request.items.map((item, index) => [item.id, String(index + 1)]));
    const items = request.items.map((item) => ({ ...item, id: aliases.get(item.id)! }));
    return { aliases, content: { items } };
  }

  const targetIds = request.pages.flatMap((page) =>
    page.utterances.flatMap((utterance) => (utterance.target ? [utterance.id] : [])),
  );
  const aliases = new Map(targetIds.map((id, index) => [id, String(index + 1)]));
  const pages = request.pages.map((page) => ({
    ...(page.title ? { title: page.title } : {}),
    utterances: page.utterances.map(({ id, ...utterance }) =>
      utterance.target ? { id: aliases.get(id)!, ...utterance } : utterance,
    ),
  }));
  return { aliases, content: { pages } };
}

export async function requestOpenRouterG2p(
  serverEnv: ServerEnv,
  request: OpenRouterG2pRequest,
): Promise<OpenRouterG2pResult> {
  const { aliases, content } = toUserContent(request);
  const idByAlias = new Map([...aliases].map(([id, alias]) => [alias, id]));
  const { output, ...result } = await requestOpenRouterJson(serverEnv, {
    profile: request.kind === "repair" ? LLM_G2P_REPAIR_PROFILE : LLM_G2P_PROFILE,
    system: getOpenRouterG2pSystemPrompt({ repair: request.kind === "repair" }),
    user: JSON.stringify(content),
    schemaName: "g2p_kana",
    jsonSchema: kanaJsonSchema,
    output: kanaOutputSchema,
  });
  return {
    ...result,
    kanaById: new Map(
      output.items.flatMap((item) => {
        const id = idByAlias.get(item.id);
        return id ? [[id, item.kana] as const] : [];
      }),
    ),
  };
}
