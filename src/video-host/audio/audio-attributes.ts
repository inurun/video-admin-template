// `<audio>` attributes for a manifest clip: the server writes them as HTML, the preview entry as DOM.
import type { AudioClip } from "./audio-manifest";

/** Container of the static `<audio>` elements, outside the remounted composition tree. */
export const HF_AUDIO_CONTAINER_ID = "hf-audio";

/** Each clip gets its own track so overlapping clips never share one. */
const AUDIO_TRACK_INDEX_BASE = 100;

export function toAudioAttributes(clip: AudioClip, index: number): [string, string][] {
  return [
    ["id", clip.id],
    ["src", clip.src],
    // The player skips `none` / `metadata`.
    ["preload", "auto"],
    ["data-start", String(clip.startSec)],
    ["data-duration", String(clip.durationSec)],
    ["data-track-index", String(AUDIO_TRACK_INDEX_BASE + index)],
    ...(clip.mediaStartSec === undefined
      ? []
      : ([["data-media-start", String(clip.mediaStartSec)]] as [string, string][])),
    // HF multiplies `data-volume` into a volume lane; a lane already holds the full gain, so only one is written.
    typeof clip.volume === "number"
      ? ["data-volume", String(clip.volume)]
      : [
          "data-automation",
          JSON.stringify({ version: 1, lanes: [{ target: "volume", points: clip.volume }] }),
        ],
  ];
}
