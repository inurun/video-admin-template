import path from "node:path";
import { Hono } from "hono";
import { renderToString } from "react-dom/server";
import { serveFile } from "@/server/_shared/serve-file";
import { layoutHtml } from "@/app/core/layout";
import { getProjectRootHref, parseProjectRoute } from "@/app/features/project/lib/project-route";
import {
  ensureProjectDirs,
  getPublicFilePath,
  InvalidProjectPathError,
  listSavedProjects,
  ProjectNotFoundError,
  readSavedProject,
} from "@/server/_shared/storage";
import { avatarExpressionApp } from "@/server/features/avatar-expression";
import { bgmApp } from "@/server/features/bgm";
import { hfPreviewApp } from "@/server/features/hf-preview";
import { nicoadApp } from "@/server/features/nicoad";
import { niconicoCommentsApp } from "@/server/features/niconico-comments";
import { ogpApp } from "@/server/features/ogp";
import { projectApp } from "@/server/features/project";
import { publishApp } from "@/server/features/publish";
import { renderApp } from "@/server/features/render";
import { ttsApp } from "@/server/features/tts";
import { uploadsApp } from "@/server/features/uploads";
import { voicepeakApp } from "@/server/features/voicepeak";
import { scheduleApp } from "@/server/features/schedule";
import { weatherApp } from "@/server/features/weather";
import { dictionaryApp } from "@/server/features/dictionary/route";

const CONTENT_TYPES = new Map([
  [".gif", "image/gif"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".wav", "audio/wav"],
  [".webp", "image/webp"],
  [".mp3", "audio/mpeg"],
  [".ogg", "audio/ogg"],
  [".aac", "audio/aac"],
  [".flac", "audio/flac"],
  [".mp4", "video/mp4"],
  [".mov", "video/quicktime"],
  [".webm", "video/webm"],
]);

async function servePublicAsset(publicPath: string, request: Request) {
  const filePath = getPublicFilePath(publicPath);
  const ext = path.extname(filePath).toLowerCase();
  return serveFile(filePath, request, CONTENT_TYPES.get(ext) ?? "application/octet-stream");
}

async function resolveRootProjectPath() {
  const projects = await listSavedProjects();
  const project = projects[0];
  if (!project) {
    throw new ProjectNotFoundError("Project not found");
  }

  return getProjectRootHref(project.path);
}

async function assertProjectRouteExists(requestPath: string) {
  const route = parseProjectRoute(requestPath);
  if (route.type === "schedules" || route.type === "dictionary") {
    return;
  }

  if (route.type === "unknown") {
    throw new InvalidProjectPathError("Invalid project path");
  }

  await readSavedProject(route.projectPath);
}

function createApi() {
  return new Hono()
    .route("/", projectApp)
    .route("/", ttsApp)
    .route("/", avatarExpressionApp)
    .route("/", voicepeakApp)
    .route("/", renderApp)
    .route("/", publishApp)
    .route("/", uploadsApp)
    .route("/", bgmApp)
    .route("/", weatherApp)
    .route("/", ogpApp)
    .route("/", nicoadApp)
    .route("/", niconicoCommentsApp)
    .route("/", scheduleApp)
    .route("/", dictionaryApp);
}

export type ApiApp = ReturnType<typeof createApi>;

export const createApp = () => {
  const app = new Hono()
    .route("/api", createApi())
    .route("/", hfPreviewApp)
    .get("/uploads/*", async (c) => {
      try {
        await ensureProjectDirs();
        return await servePublicAsset(c.req.path.replace(/^\/+/u, ""), c.req.raw);
      } catch {
        return new Response("Not found", { status: 404 });
      }
    })
    .get("/tts/*", async (c) => {
      try {
        await ensureProjectDirs();
        return await servePublicAsset(c.req.path.replace(/^\/+/u, ""), c.req.raw);
      } catch {
        return new Response("Not found", { status: 404 });
      }
    })
    .get("/bgm/*", async (c) => {
      try {
        await ensureProjectDirs();
        return await servePublicAsset(c.req.path.replace(/^\/+/u, ""), c.req.raw);
      } catch {
        return new Response("Not found", { status: 404 });
      }
    })
    .get("/favicon.svg", async (c) => {
      try {
        return await servePublicAsset("favicon.svg", c.req.raw);
      } catch {
        return new Response("Not found", { status: 404 });
      }
    })
    .get("/", async (c) => {
      try {
        return c.redirect(await resolveRootProjectPath());
      } catch {
        return c.html(renderToString(layoutHtml), 404);
      }
    })
    .get("*", async (c) => {
      try {
        await assertProjectRouteExists(c.req.path);
        return c.html(renderToString(layoutHtml));
      } catch (error) {
        if (error instanceof InvalidProjectPathError || error instanceof ProjectNotFoundError) {
          return c.html(renderToString(layoutHtml), 404);
        }

        return c.html(renderToString(layoutHtml), 500);
      }
    });

  return app;
};
