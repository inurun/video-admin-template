import { describe, expect, it } from "vitest";
import type { VoiceOption } from "@/_schemas";
import { DEFAULT_HOTKEYS, type SettingsSnapshot } from "@/app/features/settings";
import {
  createFormValues,
  toSettingsSnapshot,
} from "@/app/components/app-sidebar/settings-dialog/use-settings-dialog";

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

describe("useSettingsDialog helpers", () => {
  it("creates form values for selected voices only", () => {
    const values = createFormValues(
      snapshot({
        voices: [voice("a", "A"), voice("b", "B"), voice("c", "C")],
        voiceOrder: ["voisona::b::", "voisona::a::"],
        voiceSettings: {
          "voisona::b::": { label: "Kept", alias: "", hotkey: "ctrl+2" },
        },
      }),
    );

    expect(values.voiceOrder).toEqual(["voisona::b::", "voisona::a::"]);
    expect(values.voiceSettings).toEqual([
      {
        voiceId: "voisona::b::",
        label: "Kept",
        alias: "",
        hotkey: "ctrl+2",
      },
      { voiceId: "voisona::a::", label: "", alias: "", hotkey: "" },
    ]);
  });

  it("round-trips form values into a settings snapshot", () => {
    const values = createFormValues(
      snapshot({
        voices: [voice("a", "A"), voice("b", "B")],
        voiceOrder: ["voisona::a::"],
        voiceSettings: {
          "voisona::a::": { label: "Actor A", alias: "zunda", hotkey: "ctrl+1" },
          "voisona::b::": { label: "Actor B", alias: "", hotkey: "ctrl+2" },
        },
      }),
    );

    expect(toSettingsSnapshot(values)).toEqual({
      voices: [voice("a", "A"), voice("b", "B")],
      voiceOrder: ["voisona::a::"],
      voiceSettings: {
        "voisona::a::": {
          label: "Actor A",
          alias: "zunda",
          hotkey: "ctrl+1",
        },
        "voisona::b::": {
          label: "Actor B",
          alias: "",
          hotkey: "ctrl+2",
        },
      },
      hotkeys: DEFAULT_HOTKEYS,
      autoSubmitPublish: false,
    });
  });
});
