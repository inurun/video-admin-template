// fallow-ignore-file unused-export -- helpers are covered by colocated unit tests
import { useCallback, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import type { VoiceOption } from "@/_schemas";
import { voiceOptionSchema } from "@/_schemas";
import {
  APP_HOTKEY_LABELS,
  type AppHotkeyAction,
  type SettingsSnapshot,
  useSettings,
} from "@/app/features/settings";
import { findDuplicateHotkeys, normalizeHotkey } from "@/app/features/settings/lib/hotkeys";
import { mergeVoiceOrder } from "@/app/features/settings/lib/settings";

export type VoiceSettingFormValue = {
  voiceId: string;
  label: string;
  alias: string;
  hotkey: string;
};

export type SettingsFormValues = {
  voices: VoiceOption[];
  voiceOrder: string[];
  voiceSettings: VoiceSettingFormValue[];
  hotkeys: SettingsSnapshot["hotkeys"];
  autoSubmitPublish: boolean;
};

const voiceSettingFormSchema = z.object({
  voiceId: z.string().min(1),
  label: z.string(),
  alias: z.string(),
  hotkey: z.string(),
});

const settingsFormSchema = z
  .object({
    voices: z.array(voiceOptionSchema),
    voiceOrder: z.array(z.string()),
    voiceSettings: z.array(voiceSettingFormSchema),
    hotkeys: z.object({
      save: z.string(),
      analyze: z.string(),
      addTts: z.string(),
      deleteTts: z.string(),
      addPage: z.string(),
      commentsQaDone: z.string(),
    }),
    autoSubmitPublish: z.boolean(),
  })
  .superRefine((values, context) => {
    const appHotkeys = (Object.keys(APP_HOTKEY_LABELS) as AppHotkeyAction[]).map((action) => ({
      path: ["hotkeys", action],
      value: values.hotkeys[action],
    }));
    const voiceHotkeys = values.voiceSettings.map((setting, index) => ({
      path: ["voiceSettings", index, "hotkey"],
      value: setting.hotkey,
    }));
    const entries = [...appHotkeys, ...voiceHotkeys];
    const duplicates = findDuplicateHotkeys(entries.map((entry) => entry.value));

    for (const entry of entries) {
      const hotkey = normalizeHotkey(entry.value);
      if (!hotkey || !duplicates.has(hotkey)) {
        continue;
      }

      context.addIssue({
        code: "custom",
        message: "Hotkey is duplicated.",
        path: entry.path,
      });
    }
  });

export function createFormValues(settings: SettingsSnapshot): SettingsFormValues {
  const existing = Object.entries(settings.voiceSettings).map(([voiceId, value]) => ({
    voiceId,
    label: value.label,
    alias: value.alias ?? "",
    hotkey: value.hotkey,
  }));
  const existingIds = new Set(existing.map((setting) => setting.voiceId));
  const missing = settings.voiceOrder
    .filter((voiceId) => !existingIds.has(voiceId))
    .map((voiceId) => ({ voiceId, label: "", alias: "", hotkey: "" }));

  return {
    voices: settings.voices,
    voiceOrder: mergeVoiceOrder(settings.voiceOrder, settings.voices),
    voiceSettings: [...existing, ...missing],
    hotkeys: settings.hotkeys,
    autoSubmitPublish: settings.autoSubmitPublish,
  };
}

export function toSettingsSnapshot(values: SettingsFormValues): SettingsSnapshot {
  return {
    voices: values.voices,
    voiceOrder: mergeVoiceOrder(values.voiceOrder, values.voices),
    voiceSettings: Object.fromEntries(
      values.voiceSettings.map((setting) => [
        setting.voiceId,
        {
          label: setting.label,
          alias: setting.alias.trim(),
          hotkey: setting.hotkey,
        },
      ]),
    ),
    hotkeys: values.hotkeys,
    autoSubmitPublish: values.autoSubmitPublish,
  };
}

export function useSettingsDialog() {
  const settings = useSettings();
  const [open, setOpen] = useState(false);
  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsFormSchema),
    mode: "onChange",
    defaultValues: createFormValues(settings),
  });

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (nextOpen) {
        form.reset(createFormValues(settings));
      }
    },
    [form, settings],
  );

  const save = form.handleSubmit((formValues) => {
    settings.saveSettings(toSettingsSnapshot(formValues));
    toast.success("Settings saved.");
    setOpen(false);
  });

  return {
    form,
    open,
    canSave: form.formState.isValid,
    handleOpenChange,
    save,
  };
}
