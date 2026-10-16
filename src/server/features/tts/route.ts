import { Hono } from "hono";
import { jsonError } from "@/server/_shared/http";
import { getServerEnv } from "@/server/core/env";
import {
  clearTtsCache,
  generateTtsG2p,
  listTtsVoices,
  synthesizeTts,
  validateTtsG2p,
} from "./use-case";
import { TtsCacheClearConflictError } from "@/server/features/tts/errors";
import {
  synthesizeResponseSchema,
  ttsClearCacheRequestSchema,
  ttsG2pGenerateRequestSchema,
  ttsG2pGenerateResponseSchema,
  ttsClearCacheResponseSchema,
  ttsSynthesizeRequestSchema,
  ttsValidateRequestSchema,
  ttsValidateResponseSchema,
  voicesResponseSchema,
} from "./contract";

export const ttsApp = new Hono()
  .get("/voices", async (c) => {
    try {
      return c.json(voicesResponseSchema.parse({ options: await listTtsVoices(getServerEnv(c)) }));
    } catch (error) {
      return jsonError(c, 500, error, "Failed to load voices");
    }
  })
  .post("/tts/g2p/validate", async (c) => {
    try {
      const json = ttsValidateRequestSchema.parse(await c.req.json());
      return c.json(ttsValidateResponseSchema.parse(await validateTtsG2p(getServerEnv(c), json)));
    } catch (error) {
      return jsonError(c, 500, error, "Validate failed");
    }
  })
  .post("/tts/g2p/generate", async (c) => {
    try {
      const json = ttsG2pGenerateRequestSchema.parse(await c.req.json());
      return c.json(
        ttsG2pGenerateResponseSchema.parse(await generateTtsG2p(getServerEnv(c), json)),
      );
    } catch (error) {
      return jsonError(c, 500, error, "G2P generate failed");
    }
  })
  .post("/tts/synthesize", async (c) => {
    try {
      const json = ttsSynthesizeRequestSchema.parse(await c.req.json());
      return c.json(synthesizeResponseSchema.parse(await synthesizeTts(getServerEnv(c), json)));
    } catch (error) {
      return jsonError(c, 500, error, "Synthesize failed");
    }
  })
  .delete("/tts/cache", async (c) => {
    try {
      const json = ttsClearCacheRequestSchema.parse(await c.req.json());
      return c.json(ttsClearCacheResponseSchema.parse(await clearTtsCache(json)));
    } catch (error) {
      if (error instanceof TtsCacheClearConflictError) {
        return jsonError(c, 409, error, error.message);
      }
      return jsonError(c, 500, error, "Failed to clear TTS cache");
    }
  });
