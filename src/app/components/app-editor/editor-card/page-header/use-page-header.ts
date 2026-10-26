import { useFormContext, useWatch } from "react-hook-form";
import type { PageFormValues } from "@/app/features/page/model/page-form-schema";
import { useEditorSession } from "@/app/features/editor/store/editor-session-store-context";
import { useSelectedPageId } from "@/app/features/project/context/project-route-context";
import { useCommentZen } from "@/app/components/app-editor/editor-card/page-header/comments-zen-dialog/comments-zen-context";
import {
  listUnansweredCommentGroupIds,
  sortCommentGroupsByFirstCommentTime,
} from "@/app/features/comments";
import { useCallback } from "react";

export function usePageHeader() {
  const selectedPageId = useSelectedPageId();
  const selectedPageType = useEditorSession((state) =>
    selectedPageId ? state.itemsById[selectedPageId]?.type : undefined,
  );
  const commentsZen = useCommentZen();
  const { control, getValues, setValue } = useFormContext<PageFormValues>();
  const commentGroups = useWatch({ control, name: "commentGroups" });
  const commentScenes = useWatch({ control, name: "commentScenes" });
  const groupCount = Array.isArray(commentScenes) ? commentScenes.length : 0;
  const unansweredCount =
    selectedPageType === "comments"
      ? listUnansweredCommentGroupIds({
          commentGroups: commentGroups ?? [],
          commentScenes: commentScenes ?? [],
        }).length
      : 0;

  const sortByTime = useCallback(() => {
    const current = getValues();
    if (current.type !== "comments") {
      return;
    }
    const next = sortCommentGroupsByFirstCommentTime(current);
    setValue("commentGroups", next.commentGroups, { shouldDirty: true, shouldValidate: true });
    setValue("commentScenes", next.commentScenes, { shouldDirty: true, shouldValidate: true });
  }, [getValues, setValue]);

  return {
    selectedPageId,
    isTransition: selectedPageType === "transition",
    supportsAutoExpression: selectedPageType === "main",
    supportsZen: selectedPageType === "main" || selectedPageType === "intro",
    supportsCommentsTools: selectedPageType === "comments",
    openCommentsZen: commentsZen.openZen,
    sortByTime,
    canSort: groupCount > 1,
    canOpenQa: unansweredCount > 0,
  };
}
