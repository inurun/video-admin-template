import {
  getVoiceId,
  voiceEmotionDirection,
  type VoiceEmotion,
  type VoiceIdentity,
} from "@/_schemas";
import { speechVoiceConfig } from "@/video/config";
import type { ProsodySourceVoice, VideoSpeechVoiceConfig } from "@/video-host/contract";
import { PROSODY_SOURCE } from "./profiles";

/** Everything that decides the reference audio; part of the source and extract cache keys. */
export type ProsodySource = {
  id: string;
  model: string;
  voice: ProsodySourceVoice;
  /** Drama 3 directions put before the text (the character's, then the line's emotion); `""` for none. */
  tag: string;
  sampleRate: number;
};

const voiceConfig: VideoSpeechVoiceConfig = speechVoiceConfig;

/**
 * A TTS item's voice and the line's emotion; one without a voice name cannot be looked up and
 * reads with the default tag.
 */
export type ProsodySpeaker = (
  | VoiceIdentity
  | { provider: "voisona" | "voicevox" | "voicepeak"; voiceName?: string; voiceVersion?: string }
) & { voiceEmotion?: VoiceEmotion };

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

/**
 * The reference TTS for a line: the shared voice, the character's own tag (or the default), and
 * the direction of the line's emotion.
 */
export function prosodySourceFor(speaker: ProsodySpeaker): ProsodySource {
  const voiceId = voiceIdOf(speaker);
  const tags = [
    (voiceId ? voiceConfig.tags[voiceId] : undefined) ?? voiceConfig.defaultTag,
    voiceEmotionDirection(speaker.voiceEmotion),
  ];
  return {
    id: PROSODY_SOURCE.id,
    model: PROSODY_SOURCE.model,
    voice: voiceConfig.voice,
    tag: tags.filter(Boolean).join(" "),
    sampleRate: PROSODY_SOURCE.sampleRate,
  };
}
