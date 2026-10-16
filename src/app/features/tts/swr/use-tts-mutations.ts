import { toast } from "sonner";
import useSWRMutation from "swr/mutation";
import type { TtsG2pGenerateRequest } from "@/server/features/tts/contract";
import { getErrorMessage } from "@/_shared/lib/error-message";
import { requestG2pGenerate } from "@/app/features/tts/api/tts-api";

async function g2pGenerateMutation(_key: string, { arg }: { arg: TtsG2pGenerateRequest }) {
  return requestG2pGenerate(arg);
}

export function useG2pGenerateMutation() {
  return useSWRMutation("tts-g2p-generate", g2pGenerateMutation, {
    onError(error, key, config) {
      console.error(error, key, config);
      toast.error(getErrorMessage(error, "G2P generate failed"));
    },
  });
}
