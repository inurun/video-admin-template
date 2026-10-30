import { Hono } from "hono";
import { jsonError } from "@/server/_shared/http";
import { getServerEnv } from "@/server/core/env";
import { g2pReviewContract } from "./contract";
import { getG2pReview, setG2pReviewAlternative, updateG2pReviewItem } from "./use-case";

export const g2pReviewApp = new Hono()
  .get("/g2p-review/:name", async (c) => {
    try {
      return c.json(g2pReviewContract.get.response.parse(await getG2pReview(c.req.param("name"))));
    } catch (error) {
      return jsonError(c, 500, error, "Failed to load review set");
    }
  })
  .post("/g2p-review/:name/items/:id", async (c) => {
    try {
      const json = g2pReviewContract.update.json.parse(await c.req.json());
      return c.json(
        g2pReviewContract.update.response.parse(
          await updateG2pReviewItem(getServerEnv(c), c.req.param("name"), c.req.param("id"), json),
        ),
      );
    } catch (error) {
      return jsonError(c, 500, error, "Failed to update review item");
    }
  })
  .post("/g2p-review/:name/items/:id/alternatives", async (c) => {
    try {
      const json = g2pReviewContract.alternative.json.parse(await c.req.json());
      return c.json(
        g2pReviewContract.alternative.response.parse(
          await setG2pReviewAlternative(c.req.param("name"), c.req.param("id"), json),
        ),
      );
    } catch (error) {
      return jsonError(c, 500, error, "Failed to update alternative");
    }
  });
