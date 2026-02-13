import type { EngagementPolicyInput } from "../../domain/models";
import type { Post } from "../../db/schema";
import { logger } from "../../core/logger";
import { env } from "../../core/config";
import { openRouterClient } from "../../llm/openrouter-client";
import {
  buildTriageSystemPrompt,
  buildTriageUserPrompt,
  TRIAGE_PROMPT_VERSION,
  triagePromptSchema,
} from "../../llm/prompts/triage";
import type { TriagePromptInput, TriageOutput } from "../../llm/contracts";
import { postTriageRepo } from "../../db/repositories/post-triage.repo";
import { runsRepo } from "../../db/repositories/runs.repo";
import { postsRepo } from "../../db/repositories/posts.repo";

export interface TriageStageInput {
  runAccountId: number;
  accountId: number;
  policy: EngagementPolicyInput;
}

export interface TriageStageResult {
  totalPosts: number;
  triagedPosts: number;
  failedPosts: number;
  errors: Array<{ postId: number; error: string }>;
}

export class TriageStage {
  async run(input: TriageStageInput): Promise<TriageStageResult> {
    if (!env.TRIAGE_ENABLED) {
      logger.info({ runAccountId: input.runAccountId }, "Triage stage disabled, skipping");
      return { totalPosts: 0, triagedPosts: 0, failedPosts: 0, errors: [] };
    }

    logger.info({ runAccountId: input.runAccountId }, "Starting triage stage");

    const runAccount = await runsRepo.findRunAccountById(input.runAccountId);
    if (!runAccount) {
      throw new Error(`Run account ${input.runAccountId} not found`);
    }

    const posts = await postsRepo.listByRunAccount(
      input.runAccountId,
      input.accountId,
      runAccount.startedAt
    );

    const result: TriageStageResult = {
      totalPosts: posts.length,
      triagedPosts: 0,
      failedPosts: 0,
      errors: [],
    };

    if (posts.length === 0) {
      logger.info({ runAccountId: input.runAccountId }, "No posts to triage");
      return result;
    }

    for (const post of posts) {
      try {
        const triageOutput = await this.triagePost(post, input.policy);
        await this.persistTriageResult(input.runAccountId, post.id, triageOutput);
        result.triagedPosts++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        logger.error(
          { runAccountId: input.runAccountId, postId: post.id, error: errorMessage },
          "Failed to triage post"
        );
        result.failedPosts++;
        result.errors.push({ postId: post.id, error: errorMessage });
      }
    }

    logger.info(
      { runAccountId: input.runAccountId, ...result },
      "Triage stage completed"
    );

    return result;
  }

  private async triagePost(post: Post, policy: EngagementPolicyInput): Promise<TriageOutput> {
    const promptInput: TriagePromptInput = {
      policy,
      post: {
        authorHandle: post.authorHandle,
        authorDisplayName: post.authorDisplayName,
        bodyText: post.bodyText,
        postUrl: post.postUrl,
      },
    };

    const systemPrompt = buildTriageSystemPrompt();
    const userPrompt = buildTriageUserPrompt(promptInput);

    const output = await openRouterClient.complete(
      systemPrompt,
      userPrompt,
      triagePromptSchema(),
      { temperature: 0.3, maxTokens: 512 }
    );

    return output;
  }

  private async persistTriageResult(
    runAccountId: number,
    postId: number,
    triageOutput: TriageOutput
  ): Promise<void> {
    await postTriageRepo.bulkCreateOrSkip([
      {
        runAccountId,
        postId,
        relevanceScore: triageOutput.relevance_score,
        relevanceLabel: triageOutput.relevance_label,
        reasonsJson: JSON.stringify(triageOutput.reasons),
        action: triageOutput.action,
        confidence: Math.round(triageOutput.confidence * 100),
        model: env.OPENROUTER_MODEL,
        promptVersion: TRIAGE_PROMPT_VERSION,
        isTop20: 0,
        selectedForDeepScrape: 0,
      },
    ]);
  }
}

export const triageStage = new TriageStage();
