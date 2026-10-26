import { useCallback, useState } from "react";
import { useFormContext } from "react-hook-form";
import { toast } from "sonner";
import type { PageFormValues } from "@/app/features/page/model/page-form-schema";
import { useProjectRoute } from "@/app/features/project/context/project-route-context";
import {
  requestAvatarExpressions,
  toAvatarExpressionPage,
  toAvatarExpressionWrites,
} from "@/app/features/avatar-expression";

export function useAutoExpressionButton() {
  const { getValues, setValue } = useFormContext<PageFormValues>();
  const { projectPath } = useProjectRoute();
  const [pending, setPending] = useState(false);

  /** Redoes every turn, hand-set ones included; saving already fills turns whose text changed. */
  const run = useCallback(async () => {
    const values = getValues();
    if (!projectPath || values.type !== "main") {
      return;
    }
    setPending(true);
    try {
      const response = await requestAvatarExpressions({
        projectPath,
        page: toAvatarExpressionPage(values),
      });
      const current = getValues();
      if (current.type !== "main" || current.id !== values.id) {
        return;
      }
      const writes = toAvatarExpressionWrites(current, response);
      setValue("meta.avatars", writes.avatars, { shouldDirty: true });
      for (const { index, avatar, avatarSource } of writes.tts) {
        setValue(`tts.${index}.avatar`, avatar, { shouldDirty: true });
        setValue(`tts.${index}.avatarSource`, avatarSource, { shouldDirty: true });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Auto expression failed");
    } finally {
      setPending(false);
    }
  }, [getValues, projectPath, setValue]);

  return { pending, run };
}
