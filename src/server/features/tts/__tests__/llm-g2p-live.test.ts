import { describe, expect, it } from "vitest";
import { generateG2p } from "../llm-g2p";

const serverEnv = {
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  HAQUMEI_API_URL: process.env.HAQUMEI_API_URL,
};
const enabled =
  process.env.LLM_G2P_LIVE === "1" &&
  Boolean(serverEnv.OPENROUTER_API_KEY?.trim() && serverEnv.HAQUMEI_API_URL?.trim());

describe.skipIf(!enabled)("LLM G2P live", () => {
  it("generates validated v3 kana with the real OpenRouter and haqumei-api", async () => {
    const result = await generateG2p(serverEnv, {
      mode: "page",
      pages: [
        {
          id: "page-1",
          title: "Live",
          utterances: [
            { id: "a", text: "東京は晴れのち曇りです。", target: true },
            { id: "b", text: "辺りには人気がないね。", target: true },
            { id: "c", text: "47とか575って読める？", target: true },
          ],
        },
      ],
    });

    expect(result.get("a")?.g2p.kana).toContain("晴れ:ハ");
    expect(result.get("b")?.g2p.kana).toContain("ヒトケ");
    expect(result.get("c")?.g2p.kana).toContain("フォーティーセブン");
    for (const item of result.values()) {
      expect(item.source).toBe("llm");
    }
  }, 180_000);
});
