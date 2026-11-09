import { runAgentBrowser } from "./agent-browser-cli";

// Claude は確認画面で止まる。最終投稿は照合後にサーバーがこの決め打ちスクリプトで押す。
const CONFIRM_DIALOG_HEADING = "投稿の確認";
const SUBMIT_BUTTON_LABEL = "投稿する";
const SUBMIT_CLOSE_TIMEOUT_MS = 120_000;
const SUBMIT_POLL_INTERVAL_MS = 1_000;

export const SUBMIT_TOKENS = {
  clicked: "NICONICO_SUBMIT_CLICKED",
  missingDialog: "NICONICO_SUBMIT_MISSING_DIALOG",
  missingButton: "NICONICO_SUBMIT_MISSING_BUTTON",
  disabledButton: "NICONICO_SUBMIT_DISABLED_BUTTON",
  confirmOpen: "NICONICO_CONFIRM_OPEN",
  confirmClosed: "NICONICO_CONFIRM_CLOSED",
} as const;

const findConfirmDialogSource = `Array.from(document.querySelectorAll('[role="dialog"]')).find(
    (element) => element.querySelector("h2")?.textContent?.trim() === ${JSON.stringify(CONFIRM_DIALOG_HEADING)},
  )`;

export const CLICK_SUBMIT_SCRIPT = `(() => {
  const dialog = ${findConfirmDialogSource};
  if (!dialog) return ${JSON.stringify(SUBMIT_TOKENS.missingDialog)};
  const isSubmit = (button) =>
    button.textContent?.trim() === ${JSON.stringify(SUBMIT_BUTTON_LABEL)} &&
    button.getClientRects().length > 0;
  const inDialog = Array.from(dialog.querySelectorAll("button")).filter(isSubmit);
  const candidates =
    inDialog.length > 0 ? inDialog : Array.from(document.querySelectorAll("button")).filter(isSubmit);
  if (candidates.length !== 1) return ${JSON.stringify(SUBMIT_TOKENS.missingButton)};
  const [button] = candidates;
  if (button.disabled) return ${JSON.stringify(SUBMIT_TOKENS.disabledButton)};
  button.click();
  return ${JSON.stringify(SUBMIT_TOKENS.clicked)};
})()`;

export const CONFIRM_STATE_SCRIPT = `(() => {
  const dialog = ${findConfirmDialogSource};
  return dialog && dialog.getClientRects().length > 0
    ? ${JSON.stringify(SUBMIT_TOKENS.confirmOpen)}
    : ${JSON.stringify(SUBMIT_TOKENS.confirmClosed)};
})()`;

export function readSubmitToken(stdout: string) {
  return Object.values(SUBMIT_TOKENS).find((token) => stdout.includes(token));
}

export async function submitNiconicoPost(signal: AbortSignal, log: (message: string) => void) {
  signal.throwIfAborted();
  const clickToken = readSubmitToken(await runAgentBrowser(["eval", CLICK_SUBMIT_SCRIPT]));
  if (clickToken !== SUBMIT_TOKENS.clicked) {
    throw new Error(`Final submit was not clicked: ${clickToken ?? "unknown eval output"}`);
  }
  // 押した後は取り消せないので、cancel を受けても閉じるまで見届ける。
  log("Clicked final submit button");

  const deadline = Date.now() + SUBMIT_CLOSE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, SUBMIT_POLL_INTERVAL_MS));
    const stateToken = readSubmitToken(await runAgentBrowser(["eval", CONFIRM_STATE_SCRIPT]));
    if (stateToken === SUBMIT_TOKENS.confirmClosed) {
      log("Confirmation dialog closed after submit");
      return;
    }
  }
  throw new Error("Confirmation dialog did not close after final submit");
}
