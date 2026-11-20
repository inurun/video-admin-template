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
  // pitchWeight / timingWeight (tempo and pauses) omitted = 0.8, pitchSmoothing = 0;
  // VoiSona takes no pitch. pitchRangeWeight 1 (recommended) keeps the reference's pitch range.
  voicevox: { pipeline: "prosody", pitchRangeWeight: 1 },
  voisona: { pipeline: "prosody" },
  coeiroink: { pipeline: "llm-g2p" },
} satisfies VideoSpeechConfig;

/**
 * Data only: the prosody pipeline's reference TTS (`source`) and its voice. One voice for
 * everyone; audio tags per character (keyed by voice id), `defaultTag` for the rest.
 * Drama 3 instead: `{ source: "drama-3", voice: "bf5634e34ee5489991fe687ad0d202c5" }` (Hina).
 */
export const speechVoiceConfig = {
  source: "eleven-v4-turbo",
  voice: "mDxkcO3nsRCNeB4si9qg",
  defaultTag: "",
  // or { kind: "neighbors", utterances: 2 } / { kind: "block" }
  context: { kind: "none" },
  tags: {
    // "voicevox::113::": "[tired]",
  },
} satisfies VideoSpeechVoiceConfig;
