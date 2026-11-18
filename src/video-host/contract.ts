// Preview data contract: embedded as `#hf-data` and sent over `HF_DATA_CHANNEL`.
// Also the shape of the composition definition `src/video` exports.
import { z } from "zod";
import type { HfNode } from "@inurun/vite-plugin-hyperframes-jsx/runtime";
import {
  savedProjectSchema,
  savedSchedulesSchema,
  savedTimelineSchema,
  type PageType,
  type SavedTts,
} from "@/_schemas";
import type { HfMode } from "./constants";

export const hfDataSchema = z.object({
  project: savedProjectSchema,
  timeline: savedTimelineSchema,
  schedules: savedSchedulesSchema,
});

/** The composition's props. */
export type HfData = z.infer<typeof hfDataSchema>;

/** What the audio manifest reads from the composition: data only, safe to import on the server. */
export type VideoAudioConfig = {
  /** Page types whose ready TTS is heard. */
  ttsPageTypes: readonly PageType[];
  bgm: {
    fadeSec: number;
    /** `drop` is subtracted from the track volume while TTS plays. */
    duck: { drop: number; downSec: number; holdSec: number; releaseSec: number };
    /**
     * Scene music: while a page's nested timeline clip with this id plays (say a battle inside
     * the endcard), `src` replaces the project BGM, crossfading over `fadeSec` at both edges.
     */
    scenes: readonly BgmScene[];
    /**
     * Rests: while a sequence-track clip with this id plays (at any depth, say a victory jingle),
     * every BGM is silent. It fades out over `fadeOutSec` from the clip start and back in over
     * `fadeInSec` up to the clip end.
     */
    rests: readonly BgmRest[];
  };
  /**
   * Sound effects: every timeline clip with this id, nested at any depth in the sequence
   * track (say a hit inside a battle action), plays `src` from its start for its length.
   */
  cues: readonly SoundCue[];
};

export type BgmScene = { clip: string; src: string; volume: number };

export type BgmRest = { clip: string; fadeOutSec: number; fadeInSec: number };

export type SoundCue = { clip: string; src: string; volume: number };

/**
 * How each TTS engine gets its readings and prosody. Server data, read once at startup.
 * - `prosody`: haqumei analyze + a reference TTS checked by an LLM; the reference audio's
 *   pitch and timing are mixed into the engine. `pitchWeight` is only for engines that take
 *   pitch (VOICEVOX); `timingWeight` is tempo and pauses. Both are 0 to 1 and default to 0.8.
 *   `pitchSmoothing` (pitch engines only, 0 to 1, default 0) mixes each mora's reference pitch
 *   with its neighbors' before mapping (1 = half its own, half the neighbors'); the range stays
 *   the engine's, only jitter is evened out.
 *   `pitchLimit` (pitch engines only, above 0, omitted = none) soft-limits each mora's reference
 *   pitch to that many standard deviations from the utterance mean, both up and down, so one
 *   spike or dip does not flatten the rest of the utterance. 1.5 to 2 is a good start.
 * - `llm-g2p`: one LLM G2P pass per page.
 * An engine left out uses `llm-g2p` when it can, otherwise no G2P.
 */
export type VideoSpeechConfig = {
  [TProvider in SavedTts["provider"]]?:
    | {
        pipeline: "prosody";
        pitchWeight?: number;
        timingWeight?: number;
        pitchSmoothing?: number;
        pitchLimit?: number;
      }
    | { pipeline: "llm-g2p" };
};

export type SpeechPipeline = NonNullable<VideoSpeechConfig[SavedTts["provider"]]>["pipeline"];

/** Reference TTS voices (Fish Audio Drama 3, Fish Official) the prosody pipeline may read with. */
export type ProsodySourceVoice = "hina" | "shiori";

/**
 * Reference TTS of the prosody pipeline. One `voice` reads every character; each character
 * may set its own Drama 3 direction, written in brackets and put before the text
 * (e.g. `[tired]`, `[whispering, sleepy]`). `tags` is keyed by voice id
 * (`provider::voiceName::voiceVersion`, e.g. `voicevox::113::`); a character left out reads
 * with `defaultTag`, and `""` reads without a tag.
 */
export type VideoSpeechVoiceConfig = {
  voice: ProsodySourceVoice;
  defaultTag: string;
  tags: { [voiceId: string]: string };
};

export type VideoDefinition = VideoAudioConfig & {
  Composition: (props: HfData) => HfNode;
  /** Called once with the root `data-mode` before the first mount. */
  onMode?: (mode: HfMode) => void;
};
