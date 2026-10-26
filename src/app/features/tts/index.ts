export { TtsContextProvider, useTts } from "@/app/features/tts/context/tts-context";
export {
  SelectedTtsContextProvider,
  useSelectedTts,
} from "@/app/features/tts/context/selected-tts-context";
export {
  TtsTextFocusContextProvider,
  useTtsTextFocus,
  useTtsTextFocusRef,
} from "@/app/features/tts/context/tts-text-focus-context";
export {
  SelectedTtsProvider,
  useSelectedTtsState,
} from "@/app/features/tts/context/selected-tts-state";
export { createTtsInput } from "@/app/features/tts/lib/create-draft-tts";
export { applyTtsTextChange } from "@/app/features/tts/lib/apply-tts-text-change";
export { applyTtsVoiceChange } from "@/app/features/tts/lib/apply-tts-voice-change";
export {
  getTtsMoveState,
  resolveTtsIndexAfterInsert,
  resolveTtsIndexAfterRemove,
} from "@/app/features/tts/lib/tts-selection";
export { useTtsFormIndex } from "@/app/features/tts/lib/use-tts-form-index";
export {
  getTtsComposeCommandOptions,
  parseTtsComposeInput,
} from "@/app/features/tts/lib/tts-compose-command";
export { createTtsComposeCompletionSource } from "@/app/features/tts/lib/tts-compose-completion";
export { MANUAL_AVATAR_SOURCE } from "@/app/features/tts/lib/avatar-override";
