import type { BgmRest, BgmScene, SoundCue, VideoAudioConfig } from "@/video-host/contract";

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
