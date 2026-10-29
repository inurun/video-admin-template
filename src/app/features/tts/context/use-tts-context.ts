import { useCallback, useRef, useState } from "react";
import { useFormContext } from "react-hook-form";
import { toast } from "sonner";
import { getErrorMessage } from "@/_shared/lib/error-message";
import type { PageFormValues } from "@/app/features/page/model/page-form-schema";
import type { TtsFormValues } from "@/app/features/tts/model/tts-form-schema";
import { useEditor } from "@/app/features/editor";
import {
  useProjectRoute,
  useSelectedPageId,
} from "@/app/features/project/context/project-route-context";
import { requestPreviewSynthesis } from "@/app/features/tts/api/tts-api";
import { getAdjacentTtsContext } from "@/app/features/tts/lib/adjacent-tts-context";
import { canStartTtsAnalyze, isTtsActionReady } from "@/app/features/tts/lib/tts-action";
import { useG2pGenerateMutation } from "@/app/features/tts/swr/use-tts-mutations";
import { resolveTtsSynthesisSettings } from "@/app/features/tts/lib/synthesis-settings";
import { useSettings } from "@/app/features/settings";
import { useEditorSession } from "@/app/features/editor/store/editor-session-store-context";
import { useSelectedTtsState } from "@/app/features/tts/context/selected-tts-state";

function useTtsCommands() {
  const form = useFormContext<PageFormValues>();
  const { isPending: saving } = useEditor();
  const { projectPath } = useProjectRoute();
  const { options } = useSettings();
  const voicePresets = useEditorSession((state) => state.project.voicePresets);
  const { trigger: generateG2p } = useG2pGenerateMutation();
  const pageId = useSelectedPageId();
  const canRunTts = options.length > 0 && !saving;
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const analyzingIdsRef = useRef(new Set<string>());
  const [analyzingIds, setAnalyzingIds] = useState<ReadonlySet<string>>(() => new Set());

  const setAnalyzing = useCallback((ttsId: string, running: boolean) => {
    if (running) {
      analyzingIdsRef.current.add(ttsId);
    } else {
      analyzingIdsRef.current.delete(ttsId);
    }
    setAnalyzingIds(new Set(analyzingIdsRef.current));
  }, []);

  const playPreview = useCallback(async (audioSrc: string) => {
    previewAudioRef.current?.pause();
    const audio = new Audio(audioSrc);
    previewAudioRef.current = audio;
    await audio.play();
  }, []);

  const getTts = useCallback(
    (ttsId: string) => form.getValues("tts").find((item) => item.id === ttsId),
    [form],
  );

  const analyze = useCallback(
    async (ttsId: string) => {
      const item = getTts(ttsId);
      if (!canStartTtsAnalyze(item, canRunTts, pageId, analyzingIdsRef.current) || !pageId) {
        return;
      }

      setAnalyzing(ttsId, true);
      try {
        const result = await generateG2p({
          pageId,
          item: {
            id: item.id,
            text: item.text,
            ...(item.readText === undefined ? {} : { readText: item.readText }),
            provider: item.provider,
            ...getAdjacentTtsContext(form.getValues("tts"), ttsId),
          },
        });
        if (!result) {
          return;
        }

        const tts = form
          .getValues("tts")
          .map((entry) =>
            entry.id === ttsId
              ? ({ ...entry, speech: { ...entry.speech, g2p: result.g2p } } as TtsFormValues)
              : entry,
          );
        form.setValue("tts", tts, { shouldDirty: true });
        if (result.source === "analyze") {
          toast.warning("LLM failed, used analyze");
        } else {
          toast.success("G2P regenerated");
        }
      } finally {
        setAnalyzing(ttsId, false);
      }
    },
    [canRunTts, form, generateG2p, getTts, pageId, setAnalyzing],
  );

  const preview = useCallback(
    async (ttsId: string) => {
      const item = getTts(ttsId);
      if (!isTtsActionReady(item, canRunTts)) {
        return;
      }
      if (!projectPath) {
        throw new Error("Project path is required");
      }
      try {
        const resolvedItem = resolveTtsSynthesisSettings(item, voicePresets);
        const audioSrc = await requestPreviewSynthesis(resolvedItem, projectPath);
        await playPreview(audioSrc);
        toast.success("Preview を再生した。");
      } catch (error) {
        toast.error(getErrorMessage(error, "Preview failed"));
      }
    },
    [canRunTts, getTts, playPreview, projectPath, voicePresets],
  );

  return {
    canRunTts,
    analyzingIds,
    analyze,
    preview,
  };
}

export function useTtsProviderValue() {
  const selection = useSelectedTtsState();
  const { analyzingIds, ...commands } = useTtsCommands();

  return {
    selectedTtsId: selection.selectedTtsId,
    selectTts: (ttsId: string) => selection.selectTts(ttsId),
    clearSelection: () => selection.selectTts(null),
    isAnalyzing: Boolean(selection.selectedTtsId && analyzingIds.has(selection.selectedTtsId)),
    ...commands,
  };
}
