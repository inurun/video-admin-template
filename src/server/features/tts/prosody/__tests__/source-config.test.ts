import { describe, expect, it, vi } from "vitest";
import { createG2pItem } from "@/_schemas/__tests__/g2p-fixture";

vi.mock("@/video/config", async () => ({
  ...(await vi.importActual<typeof import("@/video/config")>("@/video/config")),
  speechVoiceConfig: {
    "voicevox::113::": "lily",
  },
}));
vi.mock("@/server/_shared/storage", () => ({
  getProjectTtsDir: (projectPath: string) => `/tts/${projectPath}`,
}));

import { PROSODY_SOURCE } from "../profiles";
import { prosodySourcePath } from "../cache";
import { prosodySourceFor } from "../source-config";

describe("prosodySourceFor", () => {
  it("uses a character's own voice", () => {
    expect(prosodySourceFor({ provider: "voicevox", voiceName: "113" }).voice).toBe("lily");
  });

  it("falls back to the shared voice", () => {
    expect(prosodySourceFor({ provider: "voicevox", voiceName: "3" }).voice).toBe(
      PROSODY_SOURCE.voice,
    );
    expect(prosodySourceFor({ provider: "voicevox" }).voice).toBe(PROSODY_SOURCE.voice);
  });

  it("gives each voice its own reference audio", () => {
    const g2p = createG2pItem("日本語でOK", "日本語:ニホンゴ|で:デ'/ＯＫ:オ'ーケー");
    const anko = prosodySourceFor({ provider: "voicevox", voiceName: "113" });
    const shared = prosodySourceFor({ provider: "voicevox", voiceName: "3" });
    expect(prosodySourcePath("p", g2p, anko)).not.toBe(prosodySourcePath("p", g2p, shared));
    expect(prosodySourcePath("p", g2p, shared)).toBe(
      prosodySourcePath("p", g2p, prosodySourceFor({ provider: "voisona", voiceName: "x" })),
    );
  });
});
