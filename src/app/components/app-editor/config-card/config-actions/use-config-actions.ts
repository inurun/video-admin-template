import { useCallback } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import type { PageFormValues } from "@/app/features/page/model/page-form-schema";
import { hasVoiceIdentity } from "@/_schemas";
import { useSelectedTts, useTts } from "@/app/features/tts";
import { useTtsFormIndex } from "@/app/features/tts/lib/use-tts-form-index";

function isVoiceActionDisabled({
  canRunTts,
  text,
  hasVoice,
}: {
  canRunTts: boolean;
  text?: string;
  hasVoice: boolean;
}) {
  return [canRunTts, Boolean((text ?? "").trim()), hasVoice].some((condition) => !condition);
}

export function useConfigTtsActions() {
  const { analyze, canRunTts, isAnalyzing, preview } = useTts();
  const { ttsId } = useSelectedTts();
  const ttsIndex = useTtsFormIndex(ttsId);
  const { control } = useFormContext<PageFormValues>();
  const ttsItem = useWatch({
    control,
    name: `tts.${Math.max(ttsIndex, 0)}`,
  });
  const actionDisabled =
    ttsIndex < 0 ||
    isVoiceActionDisabled({
      canRunTts,
      text: ttsItem?.text,
      hasVoice: Boolean(ttsItem && hasVoiceIdentity(ttsItem)),
    });

  const analyzeSelected = useCallback(() => {
    void analyze(ttsId);
  }, [analyze, ttsId]);

  const previewSelected = useCallback(() => {
    void preview(ttsId);
  }, [preview, ttsId]);

  return {
    analyzeSelected,
    analyzeDisabled: actionDisabled || isAnalyzing || ttsItem?.provider === "voicepeak",
    isAnalyzing,
    previewDisabled: actionDisabled,
    previewSelected,
  };
}
