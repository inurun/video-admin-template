import { Hono } from "hono";
import { jsonError } from "@/server/_shared/http";
import { getServerEnv } from "@/server/core/env";
import { dictionaryContract } from "./contract";
import {
  analyzeDictionaryText,
  createDictionaryEntry,
  deleteDictionaryEntry,
  getDictionaryEntry,
  listDictionary,
  previewDictionaryEntry,
  updateDictionaryEntry,
} from "./use-case";

function parseId(value: string) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Invalid dictionary entry id");
  return id;
}

export const dictionaryApp = new Hono()
  .get("/dictionary", async (c) => {
    try {
      return c.json(dictionaryContract.list.response.parse(await listDictionary(getServerEnv(c))));
    } catch (error) {
      return jsonError(c, 500, error, "Failed to load dictionary");
    }
  })
  .get("/dictionary/entries/:id", async (c) => {
    try {
      return c.json(
        dictionaryContract.get.response.parse(
          await getDictionaryEntry(getServerEnv(c), parseId(c.req.param("id"))),
        ),
      );
    } catch (error) {
      return jsonError(c, 500, error, "Failed to load dictionary entry");
    }
  })
  .post("/dictionary/entries", async (c) => {
    try {
      const json = dictionaryContract.create.json.parse(await c.req.json());
      return c.json(
        dictionaryContract.create.response.parse(
          await createDictionaryEntry(getServerEnv(c), json),
        ),
        201,
      );
    } catch (error) {
      return jsonError(c, 500, error, "Failed to create dictionary entry");
    }
  })
  .put("/dictionary/entries/:id", async (c) => {
    try {
      const json = dictionaryContract.update.json.parse(await c.req.json());
      return c.json(
        dictionaryContract.update.response.parse(
          await updateDictionaryEntry(getServerEnv(c), parseId(c.req.param("id")), json),
        ),
      );
    } catch (error) {
      return jsonError(c, 500, error, "Failed to update dictionary entry");
    }
  })
  .delete("/dictionary/entries/:id", async (c) => {
    try {
      await deleteDictionaryEntry(getServerEnv(c), parseId(c.req.param("id")));
      return c.body(null, 204);
    } catch (error) {
      return jsonError(c, 500, error, "Failed to delete dictionary entry");
    }
  })
  .post("/dictionary/analyze", async (c) => {
    try {
      const { text } = dictionaryContract.analyze.json.parse(await c.req.json());
      return c.json(
        dictionaryContract.analyze.response.parse(
          await analyzeDictionaryText(getServerEnv(c), text),
        ),
      );
    } catch (error) {
      return jsonError(c, 500, error, "Dictionary analyze failed");
    }
  })
  .post("/dictionary/preview", async (c) => {
    try {
      const { g2p } = dictionaryContract.preview.json.parse(await c.req.json());
      const wav = await previewDictionaryEntry(getServerEnv(c), g2p);
      return new Response(await wav.arrayBuffer(), {
        headers: { "Cache-Control": "no-store", "Content-Type": "audio/wav" },
      });
    } catch (error) {
      return jsonError(c, 500, error, "Dictionary preview failed");
    }
  });
