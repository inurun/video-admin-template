import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getErrorMessage } from "@/_shared/lib/error-message";
import { useEditor, useEditorSession } from "@/app/features/editor";
import { useProject } from "@/app/features/project";
import { startPublish } from "@/app/features/publish/api/publish-api";
import { usePublishStateQuery } from "@/app/features/publish/swr/use-publish-query";
import type { RenderState } from "@/app/features/render/api/render-api";
import { useSettings } from "@/app/features/settings";

export type PublishContextValue = {
  alsoPublish: boolean;
  publishState: ReturnType<typeof usePublishStateQuery>["publishState"];
  publishError: string | null;
  publishExecuteDisabled: boolean;
  publishExecuteLabel: string;
  setAlsoPublish: (value: boolean) => void;
  watchRenderForPublish: (renderState: RenderState) => void;
  armPublishAfterRender: () => void;
  resetPublishWatch: () => void;
  handlePublishExecute: () => void;
};

function getPublishExecuteLabel(
  saving: boolean,
  status: ReturnType<typeof usePublishStateQuery>["publishState"]["status"],
  autoSubmit: boolean,
) {
  if (saving) {
    return "Saving";
  }

  if (status === "running") {
    return autoSubmit ? "Posting" : "Publishing";
  }

  return autoSubmit ? "Post" : "Publish";
}

export function usePublishProviderValue(): PublishContextValue {
  const { isPending: saving, save } = useEditor();
  const { autoSubmitPublish, options } = useSettings();
  const pageCount = useEditorSession((state) => state.sequenceOrder.length);
  const { projectPath } = useProject();
  const { publishState, reloadPublishState } = usePublishStateQuery();
  const [alsoPublish, setAlsoPublish] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const intendPublishRef = useRef(false);
  const waitingForRenderSuccessRef = useRef(false);
  const publishStartedForRenderRef = useRef(false);

  const startPublishJob = useCallback(async () => {
    if (!projectPath) {
      throw new Error("Project path is required");
    }

    await startPublish(projectPath, autoSubmitPublish);
    void reloadPublishState();
  }, [autoSubmitPublish, projectPath, reloadPublishState]);

  const resetPublishWatch = useCallback(() => {
    intendPublishRef.current = false;
    waitingForRenderSuccessRef.current = false;
    publishStartedForRenderRef.current = false;
  }, []);

  const armPublishAfterRender = useCallback(() => {
    intendPublishRef.current = alsoPublish;
    waitingForRenderSuccessRef.current = false;
    publishStartedForRenderRef.current = false;
  }, [alsoPublish]);

  const watchRenderForPublish = useCallback(
    (renderState: RenderState) => {
      if (!intendPublishRef.current) {
        return;
      }

      if (renderState.status === "running") {
        waitingForRenderSuccessRef.current = true;
        publishStartedForRenderRef.current = false;
        return;
      }

      if (
        waitingForRenderSuccessRef.current &&
        renderState.status === "success" &&
        !publishStartedForRenderRef.current
      ) {
        publishStartedForRenderRef.current = true;
        waitingForRenderSuccessRef.current = false;
        intendPublishRef.current = false;
        void startPublishJob()
          .then(() => {
            toast.success("Publish を開始した。");
          })
          .catch((error: unknown) => {
            toast.error(getErrorMessage(error, "Publish start failed"));
          });
      }

      if (renderState.status === "error" || renderState.status === "canceled") {
        waitingForRenderSuccessRef.current = false;
        intendPublishRef.current = false;
      }
    },
    [startPublishJob],
  );

  useEffect(() => {
    if (!alsoPublish) {
      resetPublishWatch();
    }
  }, [alsoPublish, resetPublishWatch]);

  const canSave = options.length > 0 && !saving && pageCount > 0;
  const publishExecuteDisabled = !canSave || publishState.status === "running";
  const publishExecuteLabel = getPublishExecuteLabel(
    saving,
    publishState.status,
    autoSubmitPublish,
  );

  const handlePublishExecute = useCallback(() => {
    setPublishError(null);
    resetPublishWatch();
    void (async () => {
      try {
        await save();
      } catch (error) {
        setPublishError(getErrorMessage(error));
        return;
      }

      try {
        await startPublishJob();
        toast.success("Publish を開始した。");
      } catch (error) {
        setPublishError(getErrorMessage(error));
      }
    })();
  }, [resetPublishWatch, save, startPublishJob]);

  return {
    alsoPublish,
    publishState,
    publishError,
    publishExecuteDisabled,
    publishExecuteLabel,
    setAlsoPublish,
    watchRenderForPublish,
    armPublishAfterRender,
    resetPublishWatch,
    handlePublishExecute,
  };
}
