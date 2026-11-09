// fallow-ignore-file unused-export

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { VoiceOption } from "@/_schemas";
import {
  DEFAULT_HOTKEYS,
  normalizeHotkey,
  type AppHotkeys,
} from "@/app/features/settings/lib/hotkeys";
import {
  getDefaultVoiceOptions,
  getDefaultVoiceOrder,
  getDefaultVoiceSettings,
} from "@/app/features/settings/lib/default-voices";
import { mergeCatalogVoices, mergeVoiceOrder } from "@/app/features/settings/lib/settings";

export const SETTINGS_STORAGE_KEY = "remotion-voisona-settings";

export type VoiceSettings = {
  label: string;
  alias: string;
  hotkey: string;
};

export type SettingsSnapshot = {
  voices: VoiceOption[];
  voiceOrder: string[];
  voiceSettings: Record<string, VoiceSettings>;
  hotkeys: AppHotkeys;
  autoSubmitPublish: boolean;
};

type SettingsState = SettingsSnapshot & {
  saveSettings: (settings: SettingsSnapshot) => void;
  mergeFetchedVoices: (voices: VoiceOption[]) => void;
  resetHotkeys: () => void;
};

export function getDefaultSettings(): SettingsSnapshot {
  return {
    voices: getDefaultVoiceOptions(),
    voiceOrder: getDefaultVoiceOrder(),
    voiceSettings: getDefaultVoiceSettings(),
    hotkeys: { ...DEFAULT_HOTKEYS },
    autoSubmitPublish: false,
  };
}

function resolvePersistedSettings(persisted: Partial<SettingsSnapshot>): SettingsSnapshot {
  const defaults = getDefaultSettings();
  const hotkeys = {
    ...DEFAULT_HOTKEYS,
    ...persisted.hotkeys,
  };
  const autoSubmitPublish = persisted.autoSubmitPublish ?? defaults.autoSubmitPublish;

  if (persisted.voiceOrder?.length) {
    return {
      voices: persisted.voices ?? [],
      voiceOrder: persisted.voiceOrder,
      voiceSettings: persisted.voiceSettings ?? {},
      hotkeys,
      autoSubmitPublish,
    };
  }

  if (persisted.voices?.length) {
    return {
      ...mergeCatalogVoices({
        catalog: persisted.voices,
        selectedVoices: defaults.voices,
        voiceOrder: defaults.voiceOrder,
        voiceSettings: defaults.voiceSettings,
      }),
      hotkeys,
      autoSubmitPublish,
    };
  }

  return { ...defaults, hotkeys, autoSubmitPublish };
}

function normalizeHotkeys(hotkeys: AppHotkeys): AppHotkeys {
  return Object.fromEntries(
    (Object.keys(DEFAULT_HOTKEYS) as Array<keyof AppHotkeys>).map((action) => [
      action,
      normalizeHotkey(hotkeys[action]),
    ]),
  ) as AppHotkeys;
}

export function normalizeSettings(settings: SettingsSnapshot): SettingsSnapshot {
  return {
    voices: settings.voices,
    voiceOrder: mergeVoiceOrder(settings.voiceOrder, settings.voices),
    voiceSettings: Object.fromEntries(
      Object.entries(settings.voiceSettings).map(([voiceId, value]) => [
        voiceId,
        {
          label: value.label,
          alias: value.alias?.trim() ?? "",
          hotkey: normalizeHotkey(value.hotkey),
        },
      ]),
    ),
    hotkeys: normalizeHotkeys(settings.hotkeys),
    autoSubmitPublish: settings.autoSubmitPublish,
  };
}

export function hasStoredSettings() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(SETTINGS_STORAGE_KEY) !== null;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...getDefaultSettings(),
      saveSettings: (settings) => {
        set(normalizeSettings(settings));
      },
      mergeFetchedVoices: (voices) => {
        const current = get();
        set(
          mergeCatalogVoices({
            catalog: voices,
            selectedVoices: current.voices,
            voiceOrder: current.voiceOrder,
            voiceSettings: current.voiceSettings,
          }),
        );
      },
      resetHotkeys: () => {
        set({ hotkeys: { ...DEFAULT_HOTKEYS } });
      },
    }),
    {
      name: SETTINGS_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        voices: state.voices,
        voiceOrder: state.voiceOrder,
        voiceSettings: state.voiceSettings,
        hotkeys: state.hotkeys,
        autoSubmitPublish: state.autoSubmitPublish,
      }),
      merge: (persisted, current) => {
        const persistedState = persisted as Partial<SettingsSnapshot>;
        return {
          ...current,
          ...normalizeSettings(resolvePersistedSettings(persistedState)),
        };
      },
    },
  ),
);
