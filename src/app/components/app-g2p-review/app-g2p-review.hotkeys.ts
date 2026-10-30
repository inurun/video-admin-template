import { useHotkeys } from "react-hotkeys-hook";
import type { useAppG2pReview } from "./use-app-g2p-review";

export function useAppG2pReviewHotkeys(state: ReturnType<typeof useAppG2pReview>) {
  const { confirm, kana, move, play, selected, setKana, toggleAlternative } = state;

  useHotkeys("j", () => move(1), [move]);
  useHotkeys("k", () => move(-1), [move]);
  useHotkeys("space", () => void play(kana), { preventDefault: true }, [kana, play]);
  useHotkeys("enter", () => void confirm(), [confirm]);
  useHotkeys(
    "1,2,3",
    (event) => {
      const candidate = selected?.candidates[Number(event.key) - 1];
      if (candidate) {
        setKana(candidate.kana);
      }
    },
    [selected, setKana],
  );
  useHotkeys(
    "shift+1,shift+2,shift+3",
    (event) => {
      const candidate = selected?.candidates[Number(event.code.at(-1)) - 1];
      if (candidate) {
        void toggleAlternative(candidate);
      }
    },
    [selected, toggleAlternative],
  );
}
