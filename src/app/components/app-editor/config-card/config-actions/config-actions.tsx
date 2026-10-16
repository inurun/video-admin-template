import { Sparkles, Volume2 } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { useConfigTtsActions } from "@/app/components/app-editor/config-card/config-actions/use-config-actions";
import { TtsSettingsDialog } from "@/app/components/app-editor/config-card/tts-settings-dialog/tts-settings-dialog";

function AnalyzeButton({
  disabled,
  isAnalyzing,
  onClick,
}: {
  disabled: boolean;
  isAnalyzing: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="icon"
      variant="secondary"
      disabled={disabled}
      onClick={onClick}
      title={isAnalyzing ? "Regenerating" : "Regenerate"}
      aria-label={isAnalyzing ? "Regenerating" : "Regenerate"}
    >
      <Sparkles className={isAnalyzing ? "animate-pulse" : undefined} />
    </Button>
  );
}

function PreviewButton({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <Button
      type="button"
      size="icon"
      variant="outline"
      disabled={disabled}
      onClick={onClick}
      title="Preview"
      aria-label="Preview"
    >
      <Volume2 />
    </Button>
  );
}

export function ConfigActions() {
  const { analyzeDisabled, analyzeSelected, isAnalyzing, previewDisabled, previewSelected } =
    useConfigTtsActions();

  return (
    <div className="flex flex-wrap gap-2">
      <AnalyzeButton
        disabled={analyzeDisabled}
        isAnalyzing={isAnalyzing}
        onClick={analyzeSelected}
      />
      <PreviewButton disabled={previewDisabled} onClick={previewSelected} />
      <TtsSettingsDialog />
    </div>
  );
}
