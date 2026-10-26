import { z } from "zod";
import type { ServerEnv } from "@/server/core/env";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_RETRY_AFTER_SEC = 10;
const MAX_RETRY_AFTER_SEC = 30;

const usageSchema = z
  .object({
    prompt_tokens: z.number().nonnegative().optional(),
    completion_tokens: z.number().nonnegative().optional(),
    total_tokens: z.number().nonnegative().optional(),
    cost: z.number().nonnegative().optional(),
    completion_tokens_details: z
      .object({ reasoning_tokens: z.number().nonnegative().optional() })
      .optional(),
    prompt_tokens_details: z
      .object({ cached_tokens: z.number().nonnegative().optional() })
      .optional(),
  })
  .passthrough();

const openRouterEnvelopeSchema = z
  .object({
    id: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
    provider: z.string().optional(),
    choices: z
      .array(
        z
          .object({
            finish_reason: z.string().nullable().optional(),
            message: z
              .object({ content: z.union([z.string(), z.null()]).optional() })
              .passthrough()
              .optional(),
          })
          .passthrough(),
      )
      .optional(),
    usage: usageSchema.optional(),
  })
  .passthrough();

export type OpenRouterUsage = {
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
  totalTokens: number;
  costUsd: number;
};

/** One fixed model setup; a change of any field gets a new id so logs stay comparable. */
export type OpenRouterProfile = {
  id: string;
  model: string;
  reasoningEffort: "none" | "minimal" | "low" | "medium" | "high";
  timeoutMs: number;
  maxTokens: number;
  retryLimit: number;
};

export type OpenRouterJsonRequest<T> = {
  profile: OpenRouterProfile;
  system: string;
  user: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  output: z.ZodType<T>;
};

export type OpenRouterJsonResult<T> = {
  requestId?: string;
  model: string;
  provider?: string;
  finishReason?: string;
  output: T;
  usage: OpenRouterUsage;
};

export class OpenRouterError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly responseBody?: string,
  ) {
    super(message);
    this.name = "OpenRouterError";
  }
}

export const ZERO_USAGE: OpenRouterUsage = {
  promptTokens: 0,
  completionTokens: 0,
  reasoningTokens: 0,
  cachedTokens: 0,
  totalTokens: 0,
  costUsd: 0,
};

export function addUsage(left: OpenRouterUsage, right: OpenRouterUsage): OpenRouterUsage {
  return {
    promptTokens: left.promptTokens + right.promptTokens,
    completionTokens: left.completionTokens + right.completionTokens,
    reasoningTokens: left.reasoningTokens + right.reasoningTokens,
    cachedTokens: left.cachedTokens + right.cachedTokens,
    totalTokens: left.totalTokens + right.totalTokens,
    costUsd: left.costUsd + right.costUsd,
  };
}

export function hasOpenRouterApiKey(serverEnv: { OPENROUTER_API_KEY?: string }) {
  return Boolean(serverEnv.OPENROUTER_API_KEY?.trim());
}

function readUsage(usage: z.infer<typeof usageSchema>): OpenRouterUsage {
  return {
    promptTokens: usage.prompt_tokens ?? 0,
    completionTokens: usage.completion_tokens ?? 0,
    reasoningTokens: usage.completion_tokens_details?.reasoning_tokens ?? 0,
    cachedTokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
    totalTokens: usage.total_tokens ?? 0,
    costUsd: usage.cost ?? 0,
  };
}

function isRetryableStatus(status: number) {
  return status === 429 || status >= 500;
}

function retryDelayMs(response: Response) {
  const header = Number(response.headers.get("retry-after"));
  const seconds = Number.isFinite(header) && header > 0 ? header : DEFAULT_RETRY_AFTER_SEC;
  return Math.min(seconds, MAX_RETRY_AFTER_SEC) * 1000;
}

async function postChatCompletion(apiKey: string, profile: OpenRouterProfile, body: string) {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/inurun/video-admin-template",
        "X-OpenRouter-Title": "Video Admin",
      },
      body,
      signal: AbortSignal.timeout(profile.timeoutMs),
    });
    if (!isRetryableStatus(response.status) || attempt >= profile.retryLimit) {
      return response;
    }
    await response.body?.cancel();
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs(response)));
  }
}

/** Sends one chat completion with a strict JSON schema and parses the structured output. */
export async function requestOpenRouterJson<T>(
  serverEnv: ServerEnv,
  request: OpenRouterJsonRequest<T>,
): Promise<OpenRouterJsonResult<T>> {
  const apiKey = serverEnv.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new OpenRouterError("OPENROUTER_API_KEY is not set");
  }

  const { profile } = request;
  const response = await postChatCompletion(
    apiKey,
    profile,
    JSON.stringify({
      model: profile.model,
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: request.user },
      ],
      reasoning: { effort: profile.reasoningEffort },
      response_format: {
        type: "json_schema",
        json_schema: { name: request.schemaName, strict: true, schema: request.jsonSchema },
      },
      provider: { require_parameters: true },
      max_tokens: profile.maxTokens,
      stream: false,
    }),
  );

  const responseBody = await response.text();
  if (!response.ok) {
    throw new OpenRouterError(
      `OpenRouter request failed: HTTP ${response.status}${responseBody ? ` ${responseBody}` : ""}`,
      response.status,
      responseBody,
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(responseBody);
  } catch {
    throw new OpenRouterError("OpenRouter returned invalid JSON", response.status, responseBody);
  }
  const envelope = openRouterEnvelopeSchema.safeParse(json);
  if (!envelope.success) {
    throw new OpenRouterError("OpenRouter returned an unexpected envelope", 200, responseBody);
  }

  const choice = envelope.data.choices?.[0];
  const finishReason = choice?.finish_reason ?? undefined;
  const content = choice?.message?.content;
  if (typeof content !== "string" || content.length === 0) {
    throw new OpenRouterError(
      `OpenRouter returned empty output${finishReason ? ` (${finishReason})` : ""}`,
      200,
      responseBody,
    );
  }

  let output: T;
  try {
    output = request.output.parse(JSON.parse(content));
  } catch {
    throw new OpenRouterError("OpenRouter returned invalid structured output", 200, responseBody);
  }

  return {
    requestId: envelope.data.id,
    model: envelope.data.model ?? profile.model,
    provider: envelope.data.provider,
    finishReason,
    output,
    usage: envelope.data.usage ? readUsage(envelope.data.usage) : ZERO_USAGE,
  };
}
