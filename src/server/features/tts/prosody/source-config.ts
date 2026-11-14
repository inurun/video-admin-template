import { getVoiceId, type VoiceIdentity } from "@/_schemas";
import { speechVoiceConfig } from "@/video/config";
import type { VideoSpeechVoiceConfig } from "@/video-host/contract";
import { PROSODY_SOURCE } from "./profiles";

/** Everything that decides the reference audio; part of the source and extract cache keys. */
export type ProsodySource = {
  id: string;
  model: string;
  voice: string;
  instructions: string;
  sampleRate: number;
};

const voiceConfig: VideoSpeechVoiceConfig = speechVoiceConfig;

/** A TTS item's voice; one without a voice name cannot be looked up and reads with the default. */
export type ProsodySourceVoice =
  | VoiceIdentity
  | { provider: "voisona" | "voicevox" | "voicepeak"; voiceName?: string; voiceVersion?: string };

function voiceIdOf(voice: ProsodySourceVoice) {
  if (voice.provider === "coeiroink") {
    return getVoiceId(voice);
  }
  return voice.voiceName
    ? getVoiceId({
        provider: voice.provider,
        voiceName: voice.voiceName,
        voiceVersion: voice.voiceVersion,
      })
    : undefined;
}

/** The reference TTS for a character: the shared settings with its own instruction, if any. */
export function prosodySourceFor(voice: ProsodySourceVoice): ProsodySource {
  const voiceId = voiceIdOf(voice);
  const instructions = voiceId ? voiceConfig[voiceId]?.sourceInstructions : undefined;
  return {
    id: PROSODY_SOURCE.id,
    model: PROSODY_SOURCE.model,
    voice: PROSODY_SOURCE.voice,
    instructions: instructions ?? PROSODY_SOURCE.instructions,
    sampleRate: PROSODY_SOURCE.sampleRate,
  };
}
