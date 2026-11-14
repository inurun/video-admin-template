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
 *   pitch and timing are mixed into the engine (`timingWeight` defaults to 0.5).
 * - `llm-g2p`: one LLM G2P pass per page.
 * An engine left out uses `llm-g2p` when it can, otherwise no G2P.
 */
export type VideoSpeechConfig = {
  [TProvider in SavedTts["provider"]]?:
    | { pipeline: "prosody"; timingWeight?: number }
    | { pipeline: "llm-g2p" };
};

export type SpeechPipeline = NonNullable<VideoSpeechConfig[SavedTts["provider"]]>["pipeline"];

/**
 * Per-character settings of the prosody pipeline, keyed by voice id
 * (`provider::voiceName::voiceVersion`, e.g. `voicevox::113::`).
 */
export type VideoSpeechVoiceConfig = {
  [voiceId: string]: {
    /** Delivery instruction for the reference TTS; omitted = the shared default. */
    sourceInstructions?: string;
  };
};

export type VideoDefinition = VideoAudioConfig & {
  Composition: (props: HfData) => HfNode;
  /** Called once with the root `data-mode` before the first mount. */
  onMode?: (mode: HfMode) => void;
};
