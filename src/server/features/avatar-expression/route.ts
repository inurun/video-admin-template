import { Hono } from "hono";
import { jsonError } from "@/server/_shared/http";
import { getServerEnv } from "@/server/core/env";
import {
  avatarExpressionGenerateRequestSchema,
  avatarExpressionGenerateResponseSchema,
} from "./contract";
import { generateAvatarExpressions } from "./use-case";

export const avatarExpressionApp = new Hono().post("/avatar-expression/generate", async (c) => {
  try {
    const json = avatarExpressionGenerateRequestSchema.parse(await c.req.json());
    return c.json(
      avatarExpressionGenerateResponseSchema.parse(
        await generateAvatarExpressions(getServerEnv(c), json),
      ),
    );
  } catch (error) {
    return jsonError(c, 500, error, "Auto expression failed");
  }
});
