import type { z } from "zod";
import type { PostTriageOutput, DraftGenerationOutput, EngagementPolicyInput } from "../domain/models";

export interface LLMCallOptions {
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface LLMClient {
  complete<T>(
    systemPrompt: string,
    userPrompt: string,
    responseSchema: z.ZodSchema<T>,
    options?: LLMCallOptions
  ): Promise<T>;
}

export interface TriagePromptInput {
  policy: EngagementPolicyInput;
  post: {
    authorHandle: string;
    authorDisplayName: string;
    bodyText: string | null;
    postUrl: string | null;
  };
}

export interface DraftPromptInput {
  policy: EngagementPolicyInput;
  post: {
    authorHandle: string;
    authorDisplayName: string;
    bodyText: string | null;
    postUrl: string | null;
  };
  topComments: Array<{
    authorHandle: string;
    authorDisplayName: string;
    bodyText: string | null;
  }>;
  pastApprovedReplies: string[];
}

export type TriageOutput = PostTriageOutput;
export type DraftOutput = DraftGenerationOutput;
