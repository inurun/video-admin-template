import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";

import {
  savedProjectSchema,
  savedSchedulesSchema,
  savedTimelineSchema,
  SEQUENCE_TRACK_ID,
  voicePresetId,
  hasVoiceIdentity,
  DEFAULT_PROJECT_META,
  type SavedProject,
  type SavedSchedules,
  type SavedTimeline,
  type VoicePreset,
} from "@/_schemas";
import {
  projectFileSummarySchema,
  type ProjectFileSummary,
} from "@/server/features/project/contract";
import { toTimeline } from "@/server/features/project/to-timeline";
import { measureBgmDurations } from "@/server/features/bgm/bgm-durations";
import { audioConfig } from "@/video/config";
import { normalizeProjectMeta } from "@/server/features/project/normalize-project-meta";

export const PROJECT_ROOT = process.cwd();
const DATA_DIR = path.join(PROJECT_ROOT, "data");
export const PUBLIC_DIR = path.join(PROJECT_ROOT, "public");
export const TTS_DIR = path.join(PUBLIC_DIR, "tts");
export const UPLOADS_DIR = path.join(PUBLIC_DIR, "uploads");
export const MUSICS_DIR = path.join(PUBLIC_DIR, "bgm");
export const OUT_DIR = path.join(PROJECT_ROOT, "out");
export const PUBLISH_STATE_PATH = path.join(DATA_DIR, "publish-state.json");
export const SCHEDULES_PATH = path.join(DATA_DIR, "schedules.json");
export const ADVERTISERS_PATH = path.join(DATA_DIR, "advertisers.json");
export const LATEST_VIDEO_PATH = path.join(OUT_DIR, "latest.mp4");
export const LATEST_THUMBNAIL_PATH = path.join(OUT_DIR, "thumbnail.png");

const DEFAULT_PROJECT_PATH = "project";
const PROJECT_FILE_EXTENSION = ".json";
const TIMELINE_FILE_SUFFIX = ".timeline.json";
const PROJECT_LIST_EXCLUDE = new Set([
  path.basename(PUBLISH_STATE_PATH),
  path.basename(SCHEDULES_PATH),
  path.basename(ADVERTISERS_PATH),
  "render-state.json",
]);
const INVALID_PROJECT_PATH_MESSAGE = "Invalid project path";

export class InvalidProjectPathError extends Error {}

export class ProjectNotFoundError extends Error {}

export class ProjectAlreadyExistsError extends Error {}

function createInitialSavedProject() {
  return savedProjectSchema.parse({
    meta: { ...DEFAULT_PROJECT_META, title: DEFAULT_PROJECT_PATH },
    bgm: [],
    pages: [
      {
        id: "page-1",
        title: "Page 1",
        type: "main",
        padBeforeSec: 0,
        padAfterSec: 0,
        richText:
          "<h1>HyperFrames + VoiSona Template</h1><p>このテンプレをベースに本文と読み上げを編集できる。</p>",
        tts: [
          {
            id: "tts-1",
            provider: "voisona",
            text: "このテンプレをベースに本文と読み上げを編集できる。",
            readText: "このテンプレをベースにほんぶんとよみあげをへんしゅうできる。",
            voiceName: "",
            voiceVersion: "",
            audio: {
              status: "ready",
              src: "",
              durationSec: 0,
            },
            speech: {},
          },
        ],
      },
    ],
  });
}

function throwInvalidProjectPath() {
  throw new InvalidProjectPathError(INVALID_PROJECT_PATH_MESSAGE);
}

function normalizeProjectPathSegment(segment: string) {
  const value = segment.trim();
  assertSegmentHasContent(value);
  assertSegmentHasNoNullByte(value);
  assertSegmentHasNoPathSeparator(value);
  return value;
}

function assertSegmentHasContent(segment: string) {
  if (!segment || segment === "." || segment === "..") {
    throwInvalidProjectPath();
  }
}

function assertSegmentHasNoNullByte(segment: string) {
  if (segment.includes("\0")) {
    throwInvalidProjectPath();
  }
}

function assertSegmentHasNoPathSeparator(segment: string) {
  if (segment.includes(path.sep) || segment.includes("/")) {
    throwInvalidProjectPath();
  }
}

export function normalizeProjectPath(projectPath: string) {
  const normalized = projectPath
    .split("/")
    .filter(Boolean)
    .map(normalizeProjectPathSegment)
    .join("/");

  if (!normalized || normalized.endsWith(PROJECT_FILE_EXTENSION)) {
    throwInvalidProjectPath();
  }

  return normalized;
}

