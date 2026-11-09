import { useCallback, useMemo } from "react";
import { fetchVoices } from "@/app/features/settings/api/settings-api";
import { getDefaultVoice, getVisibleVoiceOptions } from "@/app/features/settings/lib/settings";
import type { SettingsSnapshot } from "@/app/features/settings/storage/use-settings-store";
import { useSettingsStore } from "@/app/features/settings/storage/use-settings-store";

export type SettingsContextValue = SettingsSnapshot & {
  options: ReturnType<typeof getVisibleVoiceOptions>;
  defaultVoice: ReturnType<typeof getDefaultVoice>;
  loadVoices: () => Promise<void>;
  saveSettings: (settings: SettingsSnapshot) => void;
  resetHotkeys: () => void;
};

export function useSettingsProviderValue(): SettingsContextValue {
  const voices = useSettingsStore((state) => state.voices);
  const voiceOrder = useSettingsStore((state) => state.voiceOrder);
  const voiceSettings = useSettingsStore((state) => state.voiceSettings);
  const hotkeys = useSettingsStore((state) => state.hotkeys);
  const autoSubmitPublish = useSettingsStore((state) => state.autoSubmitPublish);
  const mergeFetchedVoices = useSettingsStore((state) => state.mergeFetchedVoices);
  const saveSettings = useSettingsStore((state) => state.saveSettings);
  const resetHotkeys = useSettingsStore((state) => state.resetHotkeys);

  const options = useMemo(
    () => getVisibleVoiceOptions({ voiceOrder, voiceSettings, voices }),
    [voiceOrder, voiceSettings, voices],
  );
  const defaultVoice = getDefaultVoice(options);

  const loadVoices = useCallback(async () => {
    const result = await fetchVoices();
    mergeFetchedVoices(result.options);
  }, [mergeFetchedVoices]);

  return {
    voices,
    voiceOrder,
    voiceSettings,
    hotkeys,
    autoSubmitPublish,
    options,
    defaultVoice,
    loadVoices,
    saveSettings,
    resetHotkeys,
  };
}
