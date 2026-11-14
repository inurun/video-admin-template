import { getVoiceId, type VoiceIdentity } from "@/_schemas";
import { speechVoiceConfig } from "@/video/config";
import type { ProsodySourceVoice, VideoSpeechVoiceConfig } from "@/video-host/contract";
import { PROSODY_SOURCE } from "./profiles";

/** Everything that decides the reference audio; part of the source and extract cache keys. */
export type ProsodySource = {
  id: string;
  model: string;
  voice: ProsodySourceVoice;
  sampleRate: number;
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

/** The reference TTS for a character: the shared settings with its own voice, if any. */
export function prosodySourceFor(speaker: ProsodySpeaker): ProsodySource {
  const voiceId = voiceIdOf(speaker);
  return {
    id: PROSODY_SOURCE.id,
    model: PROSODY_SOURCE.model,
    voice: (voiceId ? voiceConfig[voiceId] : undefined) ?? PROSODY_SOURCE.voice,
    sampleRate: PROSODY_SOURCE.sampleRate,
  };
}
