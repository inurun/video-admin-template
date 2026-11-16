import { VIDEO_SIZE_PRESETS } from "@/constants";
import { DEFAULT_PROJECT_META, type WeatherForecasts } from "@/_schemas";

export type VideoSizePresetId = (typeof VIDEO_SIZE_PRESETS)[number]["id"];

type ProjectNiconicoMeta = {
  title: string;
  description: string;
  thumbnailTime: string;
  parentWorkIds: string[];
  fixedParentWorkIds: string[];
  tags: string[];
};

type ProjectMetaLike = {
  title: string;
  description: string;
  width: number;
  height: number;
  updatedAt?: string;
  weather: WeatherForecasts;
  niconico: ProjectNiconicoMeta;
};

const DEFAULT_VIDEO_SIZE_PRESET = VIDEO_SIZE_PRESETS[0];
const DEFAULT_THUMBNAIL_TIME = "00:00.000";
const PARENT_WORK_ID_PATTERN = /^(?:sm|ss|im)\d+$/;
const VIDEO_SIZE_PRESETS_BY_SIZE = new Map(
  VIDEO_SIZE_PRESETS.map((preset) => [`${preset.width}x${preset.height}`, preset]),
);

function normalizeProjectTitle(value: string | undefined, fallback = DEFAULT_PROJECT_META.title) {
  return value?.trim() || fallback;
}

function normalizeThumbnailTime(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return /^\d{2}:[0-5]\d\.\d{3}$/.test(trimmed) ? trimmed : DEFAULT_THUMBNAIL_TIME;
}

function normalizeParentWorkIds(value: string[] | undefined) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.map((id) => id.trim()).filter((id) => PARENT_WORK_ID_PATTERN.test(id)))];
}

export function normalizeNiconicoMeta(
  value: Partial<ProjectNiconicoMeta> | undefined,
): ProjectNiconicoMeta {
  return {
    title: value?.title?.trim() ?? "",
    description: value?.description ?? "",
    thumbnailTime: normalizeThumbnailTime(value?.thumbnailTime),
    parentWorkIds: normalizeParentWorkIds(value?.parentWorkIds),
    fixedParentWorkIds: normalizeParentWorkIds(value?.fixedParentWorkIds),
    tags: [...new Set((value?.tags ?? []).map((tag) => tag.trim()).filter(Boolean))],
  };
}

export function normalizeProjectMeta(
  meta: Partial<ProjectMetaLike> | undefined,
  options: { titleFallback?: string } = {},
): ProjectMetaLike {
  const titleFallback = options.titleFallback ?? DEFAULT_PROJECT_META.title;
  const defaultMeta = {
    ...DEFAULT_PROJECT_META,
    title: titleFallback,
    niconico: { ...DEFAULT_PROJECT_META.niconico },
  };
  const input = { ...defaultMeta, ...meta };
  const size =
    VIDEO_SIZE_PRESETS_BY_SIZE.get(`${input.width}x${input.height}`) ?? DEFAULT_VIDEO_SIZE_PRESET;

  return {
    title: normalizeProjectTitle(input.title, defaultMeta.title),
    description: input.description,
    width: size.width,
    height: size.height,
    ...(input.updatedAt ? { updatedAt: input.updatedAt } : {}),
    weather: input.weather,
    niconico: normalizeNiconicoMeta(meta?.niconico ?? input.niconico),
  };
}

export function getProjectVideoSizePresetId({
  width,
  height,
}: {
  width: number;
  height: number;
}): VideoSizePresetId {
  return (VIDEO_SIZE_PRESETS_BY_SIZE.get(`${width}x${height}`) ?? DEFAULT_VIDEO_SIZE_PRESET).id;
}
