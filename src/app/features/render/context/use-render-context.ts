import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { getErrorMessage } from "@/_shared/lib/error-message";
import { useEditor, useEditorSession } from "@/app/features/editor";
import { useProject } from "@/app/features/project";
import {
  useSavedProject,
  useSavedProjectStoreApi,
} from "@/app/features/editor/store/saved-project-store-context";
import { selectHasBackgroundWork } from "@/app/features/editor/store/saved-project-state";
import { usePublish } from "@/app/features/publish";
import { cancelPublish } from "@/app/features/publish/api/publish-api";
import { cancelRender, startRender, type RenderState } from "@/app/features/render/api/render-api";
import { useRenderStateQuery } from "@/app/features/render/swr/use-render-query";
import { useSettings } from "@/app/features/settings";

export type { RenderState };

export type DialogJobPhase = "render" | "publish";

function getRenderExecuteLabel(
  saving: boolean,
  synthesizing: boolean,
  renderStatus: RenderState["status"],
  publishStatus: "error" | "idle" | "running" | "success",
  alsoPublish: boolean,
) {
  if (saving) {
    return "Saving";
  }

  if (synthesizing) {
    return "Preparing audio";
  }

  if (renderStatus === "running") {
    return "Rendering";
  }

  if (alsoPublish && publishStatus === "running") {
    return "Publishing";
  }

  return "Render";
}

export type RenderContextValue = {
  alsoPublish: boolean;
  dialogJobPhase: DialogJobPhase;
  renderState: RenderState;
  publishState: ReturnType<typeof usePublish>["publishState"];
  publishError: string | null;
  publishExecuteDisabled: boolean;
  publishExecuteLabel: string;
  renderDialogOpen: boolean;
  renderError: string | null;
  renderExecuteDisabled: boolean;
  renderExecuteLabel: string;
  cancelDisabled: boolean;
  openRenderDialog: () => void;
  setAlsoPublish: (value: boolean) => void;
  setRenderDialogOpen: (open: boolean) => void;
  handleCancel: () => void;
  handleRenderExecute: () => void;
  handlePublishExecute: () => void;
};

export function useRenderProviderValue(): RenderContextValue {
  const { isPending: saving, save } = useEditor();
  const savedStore = useSavedProjectStoreApi();
  const synthesizing = useSavedProject(selectHasBackgroundWork);
  const { options } = useSettings();
  const pageCount = useEditorSession((state) => state.sequenceOrder.length);
  const { projectPath } = useProject();
  const { renderState, reloadRenderState } = useRenderStateQuery();
  const {
    alsoPublish,
    armPublishAfterRender,
    handlePublishExecute: executePublish,
    publishError,
    publishExecuteDisabled,
    publishExecuteLabel,
    publishState,
    resetPublishWatch,
    setAlsoPublish,
    watchRenderForPublish,
  } = usePublish();
  const [renderDialogOpen, setRenderDialogOpen] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [dialogJobPhase, setDialogJobPhase] = useState<DialogJobPhase>("render");

  useEffect(() => {
    watchRenderForPublish(renderState);
  }, [renderState, watchRenderForPublish]);

  useEffect(() => {
    if (renderState.status === "running") {
      setDialogJobPhase("render");
    }
  }, [renderState.status]);

  useEffect(() => {
    if (publishState.status === "running") {
      setDialogJobPhase("publish");
    }
  }, [publishState.status]);

  const startRenderJob = useCallback(async () => {
    if (!projectPath) {
      throw new Error("Project path is required");
    }

    await startRender(projectPath);
    void reloadRenderState();
  }, [projectPath, reloadRenderState]);

  const canSave = options.length > 0 && !saving && pageCount > 0;
  const isBusy = renderState.status === "running" || publishState.status === "running";
  const renderExecuteDisabled = !canSave || isBusy || synthesizing;
  const renderExecuteLabel = getRenderExecuteLabel(
    saving,
    synthesizing,
    renderState.status,
    publishState.status,
    alsoPublish,
  );

  const openRenderDialog = useCallback(() => {
    setRenderDialogOpen(true);
  }, []);

  const handleRenderExecute = useCallback(() => {
    setRenderError(null);
    setDialogJobPhase("render");
    resetPublishWatch();
    armPublishAfterRender();
    void (async () => {
      try {
        await save();
      } catch (error) {
        setRenderError(getErrorMessage(error));
        return;
      }

      if (selectHasBackgroundWork(savedStore.getState())) {
        setRenderError("音声・表情を準備中。完了後にもう一度Renderしてください。");
        return;
      }

      try {
        await startRenderJob();
        toast.success("Render を開始した。");
      } catch (error) {
        setRenderError(getErrorMessage(error));
      }
    })();
  }, [armPublishAfterRender, resetPublishWatch, save, savedStore, startRenderJob]);

  const handlePublishExecute = useCallback(() => {
    setDialogJobPhase("publish");
    executePublish();
  }, [executePublish]);

  const handleCancel = useCallback(() => {
    void (async () => {
      try {
        if (renderState.status === "running") {
          await cancelRender();
          void reloadRenderState();
          toast.success("Render をキャンセルした。");
          return;
        }

        if (publishState.status === "running") {
          await cancelPublish();
          toast.success("Publish をキャンセルした。");
        }
      } catch (error) {
        toast.error(getErrorMessage(error, "Cancel failed"));
      }
    })();
  }, [publishState.status, reloadRenderState, renderState.status]);

  return {
    alsoPublish,
    cancelDisabled: !isBusy,
    dialogJobPhase,
    renderState,
    publishState,
    publishError,
    publishExecuteDisabled: publishExecuteDisabled || isBusy,
    publishExecuteLabel,
    renderDialogOpen,
    renderError,
    renderExecuteDisabled,
    renderExecuteLabel,
    openRenderDialog,
    setAlsoPublish,
    setRenderDialogOpen,
    handleCancel,
    handleRenderExecute,
    handlePublishExecute,
  };
}
