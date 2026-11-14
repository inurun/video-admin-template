import path from "node:path";
import { promises as fs } from "node:fs";
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

const projectRoot = process.cwd();
const openapiRoot = path.join(projectRoot, "openapi");
const defaultHaqumeiApiUrl = "http://127.0.0.1:8080";

const requiredPaths = [
  "/v1/analyze",
  "/v1/g2p/validate",
  "/v1/dictionary",
  "/v1/dictionary/entries",
  "/v1/dictionary/entries/batch",
  "/v1/dictionary/entries/{id}",
  "/v1/prosody/extract",
  "/v1/synthesis/voicevox",
  "/v1/synthesis/voisona",
  "/v1/synthesis/coeiroink",
  "/v1/voices/voicevox",
  "/v1/voices/voisona",
  "/v1/voices/coeiroink",
] as const;

function trimEnvValue(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function unwrapQuotedValue(value: string) {
  const quote = value[0];
  return (quote === '"' || quote === "'") && value.endsWith(quote)
    ? value.slice(1, -1).trim()
    : value;
}

function normalizeEnvValue(value: string | undefined) {
  const trimmed = trimEnvValue(value);
  if (!trimmed) {
    return undefined;
  }

  const normalized = unwrapQuotedValue(trimmed);
  return normalized || undefined;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}\n${text}`);
  }

  return text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function assertRequiredPaths(paths: Record<string, unknown>) {
  for (const requiredPath of requiredPaths) {
    if (!(requiredPath in paths)) {
      throw new Error(`haqumei-api schema missing ${requiredPath}`);
    }
  }
}

function getSchemaRefName(schema: unknown): string | undefined {
  if (!isRecord(schema) || typeof schema.$ref !== "string") {
    return undefined;
  }

  const match = schema.$ref.match(/\/([^/]+)$/u);
  return match?.[1];
}

function getWavSchema(schema: unknown, components: Record<string, unknown> | undefined) {
  if (!isRecord(schema)) {
    return undefined;
  }

  const refName = getSchemaRefName(schema);
  if (refName && isRecord(components)) {
    return components[refName];
  }

  return schema;
}

function isBinaryWavSchema(schema: unknown) {
  if (!isRecord(schema)) {
    return false;
  }

  return schema.type === "string" && schema.format === "binary";
}

function assertBinaryWavSchema(openapi: Record<string, unknown>) {
  const paths = openapi.paths;
  if (!isRecord(paths)) {
    throw new Error("haqumei-api schema missing paths");
  }

  const components = isRecord(openapi.components) ? openapi.components.schemas : undefined;
  const componentSchemas = isRecord(components) ? components : undefined;

  for (const synthesisPath of [
    "/v1/synthesis/voicevox",
    "/v1/synthesis/voisona",
    "/v1/synthesis/coeiroink",
  ] as const) {
    const pathItem = paths[synthesisPath];
    if (!isRecord(pathItem) || !isRecord(pathItem.post) || !isRecord(pathItem.post.responses)) {
      throw new Error(`haqumei-api schema missing POST ${synthesisPath}`);
    }

    const ok = pathItem.post.responses["200"];
    if (!isRecord(ok) || !isRecord(ok.content) || !isRecord(ok.content["audio/wav"])) {
      throw new Error(`haqumei-api schema missing audio/wav for ${synthesisPath}`);
    }

    const wavSchema = getWavSchema(ok.content["audio/wav"].schema, componentSchemas);
    if (!isBinaryWavSchema(wavSchema)) {
      throw new Error(`haqumei-api schema missing binary WAV schema for ${synthesisPath}`);
    }
  }
}

function assertHaqumeiApiSchema(value: unknown): asserts value is {
  openapi: string;
  paths: Record<string, unknown>;
} {
  if (!isRecord(value)) {
    throw new Error("haqumei-api schema is not an object");
  }

  if (typeof value.openapi !== "string") {
    throw new Error("haqumei-api schema missing openapi");
  }

  if (!isRecord(value.paths)) {
    throw new Error("haqumei-api schema missing paths");
  }

  assertRequiredPaths(value.paths);
  assertBinaryWavSchema(value);
}

async function main(): Promise<void> {
  const haqumeiApiUrl = normalizeBaseUrl(
    normalizeEnvValue(process.env.HAQUMEI_API_URL) ?? defaultHaqumeiApiUrl,
  );
  const schemaUrl = new URL("/openapi.json", `${haqumeiApiUrl}/`).toString();
  const schema = JSON.parse(await fetchText(schemaUrl)) as unknown;
  assertHaqumeiApiSchema(schema);

  const outputDir = path.join(openapiRoot, "haqumei-api");
  await fs.mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, "openapi.json");
  await fs.writeFile(outputPath, `${JSON.stringify(schema, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        haqumeiApi: {
          output: path.join("openapi", "haqumei-api", "openapi.json"),
          source: schemaUrl,
        },
      },
      null,
      2,
    ),
  );
}

await main();
