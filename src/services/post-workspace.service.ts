import type { EngagementPolicyInput } from "../domain/models";
import type { Post, PostTriage, MetricSnapshot, LlmDraft, Account } from "../db/schema";
import { postsRepo } from "../db/repositories/posts.repo";
import { runsRepo } from "../db/repositories/runs.repo";
import { postTriageRepo } from "../db/repositories/post-triage.repo";
import { metricsRepo } from "../db/repositories/metrics.repo";
import { draftFeedbackRepo } from "../db/repositories/draft-feedback.repo";
import { commentsRepo } from "../db/repositories/comments.repo";
import { accountsRepo } from "../db/repositories/accounts.repo";
import { policySnapshotService } from "./policy-snapshot.service";
import { openRouterClient } from "../llm/openrouter-client";
import {
  buildTriageSystemPrompt,
  buildTriageUserPrompt,
  TRIAGE_PROMPT_VERSION,
  triagePromptSchema,
} from "../llm/prompts/triage";
import {
  buildDraftSystemPrompt,
  buildDraftUserPrompt,
  DRAFT_PROMPT_VERSION,
  draftPromptSchema,
} from "../llm/prompts/draft";
import type { TriagePromptInput, TriageOutput, DraftPromptInput, DraftOutput } from "../llm/contracts";
import { logger } from "../core/logger";
import { env } from "../core/config";

export interface PostWorkspace {
  post: Post;
  account: Account | null;
  triage: PostTriage | null;
  metrics: MetricSnapshot | null;
  drafts: LlmDraft[];
}

export interface GenerateDraftsResult {
  runAccountId: number;
  triage: PostTriage;
  drafts: LlmDraft[];
}

export class PostWorkspaceService {
  async getWorkspace(postId: number): Promise<PostWorkspace | null> {
    const post = await postsRepo.findById(postId);
    if (!post) return null;

    let account: Account | null = null;
    const triage = await postTriageRepo.findLatestByPostId(postId);
    let drafts: LlmDraft[] = [];

    if (post.sourceAccountId) {
      account = await accountsRepo.findById(post.sourceAccountId);

      if (account) {
        if (triage) {
          drafts = await draftFeedbackRepo.findDraftsByPost(triage.runAccountId, postId);
        } else {
          const latestRunAccount = await this.findLatestRunAccountForAccount(account.id);
          if (latestRunAccount) {
            drafts = await draftFeedbackRepo.findDraftsByPost(latestRunAccount.id, postId);
          }
        }
      }
    }

    const metrics = await metricsRepo.findLatestByEntity("post", postId);

    return { post, account, triage, metrics, drafts };
  }

  async setEngagement(postId: number, engaged: boolean, engagedBy?: string): Promise<Post | null> {
    return postsRepo.updateEngagement(postId, engaged, engagedBy);
  }

  async generateDrafts(postId: number): Promise<GenerateDraftsResult> {
    if (!env.DRAFTS_ENABLED) {
      throw new Error("Draft generation is disabled");
    }

    const post = await postsRepo.findById(postId);
    if (!post) {
      throw new Error(`Post ${postId} not found`);
    }

    if (!post.sourceAccountId) {
      throw new Error("Post has no source account - cannot determine account for draft generation");
    }

    const account = await accountsRepo.findById(post.sourceAccountId);
    if (!account) {
      throw new Error(`Account ${post.sourceAccountId} not found`);
    }

    let runAccount = await this.findOrCreateRunAccountForPost(post, account);
    let triage = await postTriageRepo.findByRunAccountAndPost(runAccount.id, postId);

    if (!triage) {
      triage = await this.createTriageForPost(runAccount.id, post);
    }

    triage = await this.ensureTriageSelectedForDeepScrape(runAccount.id, postId, triage);

    const { policyJson } = await policySnapshotService.createSnapshotForRunAccount(
      runAccount.id,
      account.id
    );

    const existingDrafts = await draftFeedbackRepo.findDraftsByPost(runAccount.id, postId);
    if (existingDrafts.length > 0) {
      logger.info({ postId, runAccountId: runAccount.id }, "Drafts already exist for post");
      return { runAccountId: runAccount.id, triage, drafts: existingDrafts };
    }

    const topComments = await this.getTopComments(postId, 3);
    const pastApprovedReplies = await this.getPastApprovedReplies(account.id);
    const draftOutput = await this.generateDraftOutput(post, policyJson, topComments, pastApprovedReplies);
    const drafts = await this.persistDrafts(runAccount.id, postId, draftOutput, policyJson, topComments, pastApprovedReplies);

    logger.info({ postId, runAccountId: runAccount.id, draftsCount: drafts.length }, "Generated drafts for post");

    return { runAccountId: runAccount.id, triage, drafts };
  }

