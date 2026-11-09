import { api } from "@/app/lib/api-client";
import { parseApiJson } from "@/app/lib/fetch-json";

export type PublishState = {
  jobId: string | null;
  lastError: string | null;
  logs: string[];
  resultUrl: string | null;
  status: "error" | "idle" | "running" | "success";
  updatedAt?: number;
};

export const PUBLISH_STREAM_URL = "/api/publish/stream";

export const publishKeys = {
  snapshot: () => ["publish"] as const,
};

export async function fetchPublishState() {
  return parseApiJson<PublishState>(await api.publish.$get());
}

export async function startPublish(projectPath: string, autoSubmit: boolean) {
  const response = await api.publish.$post({
    json: { projectPath, autoSubmit },
  });
  const data = (await response.json()) as { error?: string; started?: boolean };

  if (!response.ok || !data.started) {
    throw new Error(data.error ?? "Publish start failed");
  }
}

export async function cancelPublish() {
  const response = await api.publish.cancel.$post();
  const data = (await response.json()) as { canceled?: boolean; error?: string };

  if (!response.ok) {
    throw new Error(data.error ?? "Publish cancel failed");
  }
}