export function getProjectFileStem(projectPath: string) {
  return normalizeProjectPath(projectPath).split("/").filter(Boolean).at(-1) ?? "project";
}

export function getProjectOutputVideoFileName(projectPath: string) {
  return `${getProjectFileStem(projectPath)}.mp4`;
}

export function getProjectOutputVideoPath(projectPath: string) {
  return path.join(OUT_DIR, getProjectOutputVideoFileName(normalizeProjectPath(projectPath)));
}

export function getProjectTtsDir(projectPath: string) {
  return path.join(TTS_DIR, normalizeProjectPath(projectPath));
}

export function getProjectUploadsDir(projectPath: string) {
  return path.join(UPLOADS_DIR, normalizeProjectPath(projectPath));
}

export function toProjectTtsSrc(projectPath: string, fileName: string) {
  return `/tts/${normalizeProjectPath(projectPath)}/${fileName}`;
}

export function toProjectUploadsSrc(projectPath: string, fileName: string) {
  return `/uploads/${normalizeProjectPath(projectPath)}/${fileName}`;
}

export function resolvePublicAssetPath(src: string) {
  return getPublicFilePath(src.replace(/^\/+/u, ""));
}

export function isProjectTtsSrc(src: string, projectPath: string) {
  const prefix = `/tts/${normalizeProjectPath(projectPath)}/`;
  return src.startsWith(prefix) && !src.slice(prefix.length).includes("..");
}

export async function clearProjectTtsCache(projectPath: string) {
  await fs.rm(getProjectTtsDir(projectPath), { recursive: true, force: true });
}

function createProjectFilePath(projectPath: string) {
  const normalizedPath = normalizeProjectPath(projectPath);
  const filePath = path.resolve(DATA_DIR, `${normalizedPath}${PROJECT_FILE_EXTENSION}`);
  const dataRoot = `${DATA_DIR}${path.sep}`;

  if (!filePath.startsWith(dataRoot)) {
    throwInvalidProjectPath();
  }

  return filePath;
}

function createTimelineFilePath(projectPath: string) {
  const projectFilePath = createProjectFilePath(projectPath);
  return projectFilePath.slice(0, -PROJECT_FILE_EXTENSION.length) + TIMELINE_FILE_SUFFIX;
}

function coerceVoicePresets(value: unknown) {
  if (!Array.isArray(value)) {
    return value;
  }

  return Object.fromEntries(
    value.flatMap((preset) => {
      if (!preset || typeof preset !== "object") {
        return [];
      }
      const record = preset as VoicePreset;
      if (!hasVoiceIdentity(record)) {
        return [];
      }
      return [[voicePresetId(record), record] as const];
    }),
  );
}

function legacyPreviousTimeline(raw: unknown): SavedTimeline | undefined {
  if (!raw || typeof raw !== "object" || !("pages" in raw) || !Array.isArray(raw.pages)) {
    return undefined;
  }

  const clips = raw.pages.flatMap((page) => {
    if (!page || typeof page !== "object" || !("id" in page)) {
      return [];
    }
    const durationSec =
      "durationSec" in page && typeof page.durationSec === "number" ? page.durationSec : undefined;
    if (durationSec === undefined) {
      return [];
    }
    return [
      {
        id: String(page.id),
        startSec: 0,
        durationSec,
        clips: [],
      },
    ];
  });

  if (clips.length === 0) {
    return undefined;
  }

  return {
    durationSec: 0,
    tracks: [{ id: SEQUENCE_TRACK_ID, clips }],
  };
}

function parseSavedProject(raw: unknown) {
  const record = raw && typeof raw === "object" ? { ...raw } : raw;
  if (record && typeof record === "object" && "voicePresets" in record) {
    return savedProjectSchema.parse({
      ...record,
      voicePresets: coerceVoicePresets(record.voicePresets),
    });
  }
  return savedProjectSchema.parse(record);
}

async function readTimelineFile(projectPath: string) {
  try {
    const content = await fs.readFile(createTimelineFilePath(projectPath), "utf8");
    return savedTimelineSchema.parse(JSON.parse(content));
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code === "ENOENT" ||
      error instanceof SyntaxError ||
      error instanceof ZodError
    ) {
      return undefined;
    }
    throw error;
  }
}

