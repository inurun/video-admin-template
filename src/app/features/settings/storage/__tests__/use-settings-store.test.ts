import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VoiceOption } from "@/_schemas";

type StorageMock = {
  clear: () => void;
  getItem: ReturnType<typeof vi.fn>;
  removeItem: ReturnType<typeof vi.fn>;
  setItem: ReturnType<typeof vi.fn>;
};

function createLocalStorageMock(initial: Record<string, string> = {}): StorageMock {
  const store = new Map(Object.entries(initial));

  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    clear: () => {
      store.clear();
    },
  };
}

async function importStoreWithStorage(storage: StorageMock) {
  vi.resetModules();
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", { localStorage: storage });
  return import("../use-settings-store");
}

function voice(voiceName: string, displayName: string, voiceVersion = ""): VoiceOption {
  return { provider: "voisona", voiceName, voiceVersion, displayName };
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("useSettingsStore", () => {
  it("uses default settings when no persisted value exists", async () => {
    const storage = createLocalStorageMock();
    const { DEFAULT_HOTKEYS } = await import("@/app/features/settings/lib/hotkeys");
    const { getDefaultSettings, hasStoredSettings, useSettingsStore } =
      await importStoreWithStorage(storage);
    const defaults = getDefaultSettings();

    expect(hasStoredSettings()).toBe(false);
    expect(useSettingsStore.getState().voices).toEqual(defaults.voices);
    expect(useSettingsStore.getState().voiceOrder).toEqual(defaults.voiceOrder);
    expect(useSettingsStore.getState().voiceSettings).toEqual(defaults.voiceSettings);
    expect(useSettingsStore.getState().hotkeys).toEqual(DEFAULT_HOTKEYS);
  });

  it("seeds default voices when persisted voice order is empty", async () => {
    const { DEFAULT_HOTKEYS } = await import("@/app/features/settings/lib/hotkeys");
    const { getDefaultSettings, useSettingsStore } = await importStoreWithStorage(
      createLocalStorageMock({
        "remotion-voisona-settings": JSON.stringify({
          state: {
            voices: [],
            voiceOrder: [],
            voiceSettings: {},
            hotkeys: { save: "CTRL+S" },
          },
          version: 0,
        }),
      }),
    );
    const defaults = getDefaultSettings();

    expect(useSettingsStore.getState().voiceOrder).toEqual(defaults.voiceOrder);
    expect(useSettingsStore.getState().voices).toEqual(defaults.voices);
    expect(useSettingsStore.getState().hotkeys.save).toBe("ctrl+s");
    expect(useSettingsStore.getState().hotkeys.addTts).toBe(DEFAULT_HOTKEYS.addTts);
  });

  it("keeps a persisted voice order", async () => {
    const { DEFAULT_HOTKEYS } = await import("@/app/features/settings/lib/hotkeys");
    const { SETTINGS_STORAGE_KEY, useSettingsStore } = await importStoreWithStorage(
      createLocalStorageMock({
        "remotion-voisona-settings": JSON.stringify({
          state: {
            voices: [voice("a", "A")],
            voiceOrder: ["voisona::a::"],
            voiceSettings: {
              "voisona::a::": {
                label: "Actor A",
                hotkey: "CTRL+1",
                synthesisSettings: { speed: 1.2 },
              },
            },
            hotkeys: { save: "CTRL+S", analyze: "ctrl+shift+s", addTts: "ctrl+enter" },
          },
          version: 0,
        }),
      }),
    );

    expect(useSettingsStore.getState().voiceSettings["voisona::a::"]?.hotkey).toBe("ctrl+1");
    expect(useSettingsStore.getState().voiceSettings["voisona::a::"]).toEqual({
      label: "Actor A",
      alias: "",
      hotkey: "ctrl+1",
    });
    expect(useSettingsStore.getState().hotkeys.save).toBe("ctrl+s");
    expect(useSettingsStore.getState().hotkeys.deleteTts).toBe(DEFAULT_HOTKEYS.deleteTts);
    expect(useSettingsStore.getState().hotkeys.addPage).toBe(DEFAULT_HOTKEYS.addPage);
    expect(useSettingsStore.getState().hotkeys.commentsQaDone).toBe(DEFAULT_HOTKEYS.commentsQaDone);
    expect(useSettingsStore.getState().autoSubmitPublish).toBe(false);
    expect(useSettingsStore.persist.getOptions().name).toBe(SETTINGS_STORAGE_KEY);
  });

  it("persists saved settings", async () => {
    const storage = createLocalStorageMock();
    const { SETTINGS_STORAGE_KEY, useSettingsStore } = await importStoreWithStorage(storage);

    useSettingsStore.getState().saveSettings({
      voices: [voice("a", "A")],
      voiceOrder: ["voisona::a::"],
      voiceSettings: { "voisona::a::": { label: "Actor A", alias: "", hotkey: "CTRL+1" } },
      hotkeys: {
        save: "CTRL+S",
        analyze: "ctrl+shift+s",
        addTts: "ctrl+enter",
        deleteTts: "CTRL+SHIFT+DELETE",
        addPage: "CTRL+T",
        commentsQaDone: "CTRL+SHIFT+ENTER",
      },
      autoSubmitPublish: true,
    });

    expect(storage.setItem).toHaveBeenCalledWith(
      SETTINGS_STORAGE_KEY,
      expect.stringContaining('"hotkey":"ctrl+1"'),
    );
    expect(storage.setItem).toHaveBeenCalledWith(
      SETTINGS_STORAGE_KEY,
      expect.stringContaining('"deleteTts":"ctrl+shift+delete"'),
    );
    expect(storage.setItem).toHaveBeenCalledWith(
      SETTINGS_STORAGE_KEY,
      expect.stringContaining('"addPage":"ctrl+t"'),
    );
    expect(storage.setItem).toHaveBeenCalledWith(
      SETTINGS_STORAGE_KEY,
      expect.stringContaining('"commentsQaDone":"ctrl+shift+enter"'),
    );
    expect(storage.setItem).toHaveBeenCalledWith(
      SETTINGS_STORAGE_KEY,
      expect.stringContaining('"autoSubmitPublish":true'),
    );
  });

  it("refreshes the catalog without appending unselected voices", async () => {
    const storage = createLocalStorageMock();
    const { useSettingsStore } = await importStoreWithStorage(storage);

    useSettingsStore.getState().saveSettings({
      voices: [voice("a", "A"), voice("b", "B")],
      voiceOrder: ["voisona::b::", "voisona::a::"],
      voiceSettings: { "voisona::b::": { label: "Actor B", alias: "anko", hotkey: "ctrl+2" } },
      hotkeys: {
        save: "ctrl+s",
        analyze: "ctrl+shift+s",
        addTts: "ctrl+enter",
        deleteTts: "ctrl+shift+delete",
        addPage: "ctrl+t",
        commentsQaDone: "ctrl+shift+enter",
      },
      autoSubmitPublish: false,
    });
    useSettingsStore.getState().mergeFetchedVoices([voice("a", "A"), voice("c", "C")]);

    expect(
      useSettingsStore.getState().voices.map((item) => ("voiceName" in item ? item.voiceName : "")),
    ).toEqual(["a", "c", "b"]);
    expect(useSettingsStore.getState().voiceOrder).toEqual(["voisona::b::", "voisona::a::"]);
    expect(useSettingsStore.getState().voiceSettings["voisona::b::"]).toEqual({
      label: "Actor B",
      alias: "anko",
      hotkey: "ctrl+2",
    });
  });

  it("remaps selected voice ids when the catalog includes a version", async () => {
    const storage = createLocalStorageMock();
    const { useSettingsStore } = await importStoreWithStorage(storage);
    const selected = {
      provider: "voicevox" as const,
      voiceName: "3",
      displayName: "ずんだもん / ノーマル",
    };

    useSettingsStore.getState().saveSettings({
      voices: [selected],
      voiceOrder: ["voicevox::3::"],
      voiceSettings: { "voicevox::3::": { label: "🫛 ずんだ", alias: "zunda", hotkey: "ctrl+1" } },
      hotkeys: {
        save: "ctrl+s",
        analyze: "ctrl+shift+s",
        addTts: "ctrl+enter",
        deleteTts: "ctrl+shift+delete",
        addPage: "ctrl+t",
        commentsQaDone: "ctrl+shift+enter",
      },
      autoSubmitPublish: false,
    });
    useSettingsStore.getState().mergeFetchedVoices([{ ...selected, voiceVersion: "0.15.0" }]);

    expect(useSettingsStore.getState().voiceOrder).toEqual(["voicevox::3::0.15.0"]);
    expect(useSettingsStore.getState().voiceSettings["voicevox::3::0.15.0"]).toEqual({
      label: "🫛 ずんだ",
      alias: "zunda",
      hotkey: "ctrl+1",
    });
  });
});
