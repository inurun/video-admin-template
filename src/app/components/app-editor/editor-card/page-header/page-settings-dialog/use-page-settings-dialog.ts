import type {
  CommentsPageFormValues,
  PageFormValues,
} from "@/app/features/page/model/page-form-schema";
import { useCallback, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm, useFormContext } from "react-hook-form";
import {
  applyCommentsPageSettings,
  commentsPageNeedsVideoSwitch,
  commentsStructureKey,
} from "@/app/features/comments";
import { useCommentImport } from "./comment-import/use-comment-import";
import {
  getPageAvatarTypes,
  getPageSettingsTags,
  getSelectedPageSettingsFormValues,
  pageSettingsFormSchema,
  toMainPageMeta,
  toPageSettingsFormValues,
  type PageSettingsFormValues,
} from "./page-settings-dialog.lib";

export function usePageSettingsDialog() {
  const pageForm = useFormContext<PageFormValues>();
  const [open, setOpen] = useState(false);
  const openedStructureKey = useRef("");
  const [applyError, setApplyError] = useState<string | null>(null);

  const form = useForm<PageSettingsFormValues>({
    resolver: zodResolver(pageSettingsFormSchema),
    defaultValues: toPageSettingsFormValues({ title: "", tags: [], presentation: "single" }),
  });
  const {
    fields: tagFields,
    append,
    remove,
  } = useFieldArray({
    control: form.control,
    name: "tags",
  });
  const currentPage = pageForm.getValues();
  const commentsPage = currentPage.type === "comments" ? currentPage : null;
  const mainPage = currentPage.type === "main" ? currentPage : null;
  const avatarTypes = mainPage ? getPageAvatarTypes(mainPage.tts, mainPage.meta.avatars) : [];
  const importer = useCommentImport(commentsPage, open);

  const applyToPage = useCallback(
    (insert: boolean, confirmVideoSwitch = false) => {
      const values = form.getValues();
      const page = pageForm.getValues();
      if (page.type !== "comments") {
        pageForm.setValue("title", values.title, { shouldDirty: true, shouldValidate: true });
        if (page.type === "main") {
          pageForm.setValue("meta", toMainPageMeta(values), {
            shouldDirty: true,
            shouldValidate: true,
          });
        } else {
          pageForm.setValue("meta.tags", getPageSettingsTags(values), {
            shouldDirty: true,
            shouldValidate: true,
          });
        }
        setOpen(false);
        return true;
      }

      const videoId = importer.parsedVideoId;
      const result = applyCommentsPageSettings(
        page,
        openedStructureKey.current,
        {
          title: values.title,
          tags: getPageSettingsTags(values),
          presentation: values.presentation,
          videoId,
          snapshot: importer.snapshot,
          fetchedAt: importer.fetchedAt,
          insertIds: insert && importer.fetchValid ? importer.selectedInsertIds : [],
        },
        { confirmVideoSwitch },
      );
      if (!result.ok) {
        if (result.reason === "video-switch") {
          if (!window.confirm("Switching videos removes existing groups and replies. Continue?")) {
            return false;
          }
          return applyToPage(insert, true);
        }
        setApplyError("Page changed while this dialog was open.");
        return false;
      }
      const next = result.page;
      pageForm.setValue("title", next.title, { shouldDirty: true, shouldValidate: true });
      pageForm.setValue("meta", next.meta, { shouldDirty: true, shouldValidate: true });
      pageForm.setValue("comments", next.comments, { shouldDirty: true, shouldValidate: true });
      pageForm.setValue("commentGroups", next.commentGroups, {
        shouldDirty: true,
        shouldValidate: true,
      });
      pageForm.setValue("commentScenes", next.commentScenes, {
        shouldDirty: true,
        shouldValidate: true,
      });
      pageForm.setValue("tts", next.tts, { shouldDirty: true, shouldValidate: true });
      setOpen(false);
      return true;
    },
    [form, importer, pageForm],
  );

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      setApplyError(null);
      if (!nextOpen) {
        return;
      }

      const page = pageForm.getValues();
      form.reset(getSelectedPageSettingsFormValues(page));
      if (page.type === "comments") {
        openedStructureKey.current = commentsStructureKey(page);
        importer.resetFromPage(page);
      }
    },
    [form, importer, pageForm],
  );

  const submit = form.handleSubmit(() => {
    applyToPage(false);
  });

  const insertSelected = () => {
    if (importer.selectedInsertIds.length === 0) {
      return;
    }
    applyToPage(true);
  };

  const addTag = useCallback(() => {
    append({ value: "" });
  }, [append]);

  return {
    addTag,
    form,
    open,
    removeTag: remove,
    tagFields,
    handleOpenChange,
    submit,
    commentsPage: commentsPage as CommentsPageFormValues | null,
    isMain: mainPage !== null,
    avatarTypes,
    importer,
    applyError,
    insertSelected,
    needsVideoSwitch:
      commentsPage !== null && commentsPageNeedsVideoSwitch(commentsPage, importer.parsedVideoId),
  };
}