function isSameJson(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function didProjectMetaChange(left: SavedProject["meta"], right: SavedProject["meta"]) {
  return (
    left.title !== right.title ||
    left.description !== right.description ||
    left.width !== right.width ||
    left.height !== right.height ||
    left.updatedAt !== right.updatedAt ||
    !isSameJson(left.weather, right.weather) ||
    !isSameJson(left.niconico, right.niconico)
  );
}

function toProjectSummary(relativePath: string, updatedAt: number): ProjectFileSummary {
  const pathWithoutExtension = relativePath.slice(0, -PROJECT_FILE_EXTENSION.length);
  const segments = pathWithoutExtension.split(path.sep).filter(Boolean);
  const name = segments[segments.length - 1];

  return projectFileSummarySchema.parse({
    path: segments.join("/"),
    name,
    segments,
    updatedAt: Math.trunc(updatedAt),
  });
}

function shouldIncludeProjectFile(entryName: string, isFile: boolean) {
  return (
    isFile &&
    entryName.endsWith(PROJECT_FILE_EXTENSION) &&
    !entryName.endsWith(TIMELINE_FILE_SUFFIX) &&
    !PROJECT_LIST_EXCLUDE.has(entryName)
  );
}

function getProjectSummaryUpdatedAt(content: string, fallbackMs: number) {
  try {
    const parsed = JSON.parse(content) as { meta?: { updatedAt?: unknown } };
    const timestamp = Date.parse(
      typeof parsed.meta?.updatedAt === "string" ? parsed.meta.updatedAt : "",
    );
    return Number.isFinite(timestamp) ? timestamp : fallbackMs;
  } catch {
    return fallbackMs;
  }
}

async function readProjectSummaryFile(relativePath: string, absolutePath: string) {
  const stats = await fs.stat(absolutePath);
  try {
    const content = await fs.readFile(absolutePath, "utf8");
    return toProjectSummary(relativePath, getProjectSummaryUpdatedAt(content, stats.mtimeMs));
  } catch {
    return toProjectSummary(relativePath, stats.mtimeMs);
  }
}

async function readProjectSummary(projectPath: string) {
  const filePath = createProjectFilePath(projectPath);
  const relativePath = `${normalizeProjectPath(projectPath)}${PROJECT_FILE_EXTENSION}`;
  return readProjectSummaryFile(relativePath, filePath);
}

async function collectProjectEntrySummaries(
  entry: Dirent,
  dirPath: string,
  nestedPath: string,
): Promise<ProjectFileSummary[]> {
  const entryName = entry.name.toString();
  const relativePath = nestedPath ? path.join(nestedPath, entryName) : entryName;
  const absolutePath = path.join(dirPath, entryName);

  if (entry.isDirectory()) {
    return collectProjectFiles(absolutePath, relativePath);
  }

  if (!shouldIncludeProjectFile(entryName, entry.isFile())) {
    return [];
  }

  return [await readProjectSummaryFile(relativePath, absolutePath)];
}

function sortProjectsByUpdatedAt(projects: ProjectFileSummary[]) {
  return projects.sort((left, right) => right.updatedAt - left.updatedAt);
}

async function collectProjectFiles(
  dirPath: string,
  nestedPath = "",
): Promise<ProjectFileSummary[]> {
  const entries = await fs.readdir(dirPath, { encoding: "utf8", withFileTypes: true });
  const nestedSummaries = await Promise.all(
    entries.map((entry) => collectProjectEntrySummaries(entry, dirPath, nestedPath)),
  );
  return sortProjectsByUpdatedAt(nestedSummaries.flat());
}

async function ensureDefaultProjectFile() {
  const projectPath = createProjectFilePath(DEFAULT_PROJECT_PATH);

  try {
    await fs.access(projectPath);
  } catch {
    await writeSavedProject(DEFAULT_PROJECT_PATH, createInitialSavedProject());
  }
}

export async function ensureProjectDirs() {
  await Promise.all([
    fs.mkdir(DATA_DIR, { recursive: true }),
    fs.mkdir(PUBLIC_DIR, { recursive: true }),
    fs.mkdir(TTS_DIR, { recursive: true }),
    fs.mkdir(UPLOADS_DIR, { recursive: true }),
    fs.mkdir(MUSICS_DIR, { recursive: true }),
    fs.mkdir(OUT_DIR, { recursive: true }),
  ]);
}

export async function listSavedProjects() {
  await ensureProjectDirs();
  const files = await collectProjectFiles(DATA_DIR);
  if (files.length > 0) {
    return files;
  }

  await ensureDefaultProjectFile();
  return collectProjectFiles(DATA_DIR);
}

export async function readSavedProjectDocument(projectPath: string) {
  await ensureProjectDirs();
  const filePath = createProjectFilePath(projectPath);

  try {
    const content = await fs.readFile(filePath, "utf8");
    const raw: unknown = JSON.parse(content);
    const parsed = parseSavedProject(raw);
    const project = savedProjectSchema.parse({
      ...parsed,
      meta: normalizeProjectMeta(parsed.meta, {
        titleFallback: getProjectFileStem(projectPath),
      }),
    });
    const existing = await readTimelineFile(projectPath);
    const timeline = toTimeline(
      project,
      existing ?? legacyPreviousTimeline(raw),
      await measureBgmDurations(bgmSrcs(project), MUSICS_DIR),
      audioConfig.bgm.scenes,
    );
    if (didProjectMetaChange(parsed.meta, project.meta)) {
      await writeJsonAtomic(filePath, project);
    }
    if (!existing || !isSameJson(existing, timeline)) {
      await writeJsonAtomic(createTimelineFilePath(projectPath), timeline);
    }
    return { project, timeline };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new ProjectNotFoundError(`Project not found: ${projectPath}`);
    }
    throw error;
  }
}

