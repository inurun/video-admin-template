import { useCallback, useEffect, useMemo, useRef } from "react";
import { autocompletion } from "@codemirror/autocomplete";
import { Prec } from "@codemirror/state";
import { EditorView, tooltips } from "@codemirror/view";
import { useForm } from "react-hook-form";
import { useTheme } from "next-themes";
import type { ReactCodeMirrorRef } from "@uiw/react-codemirror";
import type { AvatarOverride, VoiceOption } from "@/_schemas";
import { getVoiceValue } from "@/app/features/editor";
import { useSettings } from "@/app/features/settings";
import { eventMatchesHotkey } from "@/app/features/settings/lib/hotkeys";
import { createTtsComposeCompletionSource, parseTtsComposeInput } from "@/app/features/tts";
import { getComposerHotkeyVoice } from "@/app/components/app-editor/editor-card/tts-list/tts-composer/tts-composer.hotkeys";

type ComposerForm = { text: string; voiceId: string };

export function useTtsComposer({
  initialVoiceId,
  pageId,
  onAppend,
}: {
  initialVoiceId: string;
  pageId: string;
  onAppend: (input: {
    text: string;
    voice: VoiceOption;
    avatar: AvatarOverride | undefined;
  }) => void;
}) {
  const { options, hotkeys, voiceSettings } = useSettings();
  const { resolvedTheme } = useTheme();
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const pageIdRef = useRef(pageId);
  const form = useForm<ComposerForm>({ defaultValues: { text: "", voiceId: initialVoiceId } });
  const voiceId = form.watch("voiceId");
  const voice = options.find((option) => getVoiceValue(option) === voiceId);

  useEffect(() => {
    if (pageIdRef.current === pageId) return;
    pageIdRef.current = pageId;
    form.reset({ text: "", voiceId: initialVoiceId });
  }, [form, initialVoiceId, pageId]);

  const submit = useCallback(() => {
    void form.handleSubmit((values) => {
      const selectedVoice = options.find((option) => getVoiceValue(option) === values.voiceId);
      if (!selectedVoice) {
        form.setError("voiceId", { message: "Voice is required." });
        return;
      }
      const result = parseTtsComposeInput(values.text, selectedVoice);
      if (!result.ok) {
        form.setError("text", { message: result.error });
        return;
      }
      onAppend({ text: result.text, voice: selectedVoice, avatar: result.avatar });
      const editorView = editorRef.current?.view;
      if (editorView && editorView.state.doc.length > 0) {
        editorView.dispatch({
          changes: { from: 0, to: editorView.state.doc.length, insert: "" },
        });
      }
      form.resetField("text", { defaultValue: "" });
      requestAnimationFrame(() => editorRef.current?.view?.focus());
    })();
  }, [form, onAppend, options]);

  const extensions = useMemo(
    () => [
      autocompletion({ override: [createTtsComposeCompletionSource(voice)] }),
      EditorView.lineWrapping,
      tooltips({ parent: document.body }),
      Prec.highest(
        EditorView.domEventHandlers({
          keydown(event) {
            if (event.repeat || event.isComposing) return false;
            if (eventMatchesHotkey(event, hotkeys.addTts)) {
              event.preventDefault();
              submit();
              return true;
            }
            const nextVoice = getComposerHotkeyVoice(event, options, voiceSettings);
            if (!nextVoice) return false;
            event.preventDefault();
            form.setValue("voiceId", getVoiceValue(nextVoice));
            form.clearErrors("voiceId");
            return true;
          },
        }),
      ),
      EditorView.theme({
        "&": { fontSize: "14px", backgroundColor: "transparent" },
        ".cm-scroller": { overflow: "auto" },
        ".cm-content": { padding: "8px 10px" },
        ".cm-focused": { outline: "none" },
        ".cm-tooltip": { zIndex: "60" },
      }),
    ],
    [form, hotkeys.addTts, options, submit, voice, voiceSettings],
  );

  return {
    control: form.control,
    editorRef,
    extensions,
    options,
    submit,
    theme: resolvedTheme === "dark" ? ("dark" as const) : ("light" as const),
    textError: form.formState.errors.text,
    voice,
    voiceId,
  };
}
