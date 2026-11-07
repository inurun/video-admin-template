/** @jsxImportSource @inurun/vite-plugin-hyperframes-jsx */
import "./styles.css";
import {
  mountComposition,
  type MountedComposition,
} from "@inurun/vite-plugin-hyperframes-jsx/runtime";
import { video } from "@/video";
import { HF_AUDIO_CONTAINER_ID } from "./audio/audio-attributes";
import { createAudioManifest } from "./audio/audio-manifest";
import { createAudioSync } from "./audio/audio-sync";
import { HF_COMPOSITION_ID, HF_DATA_CHANNEL, HF_DATA_ELEMENT_ID, type HfMode } from "./constants";
import { hfDataSchema, type HfData } from "./contract";
import { createMountQueue } from "./mount-queue";

declare global {
  interface Window {
    __hyperframes?: {
      registerRuntimeDataHandler?: (
        channel: string,
        handler: (payload: unknown) => unknown,
      ) => () => void;
    };
  }
}

/**
 * `mountComposition` reads the rest of the root's `data-*`; the host needs fps and mode.
 * No template-literal selector: HF lint flags it (`template_literal_selector`).
 */
function getStage() {
  const stage = [...document.querySelectorAll<HTMLElement>("[data-composition-id]")].find(
    (element) => element.dataset["compositionId"] === HF_COMPOSITION_ID,
  );
  if (!stage) {
    throw new Error("composition root missing");
  }
  return { fps: Number(stage.dataset["fps"]), mode: stage.dataset["mode"] as HfMode };
}

function readEmbeddedData() {
  const text = document.getElementById(HF_DATA_ELEMENT_ID)?.textContent;
  if (!text) {
    throw new Error(`#${HF_DATA_ELEMENT_ID} missing`);
  }
  return hfDataSchema.parse(JSON.parse(text));
}

function main() {
  const { fps, mode } = getStage();
  video.onMode?.(mode);
  const embedded = readEmbeddedData();
  const audioContainer = document.getElementById(HF_AUDIO_CONTAINER_ID);
  if (!audioContainer) {
    throw new Error(`#${HF_AUDIO_CONTAINER_ID} missing`);
  }
  const manifestOf = (data: HfData) => createAudioManifest(data.project, data.timeline, fps, video);
  const syncAudio = createAudioSync(audioContainer, manifestOf(embedded));
  let current: MountedComposition | null = null;

  // An update replaces the tree once the new one is ready, so it never flashes blank.
  const mountData = async (data: HfData) => {
    const tree = <video.Composition {...data} />;
    current = current
      ? await current.replace(tree)
      : await mountComposition(HF_COMPOSITION_ID, tree);
    syncAudio(manifestOf(data));
  };

  const queue = createMountQueue(mountData);

  // Retained data (e.g. after a duration-change reload) arrives synchronously here.
  window.__hyperframes?.registerRuntimeDataHandler?.(HF_DATA_CHANNEL, (payload) =>
    queue.schedule(hfDataSchema.parse(payload)),
  );
  if (queue.isIdle()) {
    void queue.schedule(embedded);
  }
}

main();