/** Parses a project file as saved, without touching its timeline or meta. */
export async function readSavedProjectFile(projectPath: string): Promise<SavedProject> {
  const content = await fs.readFile(createProjectFilePath(projectPath), "utf8");
  return parseSavedProject(JSON.parse(content));
}

export async function readSavedProject(projectPath: string): Promise<SavedProject> {
  const { project } = await readSavedProjectDocument(projectPath);
  return project;
}

export async function readSavedTimeline(projectPath: string): Promise<SavedTimeline> {
  const { timeline } = await readSavedProjectDocument(projectPath);
  return timeline;
}

/** Every BGM file the timeline may loop: the project's tracks and the scene music. */
function bgmSrcs(project: SavedProject) {
  return [
    ...project.bgm.map((track) => track.src),
    ...audioConfig.bgm.scenes.map((scene) => scene.src),
  ];
}

export function createProjectWriteTempPath(filePath: string) {
  return `${filePath}.${process.pid}.${randomUUID()}.tmp`;
}

async function writeJsonAtomic(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = createProjectWriteTempPath(filePath);
  try {
    await fs.writeFile(tempPath, JSON.stringify(value, null, 2));
    await fs.rename(tempPath, filePath);
  } catch (error) {
    try {
      await fs.rm(tempPath, { force: true });
    } catch {
      // ignore cleanup errors
    }
    throw error;
  }
}

export async function writeSavedProject(
  projectPath: string,
  project: SavedProject,
  previousTimeline?: SavedTimeline,
) {
  await ensureProjectDirs();
  const timeline = toTimeline(
    project,
    previousTimeline,
    await measureBgmDurations(bgmSrcs(project), MUSICS_DIR),
    audioConfig.bgm.scenes,
  );
  await writeJsonAtomic(createProjectFilePath(projectPath), project);
  await writeJsonAtomic(createTimelineFilePath(projectPath), timeline);
  return { project, timeline };
}

function createEmptySchedules() {
  return savedSchedulesSchema.parse({ items: [] });
}

export async function readSavedSchedules(): Promise<SavedSchedules> {
  await ensureProjectDirs();

  try {
    const content = await fs.readFile(SCHEDULES_PATH, "utf8");
    return savedSchedulesSchema.parse(JSON.parse(content));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      const empty = createEmptySchedules();
      await writeJsonAtomic(SCHEDULES_PATH, empty);
      return empty;
    }
    throw error;
  }
}

export async function writeSavedSchedules(schedules: SavedSchedules) {
  await ensureProjectDirs();
  const parsed = savedSchedulesSchema.parse(schedules);
  await writeJsonAtomic(SCHEDULES_PATH, parsed);
}

export async function createSavedProject(projectPath: string, project: SavedProject) {
  await ensureProjectDirs();
  const filePath = createProjectFilePath(projectPath);

  try {
    await fs.access(filePath);
    throw new ProjectAlreadyExistsError(`Project already exists: ${projectPath}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  await writeSavedProject(projectPath, project);
  return readProjectSummary(projectPath);
}

export function getPublicFilePath(urlPath: string) {
  const normalized = path.normalize(urlPath).replace(/^(\.\.(\/|\\|$))+/, "");
  return path.join(PUBLIC_DIR, normalized);
}
