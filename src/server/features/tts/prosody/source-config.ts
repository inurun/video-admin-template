import { getVoiceId, type VoiceIdentity } from "@/_schemas";
import { speechVoiceConfig } from "@/video/config";
import type { ProsodySourceId, VideoSpeechVoiceConfig } from "@/video-host/contract";
import { getProsodySourceAdapter } from "./sources/registry";

/**
 * Everything that decides the reference audio; part of the settled and extract cache keys.
 * `source` picks the adapter and `version` is that adapter's version.
 */
export type ProsodySource = {
  source: ProsodySourceId;
  version: string;
  voice: string;
  /** Audio tags put before the text; `""` for none. */
  tag: string;
};

const voiceConfig: VideoSpeechVoiceConfig = speechVoiceConfig;

/** A TTS item's voice; one without a voice name cannot be looked up and reads with the default. */
export type ProsodySpeaker =
  | VoiceIdentity
  | { provider: "voisona" | "voicevox" | "voicepeak"; voiceName?: string; voiceVersion?: string };

function voiceIdOf(speaker: ProsodySpeaker) {
  if (speaker.provider === "coeiroink") {
    return getVoiceId(speaker);
  }
  return speaker.voiceName
    ? getVoiceId({
        provider: speaker.provider,
        voiceName: speaker.voiceName,
        voiceVersion: speaker.voiceVersion,
      })
    : undefined;
}

/** The reference TTS for a character: the configured source and voice, with its own tag, if any. */
export function prosodySourceFor(
  speaker: ProsodySpeaker,
  config: VideoSpeechVoiceConfig = voiceConfig,
): ProsodySource {
  const voiceId = voiceIdOf(speaker);
  return {
    source: config.source,
    version: getProsodySourceAdapter(config.source).version,
    voice: config.voice,
    tag: (voiceId ? config.tags[voiceId] : undefined) ?? config.defaultTag,
  };
}
