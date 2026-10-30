import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import build from "@hono/vite-build/node";
import devServer, { defaultOptions } from "@hono/vite-dev-server";
import { hyperframesPreviewPlugin } from "./scripts/vite/hyperframes-preview-plugin";
import { serveRuntimePublicAssetsPlugin } from "./scripts/vite/serve-runtime-public-assets-plugin";
import ssrPlugin from "vite-ssr-components/plugin";
import { defineConfig, loadEnv } from "vite";
import { createHfViteConfig } from "./vite.hf.config";

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));

  const resolve = {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  };

  if (mode === "server") {
    return {
      resolve,
      plugins: [
        build({
          entry: "./src/index.tsx",
          staticRoot: "./dist",
        }),
      ],
    };
  }

  return {
    server: {
      watch: {
        ignored: ["**/data/**", "**/g2p-eval/**", "**/public/uploads/**"],
      },
    },
    build: {
      emptyOutDir: true,
    },
    plugins: [
      serveRuntimePublicAssetsPlugin(),
      hyperframesPreviewPlugin(createHfViteConfig),
      devServer({
        entry: "./src/index.tsx",
        exclude: [/^\/src\/.*\.json(?:\?.*)?$/, ...defaultOptions.exclude],
        handleHotUpdate: () => {},
      }),
      tailwindcss(),
      ssrPlugin({
        hotReload: {
          ignore: [
            "**/*.test.ts",
            "**/*.test.tsx",
            "src/app/**",
            "src/video/**",
            "src/video-host/**",
          ],
        },
      }),
      react(),
    ],
    resolve,
    test: {
      environment: "node",
      include: ["src/**/*.test.ts"],
      coverage: {
        provider: "istanbul",
        reporter: ["json"],
        reportsDirectory: "./coverage",
      },
    },
  };
});
