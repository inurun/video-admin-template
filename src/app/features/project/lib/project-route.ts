export type ProjectRoute =
  | { type: "schedules" }
  | { type: "dictionary" }
  | { type: "g2p-review" }
  | { type: "project"; projectPath: string }
  | { type: "page"; projectPath: string; pageId: string }
  | { type: "settings"; projectPath: string }
  | { type: "unknown" };

const PROJECTS_PREFIX = "/projects/";

export function encodeProjectPathSegment(projectPath: string) {
  return encodeURIComponent(projectPath);
}

export function decodeProjectPathSegment(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return "";
  }
}

function decodeRouteSegment(segment: string) {
  try {
    const decoded = decodeURIComponent(segment);
    return decoded || null;
  } catch {
    return null;
  }
}

export function getProjectRootHref(projectPath: string) {
  return `/projects/${encodeProjectPathSegment(projectPath)}`;
}

export function getProjectPageHref(projectPath: string, pageId: string) {
  return `${getProjectRootHref(projectPath)}/pages/${encodeURIComponent(pageId)}`;
}

export function getProjectSettingsHref(projectPath: string) {
  return `${getProjectRootHref(projectPath)}/settings`;
}

const LAST_PAGE_STORAGE_PREFIX = "editor:last-page:";

export function lastPageStorageKey(projectPath: string) {
  return `${LAST_PAGE_STORAGE_PREFIX}${projectPath}`;
}

export function rememberLastPageId(projectPath: string, pageId: string) {
  if (typeof sessionStorage === "undefined") {
    return;
  }
  sessionStorage.setItem(lastPageStorageKey(projectPath), pageId);
}

export function recallLastPageId(projectPath: string) {
  if (typeof sessionStorage === "undefined") {
    return null;
  }
  return sessionStorage.getItem(lastPageStorageKey(projectPath));
}

export function resolveProjectLandingHref(
  projectPath: string,
  sequenceOrder: string[],
  lastPageId: string | null = recallLastPageId(projectPath),
) {
  if (lastPageId && sequenceOrder.includes(lastPageId)) {
    return getProjectPageHref(projectPath, lastPageId);
  }
  const firstPageId = sequenceOrder[0];
  if (firstPageId) {
    return getProjectPageHref(projectPath, firstPageId);
  }
  return getProjectRootHref(projectPath);
}

export function resolvePageFallbackHref(
  projectPath: string,
  sequenceOrder: string[],
  pageId: string,
  lastPageId: string | null = recallLastPageId(projectPath),
) {
  if (sequenceOrder.includes(pageId)) {
    return getProjectPageHref(projectPath, pageId);
  }
  return resolveProjectLandingHref(projectPath, sequenceOrder, lastPageId);
}

export function getSchedulesHref() {
  return "/schedules";
}

export function getDictionaryHref() {
  return "/dictionary";
}

export function getG2pReviewHref() {
  return "/g2p-review";
}

export function isG2pReviewRoute(route: ProjectRoute) {
  return route.type === "g2p-review";
}

export function isDictionaryRoute(route: ProjectRoute) {
  return route.type === "dictionary";
}

export function isSchedulesRoute(route: ProjectRoute) {
  return route.type === "schedules";
}

export function parseProjectRoute(pathname: string): ProjectRoute {
  const normalized = pathname.replace(/\/+$/u, "") || "/";
  if (normalized === "/schedules") {
    return { type: "schedules" };
  }
  if (normalized === "/dictionary") {
    return { type: "dictionary" };
  }
  if (normalized === "/g2p-review") {
    return { type: "g2p-review" };
  }

  if (!normalized.startsWith(PROJECTS_PREFIX)) {
    return { type: "unknown" };
  }

  const rest = normalized.slice(PROJECTS_PREFIX.length);
  if (!rest) {
    return { type: "unknown" };
  }

  const segments = rest.split("/");
  const encodedPath = segments[0];
  if (!encodedPath) {
    return { type: "unknown" };
  }

  const projectPath = decodeRouteSegment(encodedPath);
  if (!projectPath) {
    return { type: "unknown" };
  }

  if (segments.length === 1) {
    return { type: "project", projectPath };
  }

  if (segments.length === 2 && segments[1] === "settings") {
    return { type: "settings", projectPath };
  }

  if (segments.length === 3 && segments[1] === "pages" && segments[2]) {
    const pageId = decodeRouteSegment(segments[2]);
    if (!pageId) {
      return { type: "unknown" };
    }
    return { type: "page", projectPath, pageId };
  }

  return { type: "unknown" };
}

export function getProjectPathFromRoute(route: ProjectRoute) {
  return route.type === "project" || route.type === "page" || route.type === "settings"
    ? route.projectPath
    : null;
}

export function getProjectSettingsDialogHref(
  projectPath: string,
  open: boolean,
  sequenceOrder: string[],
) {
  return open
    ? getProjectSettingsHref(projectPath)
    : resolveProjectLandingHref(projectPath, sequenceOrder);
}

export function isProjectSettingsRoute(route: ProjectRoute) {
  return route.type === "settings";
}

export type ProjectRouteRedirectDecision =
  | { action: "none" }
  | { action: "remember"; pageId: string }
  | { action: "navigate"; href: string };

export function resolveProjectRouteRedirect(input: {
  route: ProjectRoute;
  sequenceOrder: string[];
  hasProjectData: boolean;
}): ProjectRouteRedirectDecision {
  if (
    !input.hasProjectData ||
    input.route.type === "unknown" ||
    input.route.type === "schedules" ||
    input.route.type === "dictionary" ||
    input.route.type === "g2p-review"
  ) {
    return { action: "none" };
  }

  if (input.route.type === "settings") {
    return { action: "none" };
  }

  if (input.route.type === "project") {
    return {
      action: "navigate",
      href: resolveProjectLandingHref(input.route.projectPath, input.sequenceOrder),
    };
  }

  const href = resolvePageFallbackHref(
    input.route.projectPath,
    input.sequenceOrder,
    input.route.pageId,
  );
  if (href !== getProjectPageHref(input.route.projectPath, input.route.pageId)) {
    return { action: "navigate", href };
  }

  return { action: "remember", pageId: input.route.pageId };
}
