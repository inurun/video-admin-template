import type { ProsodyExtract } from "@/_schemas";
import { limitPitch } from "@/server/features/tts/prosody/limit";
import { smoothPitch } from "@/server/features/tts/prosody/smoothing";
import { speechConfig } from "@/video/config";
import type { VideoSpeechConfig } from "@/video-host/contract";
import { ttsProviders } from "@/server/features/tts/providers/registry";
import type {
  ProviderPipelines,
  SynthesisProsody,
  TtsProvider,
} from "@/server/features/tts/providers/types";

export const DEFAULT_PROSODY_PITCH_WEIGHT = 0.8;
export const DEFAULT_PROSODY_TIMING_WEIGHT = 0.8;
export const DEFAULT_PROSODY_PITCH_SMOOTHING = 0;

/** What an engine actually runs: the template's choice checked against what the engine takes. */
export type ResolvedSpeechPipeline =
  | { pipeline: "none" }
  | { pipeline: "llm-g2p" }
  | {
      pipeline: "prosody";
      pitchWeight: number;
      timingWeight: number;
      pitchSmoothing: number;
      /** Omitted: the reference pitch is not limited. */
      pitchLimit?: number;
    };

function checkWeight(provider: string, name: string, weight: number) {
  if (!(weight >= 0 && weight <= 1)) {
    throw new Error(`speechConfig.${provider}.${name} must be within 0 to 1: ${weight}`);
  }
  return weight;
}

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
  const { pitch } = supported.prosody;
  if (
    (choice.pitchWeight !== undefined ||
      choice.pitchSmoothing !== undefined ||
      choice.pitchLimit !== undefined) &&
    !pitch
  ) {
    throw new Error(`speechConfig.${provider}: ${provider} does not take pitch`);
  }
  const pitchWeight = checkWeight(
    provider,
    "pitchWeight",
    pitch ? (choice.pitchWeight ?? DEFAULT_PROSODY_PITCH_WEIGHT) : 0,
  );
  const timingWeight = checkWeight(
    provider,
    "timingWeight",
    choice.timingWeight ?? DEFAULT_PROSODY_TIMING_WEIGHT,
  );
  const pitchSmoothing = checkWeight(
    provider,
    "pitchSmoothing",
    pitch ? (choice.pitchSmoothing ?? DEFAULT_PROSODY_PITCH_SMOOTHING) : 0,
  );
  const { pitchLimit } = choice;
  if (pitchLimit !== undefined && !(pitchLimit > 0 && Number.isFinite(pitchLimit))) {
    throw new Error(`speechConfig.${provider}.pitchLimit must be above 0: ${pitchLimit}`);
  }
  return {
    pipeline: "prosody",
    pitchWeight,
    timingWeight,
    pitchSmoothing,
    ...(pitchLimit === undefined ? {} : { pitchLimit }),
  };
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
  // Limited first, so a spike is not spread onto its neighbors by the smoothing.
  const moras =
    speech.pitchLimit === undefined ? extract.moras : limitPitch(extract.moras, speech.pitchLimit);
  return {
    moras: smoothPitch(moras, extract.pauses, speech.pitchSmoothing),
    pauses: extract.pauses,
    pitch_weight: speech.pitchWeight,
    timing_weight: speech.timingWeight,
  };
}
