import { useProject } from "@/app/features/project";
import { useRender } from "@/app/features/render";
import { useSettings } from "@/app/features/settings";
import {
  getJobStatusLabel,
  getStatusChipClass,
  getVideoHref,
} from "@/app/components/app-header/render-dialog/use-render-dialog.lib";

function getVideoFileName(projectPath: string | null) {
  if (!projectPath) {
    return "latest.mp4";
  }
  const stem = projectPath.split("/").filter(Boolean).at(-1) ?? "project";
  return `${stem}.mp4`;
}

export function useRenderDialog() {
  const { projectPath } = useProject();
  const { autoSubmitPublish } = useSettings();
  const {
    alsoPublish,
    cancelDisabled,
    dialogJobPhase,
    handleCancel,
    handlePublishExecute,
    handleRenderExecute,
    publishError,
    publishExecuteDisabled,
    publishExecuteLabel,
    publishState,
    renderDialogOpen,
    renderError,
    renderExecuteDisabled,
    renderExecuteLabel,
    renderState,
    setAlsoPublish,
    setRenderDialogOpen,
  } = useRender();

  const activeStatus = dialogJobPhase === "publish" ? publishState.status : renderState.status;

  return {
    alsoPublish,
    alsoPublishLabel: autoSubmitPublish ? "Also post after render" : "Also publish after render",
    cancelDisabled,
    dialogJobPhase,
    handleCancel,
    handlePublishExecute,
    handleRenderExecute,
    publishExecuteDisabled,
    publishExecuteLabel,
    publishLogs: publishState.logs,
    renderDialogOpen,
    renderExecuteDisabled,
    renderExecuteLabel,
    renderState,
    setAlsoPublish,
    setRenderDialogOpen,
    statusChipClass: getStatusChipClass(activeStatus),
    statusLabel: getJobStatusLabel(dialogJobPhase, activeStatus),
    videoHref: getVideoHref(renderState),
    videoFileName: getVideoFileName(projectPath),
    publishResultUrl: publishState.resultUrl,
    errorMessage:
      dialogJobPhase === "publish"
        ? (publishError ?? publishState.lastError)
        : (renderError ?? renderState.lastError),
  };
}
