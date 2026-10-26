import type {
  AvatarExpressionGenerateRequest,
  AvatarExpressionGenerateResponse,
} from "@/server/features/avatar-expression/contract";
import { api } from "@/app/lib/api-client";
import { parseApiJson } from "@/app/lib/fetch-json";

export async function requestAvatarExpressions(input: AvatarExpressionGenerateRequest) {
  return parseApiJson<AvatarExpressionGenerateResponse>(
    await api["avatar-expression"].generate.$post({ json: input }),
  );
}