  private async findLatestRunAccountForAccount(accountId: number) {
    const runs = await runsRepo.listRecent(50);
    for (const run of runs) {
      const runAccounts = await runsRepo.findByRunId(run.id);
      const match = runAccounts.find((ra) => ra.accountId === accountId);
      if (match) return match;
    }
    return null;
  }

  private async findOrCreateRunAccountForPost(post: Post, account: Account) {
    const existing = await this.findLatestRunAccountForAccount(account.id);
    if (existing) {
      logger.debug({ postId: post.id, runAccountId: existing.id }, "Using existing run account");
      return existing;
    }

    logger.info({ postId: post.id, accountId: account.id }, "Creating new manual run for post");

    const now = Math.floor(Date.now() / 1000);
    const run = await runsRepo.createRun({
      trigger: "manual",
      startedAt: now,
      status: "running",
    });

    const runAccount = await runsRepo.createRunAccount({
      runId: run.id,
      accountId: account.id,
      status: "running",
      startedAt: now,
    });

    return runAccount;
  }

  private async createTriageForPost(runAccountId: number, post: Post): Promise<PostTriage> {
    if (!env.TRIAGE_ENABLED) {
      return postTriageRepo.create({
        runAccountId,
        postId: post.id,
        relevanceScore: 100,
        relevanceLabel: "keep",
        reasonsJson: JSON.stringify(["Manual draft generation"]),
        action: "reply",
        confidence: 100,
        model: "manual",
        promptVersion: "manual",
        isTop20: 1,
        selectedForDeepScrape: 1,
        rank: 1,
      });
    }

    const runAccount = await runsRepo.findRunAccountById(runAccountId);
    if (!runAccount) {
      throw new Error(`Run account ${runAccountId} not found`);
    }

    const account = await accountsRepo.findById(runAccount.accountId);
    if (!account) {
      throw new Error(`Account ${runAccount.accountId} not found`);
    }

    const { policyJson } = await policySnapshotService.createSnapshotForRunAccount(
      runAccountId,
      account.id
    );

    const triageOutput = await this.runTriage(post, policyJson);
    const triage = await postTriageRepo.create({
      runAccountId,
      postId: post.id,
      relevanceScore: triageOutput.relevance_score,
      relevanceLabel: triageOutput.relevance_label,
      reasonsJson: JSON.stringify(triageOutput.reasons),
      action: triageOutput.action,
      confidence: Math.round(triageOutput.confidence * 100),
      model: env.OPENROUTER_MODEL,
      promptVersion: TRIAGE_PROMPT_VERSION,
      isTop20: 0,
      selectedForDeepScrape: 0,
    });

    return triage;
  }

  private async runTriage(post: Post, policy: EngagementPolicyInput): Promise<TriageOutput> {
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

    return openRouterClient.complete(systemPrompt, userPrompt, triagePromptSchema(), {
      temperature: 0.3,
      maxTokens: 512,
    });
  }

  private async ensureTriageSelectedForDeepScrape(
    runAccountId: number,
    postId: number,
    triage: PostTriage
  ): Promise<PostTriage> {
    if (triage.selectedForDeepScrape === 1) return triage;

    const updated = await postTriageRepo.updateSelectionFlags(runAccountId, postId, {
      selectedForDeepScrape: true,
    });
    return updated ?? triage;
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

  private async generateDraftOutput(
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

    return openRouterClient.complete(systemPrompt, userPrompt, draftPromptSchema(), {
      temperature: 0.7,
      maxTokens: 1024,
    });
  }

  private async persistDrafts(
    runAccountId: number,
    postId: number,
    draftOutput: DraftOutput,
    policy: EngagementPolicyInput,
    topComments: DraftPromptInput["topComments"],
    pastApprovedReplies: string[]
  ): Promise<LlmDraft[]> {
    const inputContext = {
      policy,
      topComments,
      pastApprovedReplies,
    };

    const drafts: LlmDraft[] = [];
    for (let i = 0; i < draftOutput.options.length; i++) {
      const option = draftOutput.options[i];
      if (!option) continue;

      const draft = await draftFeedbackRepo.createDraft({
        runAccountId,
        postId,
        optionIndex: i,
        promptVersion: DRAFT_PROMPT_VERSION,
        draftText: option.text,
        model: env.OPENROUTER_MODEL,
        status: "generated",
        inputContextJson: JSON.stringify(inputContext),
      });
      drafts.push(draft);
    }

    return drafts;
  }
}

export const postWorkspaceService = new PostWorkspaceService();
