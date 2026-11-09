import { describe, expect, it } from "vitest";
import type { VoiceOption } from "@/_schemas";
import { DEFAULT_HOTKEYS } from "@/app/features/settings";
import { createFormValues } from "@/app/components/app-sidebar/settings-dialog/use-settings-dialog";
import { createResetHotkeysValues } from "@/app/components/app-sidebar/settings-dialog/hotkeys-section/use-hotkeys-section";

function voice(voiceName: string, displayName: string): VoiceOption {
  return { provider: "voisona", voiceName, voiceVersion: "", displayName };
}

describe("useHotkeysSection helpers", () => {
  it("resets app and voice hotkeys while keeping other voice settings", () => {
    const current = createFormValues({
      voices: [voice("a", "A")],
      voiceOrder: ["voisona::a::"],
      voiceSettings: {
        "voisona::a::": {
          label: "Actor A",
          alias: "zunda",
          hotkey: "ctrl+1",
        },
      },
      hotkeys: {
        save: "ctrl+s",
        analyze: "ctrl+shift+a",
        addTts: "ctrl+enter",
        deleteTts: "ctrl+shift+delete",
        addPage: "ctrl+t",
        commentsQaDone: "ctrl+shift+enter",
      },
      autoSubmitPublish: false,
    });

    expect(createResetHotkeysValues(current)).toEqual({
      ...current,
      hotkeys: { ...DEFAULT_HOTKEYS },
      voiceSettings: [
        {
          voiceId: "voisona::a::",
          label: "Actor A",
          alias: "zunda",
          hotkey: "",
        },
      ],
    });
  });
});
