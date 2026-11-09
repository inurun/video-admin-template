import { useCallback } from "react";
import type { UseFormReturn } from "react-hook-form";
import { useWatch } from "react-hook-form";
import type { SettingsFormValues } from "@/app/components/app-sidebar/settings-dialog/use-settings-dialog";

export function usePublishSection(form: UseFormReturn<SettingsFormValues>) {
  const autoSubmit = useWatch({ control: form.control, name: "autoSubmitPublish" });

  const setAutoSubmit = useCallback(
    (checked: boolean) => {
      form.setValue("autoSubmitPublish", checked, { shouldDirty: true, shouldValidate: true });
    },
    [form],
  );

  return { autoSubmit, setAutoSubmit };
}
