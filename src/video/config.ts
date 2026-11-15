import type {
  BgmRest,
  BgmScene,
  SoundCue,
  VideoAudioConfig,
  VideoSpeechConfig,
  VideoSpeechVoiceConfig,
} from "@/video-host/contract";

/** Data only: the server imports this to write the static audio manifest. */
export const audioConfig = {
  // Pages with a TTS layer.
  ttsPageTypes: ["intro", "main", "outro", "comments"],
  bgm: {
    fadeSec: 1.5,
    duck: { drop: 0.2, downSec: 0.5, holdSec: 0.5, releaseSec: 1.0 },
    // e.g. { clip: "battle", src: "battle.mp3", volume: 0.8 }
    scenes: [] as readonly BgmScene[],
    // e.g. { clip: "victory", fadeOutSec: 0.4, fadeInSec: 1.5 }
    rests: [] as readonly BgmRest[],
  },
  // e.g. { clip: "hit", src: "hit.mp3", volume: 0.3 }
  cues: [] as readonly SoundCue[],
} satisfies VideoAudioConfig;

/** Data only: the server reads which reading pipeline each TTS engine uses. */
export const speechConfig = {
  // pitchWeight / timingWeight (tempo and pauses) omitted = 0.8; VoiSona takes no pitch
  voicevox: { pipeline: "prosody" },
  voisona: { pipeline: "prosody" },
  coeiroink: { pipeline: "llm-g2p" },
} satisfies VideoSpeechConfig;

/**
 * Data only: the prosody pipeline's reference TTS. One voice for everyone; audio tags per
 * character (keyed by voice id), `defaultTag` for the rest.
 */
export const speechVoiceConfig = {
  voice: "bella",
  defaultTag: "[in a monotone]",
  tags: {
    // "voicevox::113::": "[tired]",
  },
} satisfies VideoSpeechVoiceConfig;
