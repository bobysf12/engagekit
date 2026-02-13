import type { EngagementPolicyInput } from "../../domain/models";
import type { Post } from "../../db/schema";
import { logger } from "../../core/logger";
import { env } from "../../core/config";
import { openRouterClient } from "../../llm/openrouter-client";
import {
  buildDraftSystemPrompt,
  buildDraftUserPrompt,
  DRAFT_PROMPT_VERSION,
  draftPromptSchema,
} from "../../llm/prompts/draft";
import type { DraftPromptInput, DraftOutput } from "../../llm/contracts";
import { postTriageRepo } from "../../db/repositories/post-triage.repo";
import { postsRepo } from "../../db/repositories/posts.repo";
import { commentsRepo } from "../../db/repositories/comments.repo";
import { draftFeedbackRepo } from "../../db/repositories/draft-feedback.repo";

export interface DraftGenerationStageInput {
  runAccountId: number;
  accountId: number;
  policy: EngagementPolicyInput;
}

export interface DraftGenerationStageResult {
  totalPosts: number;
  draftsGenerated: number;
  draftsPerPost: number;
  failedPosts: number;
  errors: Array<{ postId: number; error: string }>;
}

export class DraftGenerationStage {
  async run(input: DraftGenerationStageInput): Promise<DraftGenerationStageResult> {
    if (!env.DRAFTS_ENABLED) {
      logger.info({ runAccountId: input.runAccountId }, "Draft generation stage disabled, skipping");
      return { totalPosts: 0, draftsGenerated: 0, draftsPerPost: 3, failedPosts: 0, errors: [] };
    }

    logger.info({ runAccountId: input.runAccountId }, "Starting draft generation stage");

    const selectedTriage = await postTriageRepo.listSelectedForDeepScrape(input.runAccountId);

    const result: DraftGenerationStageResult = {
      totalPosts: selectedTriage.length,
      draftsGenerated: 0,
      draftsPerPost: 3,
      failedPosts: 0,
      errors: [],
    };

    if (selectedTriage.length === 0) {
      logger.info({ runAccountId: input.runAccountId }, "No posts selected for draft generation");
      return result;
    }

    const pastApprovedReplies = await this.getPastApprovedReplies(input.accountId);

    for (const triage of selectedTriage) {
      const post = await postsRepo.findById(triage.postId);
      if (!post) {
        logger.warn({ postId: triage.postId }, "Post not found for draft generation");
        continue;
      }

      try {
        const topComments = await this.getTopComments(post.id, 3);
        const draftOutput = await this.generateDrafts(post, input.policy, topComments, pastApprovedReplies);
        await this.persistDrafts(input.runAccountId, post.id, draftOutput, input.policy, topComments, pastApprovedReplies);
        result.draftsGenerated += draftOutput.options.length;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        logger.error(
          { runAccountId: input.runAccountId, postId: post.id, error: errorMessage },
          "Failed to generate drafts for post"
        );
        result.failedPosts++;
        result.errors.push({ postId: post.id, error: errorMessage });
      }
    }

    logger.info(
      { runAccountId: input.runAccountId, ...result },
      "Draft generation stage completed"
    );

    return result;
  }

  private async getTopComments(postId: number, limit: number): Promise<DraftPromptInput["topComments"]> {
    const comments = await commentsRepo.findByParentPostId(postId);
    return comments.slice(0, limit).map((c) => ({
      authorHandle: c.authorHandle,
      authorDisplayName: c.authorDisplayName,
      bodyText: c.bodyText,
    }));
  }

  private async getPastApprovedReplies(accountId: number): Promise<string[]> {
    const drafts = await draftFeedbackRepo.listApprovedDraftsForStyle(accountId, 10);
    return drafts.map((d) => d.draftText).filter(Boolean);
  }

  private async generateDrafts(
    post: Post,
    policy: EngagementPolicyInput,
    topComments: DraftPromptInput["topComments"],
    pastApprovedReplies: string[]
  ): Promise<DraftOutput> {
    const promptInput: DraftPromptInput = {
      policy,
      post: {
        authorHandle: post.authorHandle,
        authorDisplayName: post.authorDisplayName,
        bodyText: post.bodyText,
        postUrl: post.postUrl,
      },
      topComments,
      pastApprovedReplies,
    };

    const systemPrompt = buildDraftSystemPrompt();
    const userPrompt = buildDraftUserPrompt(promptInput);

    const output = await openRouterClient.complete(
      systemPrompt,
      userPrompt,
      draftPromptSchema(),
      { temperature: 0.7, maxTokens: 1024 }
    );

    return output;
  }

  private async persistDrafts(
    runAccountId: number,
    postId: number,
    draftOutput: DraftOutput,
    policy: EngagementPolicyInput,
    topComments: DraftPromptInput["topComments"],
    pastApprovedReplies: string[]
  ): Promise<void> {
    const inputContext = {
      policy,
      topComments,
      pastApprovedReplies,
    };

    for (let i = 0; i < draftOutput.options.length; i++) {
      const option = draftOutput.options[i];
      if (!option) continue;

      await draftFeedbackRepo.createDraft({
        runAccountId,
        postId,
        optionIndex: i,
        promptVersion: DRAFT_PROMPT_VERSION,
        draftText: option.text,
        model: env.OPENROUTER_MODEL,
        status: "generated",
        inputContextJson: JSON.stringify(inputContext),
      });
    }
  }
}

export const draftGenerationStage = new DraftGenerationStage();
