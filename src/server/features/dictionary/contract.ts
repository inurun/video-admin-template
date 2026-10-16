import { z } from "zod";
import {
  dictionaryEntryInputSchema,
  dictionaryListResponseSchema,
  dictionaryMutationResponseSchema,
  g2pItemSchema,
} from "@/_schemas";

export const dictionaryContract = {
  list: { response: dictionaryListResponseSchema },
  get: { response: dictionaryMutationResponseSchema },
  create: { json: dictionaryEntryInputSchema, response: dictionaryMutationResponseSchema },
  update: { json: dictionaryEntryInputSchema, response: dictionaryMutationResponseSchema },
  analyze: {
    json: z.object({ text: z.string().min(1) }),
    response: z.object({ g2p: g2pItemSchema }),
  },
  preview: { json: z.object({ g2p: g2pItemSchema }) },
};
