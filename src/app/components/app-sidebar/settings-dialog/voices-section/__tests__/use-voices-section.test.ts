import { describe, expect, it } from "vitest";
import type { VoiceOption } from "@/_schemas";
import { DEFAULT_HOTKEYS, type SettingsSnapshot } from "@/app/features/settings";
import { createFormValues } from "@/app/components/app-sidebar/settings-dialog/use-settings-dialog";
import {
  appendMissingVoiceSettings,
  applyFetchedCatalog,
  getAddVoicesEmptyMessage,
  getAddableVoices,
  getSettingsErrorMessage,
  getVisibleVoices,
  getVoiceSetting,
  getVoiceSettingIndex,
  nextSelectedVoiceIds,
  nextVoiceOrderAfterAdd,
} from "@/app/components/app-sidebar/settings-dialog/voices-section/use-voices-section";

function voice(voiceName: string, displayName: string, voiceVersion = ""): VoiceOption {
  return { provider: "voisona", voiceName, voiceVersion, displayName };
}

function snapshot(partial: Partial<SettingsSnapshot> = {}): SettingsSnapshot {
  return {
    voices: [],
    voiceOrder: [],
    voiceSettings: {},
    hotkeys: { ...DEFAULT_HOTKEYS },
    autoSubmitPublish: false,
    ...partial,
  };
}

describe("useVoicesSection helpers", () => {
  it("lists visible and addable voices from the selected order", () => {
    const values = createFormValues(
      snapshot({
        voices: [voice("a", "A"), voice("b", "B"), voice("c", "C")],
        voiceOrder: ["voisona::b::", "voisona::a::"],
      }),
    );

    expect(
      getVisibleVoices(values).map((item) => ("voiceName" in item ? item.voiceName : "")),
    ).toEqual(["b", "a"]);
    expect(
      getAddableVoices(values).map((item) => ("voiceName" in item ? item.voiceName : "")),
    ).toEqual(["c"]);
  });

  it("drops stale selected ids when applying a fetched catalog", () => {
    expect(
      applyFetchedCatalog({ voiceOrder: ["voisona::b::", "voisona::a::"] }, [
        voice("a", "A"),
        voice("c", "C"),
      ]),
    ).toEqual({
      voices: [voice("a", "A"), voice("c", "C")],
      voiceOrder: ["voisona::a::"],
      voiceSettings: [],
    });
  });

  it("appends newly selected voices and reuses existing settings", () => {
    const current = createFormValues(
      snapshot({
        voices: [voice("a", "A"), voice("b", "B")],
        voiceOrder: ["voisona::a::"],
        voiceSettings: {
          "voisona::b::": { label: "Actor B", alias: "", hotkey: "ctrl+2" },
        },
      }),
    );
    const nextIds = nextVoiceOrderAfterAdd(current.voiceOrder, ["voisona::b::", "voisona::a::"]);

    expect(nextIds).toEqual(["voisona::b::"]);
    expect(appendMissingVoiceSettings(current, nextIds)).toEqual([
      {
        voiceId: "voisona::b::",
        label: "Actor B",
        alias: "",
        hotkey: "ctrl+2",
      },
      { voiceId: "voisona::a::", label: "", alias: "", hotkey: "" },
    ]);
  });

  it("toggles checkbox selection for the add dialog", () => {
    expect(nextSelectedVoiceIds([], "voisona::a::", true)).toEqual(["voisona::a::"]);
    expect(nextSelectedVoiceIds(["voisona::a::"], "voisona::a::", true)).toEqual(["voisona::a::"]);
    expect(nextSelectedVoiceIds(["voisona::a::"], "voisona::a::", false)).toEqual([]);
  });

  it("resolves voice setting lookups for editors", () => {
    const values = createFormValues(
      snapshot({
        voices: [voice("a", "A")],
        voiceOrder: ["voisona::a::"],
        voiceSettings: {
          "voisona::a::": {
            label: "Actor A",
            alias: "zunda",
            hotkey: "ctrl+1",
          },
        },
      }),
    );

    expect(getVoiceSettingIndex(values, "voisona::a::")).toBe(0);
    expect(getVoiceSettingIndex(values, "missing")).toBe(-1);
    expect(getVoiceSetting(values, "voisona::a::")).toEqual({
      voiceId: "voisona::a::",
      label: "Actor A",
      alias: "zunda",
      hotkey: "ctrl+1",
    });
    expect(getVoiceSetting(values, "missing")).toEqual({
      voiceId: "missing",
      label: "",
      alias: "",
      hotkey: "",
    });
  });

  it("returns add dialog empty messages", () => {
    expect(
      getAddVoicesEmptyMessage({ isLoadingCatalog: true, addableCount: 0, catalogCount: 0 }),
    ).toBe("Loading voices...");
    expect(
      getAddVoicesEmptyMessage({ isLoadingCatalog: false, addableCount: 2, catalogCount: 3 }),
    ).toBeNull();
    expect(
      getAddVoicesEmptyMessage({ isLoadingCatalog: false, addableCount: 0, catalogCount: 0 }),
    ).toBe("No voices.");
    expect(
      getAddVoicesEmptyMessage({ isLoadingCatalog: false, addableCount: 0, catalogCount: 3 }),
    ).toBe("All voices added.");
  });

  it("formats settings action errors", () => {
    expect(getSettingsErrorMessage(new Error("boom"))).toBe("boom");
    expect(getSettingsErrorMessage("nope")).toBe("Settings action failed");
  });
});
