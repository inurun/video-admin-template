import type { ServerEnv } from "@/server/core/env";

/** Neighboring utterances the TTS hears for intonation but does not read. */
export type ProsodySourceContext = { previous?: string; next?: string };

export type ProsodySourceRequest = {
  text: string;
  /** The adapter's own voice id, as `speechVoiceConfig.voice` writes it. */
  voice: string;
  /** Put before the text; `""` for none. */
  tag: string;
  context?: ProsodySourceContext;
};

/**
 * A reference TTS of the prosody pipeline. Adding a model is adding an adapter here and naming it
 * in `speechVoiceConfig.source`; the rest of the pipeline (reading check, extract, caches) does
 * not change.
 */
export type ProsodySourceAdapter = {
  /**
   * The model and its fixed settings; part of every prosody cache key, so bump it when the audio
   * for the same text would change.
   */
  version: string;
  /** Whether `synthesize` hears the neighboring utterances. */
  takesContext: boolean;
  /** `text` with the words of `readings` (by kana word index) spelled so that the TTS reads them. */
  spell: (text: string, kana: string, readings: ReadonlyMap<number, string>) => string;
  /** Reads `request.text` (its tag first) and returns a WAV. */
  synthesize: (serverEnv: ServerEnv, request: ProsodySourceRequest) => Promise<Buffer>;
};
