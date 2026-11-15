import { describe, expect, it, vi } from "vitest";
import { createG2pItem } from "@/_schemas/__tests__/g2p-fixture";

vi.mock("@/video/config", async () => ({
  ...(await vi.importActual<typeof import("@/video/config")>("@/video/config")),
  speechVoiceConfig: {
    voice: "bella",
    defaultTag: "[in a monotone]",
    tags: { "voicevox::113::": "[tired]", "voicevox::14::": "" },
  },
}));
vi.mock("@/server/_shared/storage", () => ({
  getProjectTtsDir: (projectPath: string) => `/tts/${projectPath}`,
}));

import { prosodySourcePath } from "../cache";
import { prosodySourceFor } from "../source-config";

describe("prosodySourceFor", () => {
  it("reads every character with the shared voice", () => {
    expect(prosodySourceFor({ provider: "voicevox", voiceName: "113" }).voice).toBe("bella");
    expect(prosodySourceFor({ provider: "voisona", voiceName: "x" }).voice).toBe("bella");
  });

  it("uses a character's own tag, or the default", () => {
    expect(prosodySourceFor({ provider: "voicevox", voiceName: "113" }).tag).toBe("[tired]");
    expect(prosodySourceFor({ provider: "voicevox", voiceName: "14" }).tag).toBe("");
    expect(prosodySourceFor({ provider: "voicevox", voiceName: "3" }).tag).toBe("[in a monotone]");
    expect(prosodySourceFor({ provider: "voicevox" }).tag).toBe("[in a monotone]");
  });

  it("gives each tag its own reference audio", () => {
    const g2p = createG2pItem("日本語でOK", "日本語:ニホンゴ|で:デ'/ＯＫ:オ'ーケー");
    const anko = prosodySourceFor({ provider: "voicevox", voiceName: "113" });
    const shared = prosodySourceFor({ provider: "voicevox", voiceName: "3" });
    expect(prosodySourcePath("p", g2p, anko)).not.toBe(prosodySourcePath("p", g2p, shared));
    expect(prosodySourcePath("p", g2p, shared)).toBe(
      prosodySourcePath("p", g2p, prosodySourceFor({ provider: "voisona", voiceName: "x" })),
    );
  });
});
