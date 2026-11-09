import type { Context } from "hono";
import { Hono } from "hono";
import { InvalidProjectPathError, ProjectNotFoundError } from "@/server/_shared/storage";
import { jsonError } from "@/server/_shared/http";
import { cancelPublish, readPublishSnapshot, startPublish } from "./publish-state";
import {
  publishCancelResponseSchema,
  publishSnapshotSchema,
  publishStartRequestSchema,
  publishStartResponseSchema,
} from "./contract";
import { createPublishStream } from "./publish-stream";

function getPublishStartErrorStatus(error: unknown) {
  if (error instanceof InvalidProjectPathError) {
    return 400;
  }

  if (error instanceof ProjectNotFoundError) {
    return 404;
  }

  return 500;
}

function createPublishStartErrorResponse(c: Context, error: unknown) {
  const status = getPublishStartErrorStatus(error);
  return jsonError(c, status, error, "Publish start failed");
}

function isPublishConflict(result: { started: boolean }) {
  return !result.started;
}

export const publishApp = new Hono()
  .get("/publish", async (c) => {
    try {
      return c.json(publishSnapshotSchema.parse(await readPublishSnapshot()));
    } catch (error) {
      return jsonError(c, 500, error, "Failed to load publish state");
    }
  })
  .post("/publish", async (c) => {
    try {
      const payload = publishStartRequestSchema.parse(await c.req.json());
      const result = publishStartResponseSchema.parse(
        await startPublish(payload.projectPath, payload.autoSubmit),
      );
      if (isPublishConflict(result)) {
        return c.json({ error: "Publish is already running.", ...result }, 409);
      }
      return c.json(result);
    } catch (error) {
      return createPublishStartErrorResponse(c, error);
    }
  })
  .post("/publish/cancel", async (c) => {
    try {
      return c.json(publishCancelResponseSchema.parse(await cancelPublish()));
    } catch (error) {
      return jsonError(c, 500, error, "Publish cancel failed");
    }
  })
  .get("/publish/stream", async (c) => {
    return new Response(createPublishStream(c.req.raw.signal), {
      headers: {
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream",
      },
    });
  });
