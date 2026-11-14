import type { ProsodyExtract } from "@/_schemas";
import { speechConfig } from "@/video/config";
import type { VideoSpeechConfig } from "@/video-host/contract";
import { ttsProviders } from "@/server/features/tts/providers/registry";
import type {
  ProviderPipelines,
  SynthesisProsody,
  TtsProvider,
} from "@/server/features/tts/providers/types";

export const DEFAULT_PROSODY_TIMING_WEIGHT = 0.5;

/** What an engine actually runs: the template's choice checked against what the engine takes. */
export type ResolvedSpeechPipeline =
  | { pipeline: "none" }
  | { pipeline: "llm-g2p" }
  | { pipeline: "prosody"; pitchWeight: number; timingWeight: number };

function resolveOne(
  provider: string,
  choice: VideoSpeechConfig[TtsProvider],
  supported: ProviderPipelines,
): ResolvedSpeechPipeline {
  if (!choice) {
    return supported["llm-g2p"] ? { pipeline: "llm-g2p" } : { pipeline: "none" };
  }
  if (choice.pipeline === "llm-g2p") {
    if (!supported["llm-g2p"]) {
      throw new Error(`speechConfig.${provider}: ${provider} does not take llm-g2p`);
    }
    return { pipeline: "llm-g2p" };
  }

  if (!supported.prosody) {
    throw new Error(`speechConfig.${provider}: ${provider} does not take prosody`);
  }
  const timingWeight = choice.timingWeight ?? DEFAULT_PROSODY_TIMING_WEIGHT;
  if (!(timingWeight >= 0 && timingWeight <= 1)) {
    throw new Error(`speechConfig.${provider}.timingWeight must be within 0 to 1: ${timingWeight}`);
  }
  return { pipeline: "prosody", pitchWeight: supported.prosody.pitchWeight, timingWeight };
}

export function resolveSpeechPipelines(
  config: VideoSpeechConfig,
  providers: { [TProvider in TtsProvider]: { pipelines: ProviderPipelines } },
) {
  return Object.fromEntries(
    Object.entries(providers).map(([provider, adapter]) => [
      provider,
      resolveOne(provider, config[provider as TtsProvider], adapter.pipelines),
    ]),
  ) as Record<TtsProvider, ResolvedSpeechPipeline>;
}

// Resolved on import, so a template choice an engine cannot take stops the server at startup.
const speechPipelines = resolveSpeechPipelines(speechConfig, ttsProviders);

export function getSpeechPipeline(provider: TtsProvider): ResolvedSpeechPipeline {
  return speechPipelines[provider];
}

/** The cached reference prosody with the engine's weights, or nothing outside the prosody pipeline. */
export function toSynthesisProsody(
  provider: TtsProvider,
  extract: ProsodyExtract | undefined,
): SynthesisProsody | undefined {
  const speech = getSpeechPipeline(provider);
  if (!extract || speech.pipeline !== "prosody") {
    return undefined;
  }
  return {
    moras: extract.moras,
    pauses: extract.pauses,
    pitch_weight: speech.pitchWeight,
    timing_weight: speech.timingWeight,
  };
}
