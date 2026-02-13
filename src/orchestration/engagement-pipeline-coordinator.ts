import { logger } from "../core/logger";
import { env } from "../core/config";
import { policySnapshotService } from "../services/policy-snapshot.service";
import { triageStage } from "./stages/triage-stage";
import { selectionStage } from "./stages/selection-stage";
import { deepScrapeStage } from "./stages/deep-scrape-stage";
import { draftGenerationStage } from "./stages/draft-generation-stage";

export interface EngagementPipelineInput {
  runAccountId: number;
  accountId: number;
}

export interface EngagementPipelineResult {
  triage: {
    totalPosts: number;
    triagedPosts: number;
    failedPosts: number;
  };
  selection: {
    top20Count: number;
    selectedForDeepScrape: number;
  };
  deepScrape: {
    totalTasks: number;
    successCount: number;
    commentsCollected: number;
  };
  drafts: {
    totalPosts: number;
    draftsGenerated: number;
  };
  errors: Array<{ stage: string; postId?: number; error: string }>;
}

export class EngagementPipelineCoordinator {
  async run(input: EngagementPipelineInput): Promise<EngagementPipelineResult> {
    logger.info(
      { runAccountId: input.runAccountId, accountId: input.accountId },
      "Starting engagement pipeline"
    );

    const result: EngagementPipelineResult = {
      triage: { totalPosts: 0, triagedPosts: 0, failedPosts: 0 },
      selection: { top20Count: 0, selectedForDeepScrape: 0 },
      deepScrape: { totalTasks: 0, successCount: 0, commentsCollected: 0 },
      drafts: { totalPosts: 0, draftsGenerated: 0 },
      errors: [],
    };

    try {
      const { policyJson } = await policySnapshotService.createSnapshotForRunAccount(
        input.runAccountId,
        input.accountId
      );

      if (env.TRIAGE_ENABLED) {
        const triageResult = await triageStage.run({
          runAccountId: input.runAccountId,
          accountId: input.accountId,
          policy: policyJson,
        });
        result.triage = {
          totalPosts: triageResult.totalPosts,
          triagedPosts: triageResult.triagedPosts,
          failedPosts: triageResult.failedPosts,
        };
        for (const err of triageResult.errors) {
          result.errors.push({ stage: "triage", postId: err.postId, error: err.error });
        }
      }

      const selectionResult = await selectionStage.run({
        runAccountId: input.runAccountId,
      });
      result.selection = {
        top20Count: selectionResult.top20Count,
        selectedForDeepScrape: selectionResult.selectedForDeepScrape,
      };

      if (env.DEEP_SCRAPE_ENABLED && selectionResult.selectedForDeepScrape > 0) {
        const deepScrapeResult = await deepScrapeStage.run({
          runAccountId: input.runAccountId,
          accountId: input.accountId,
        });
        result.deepScrape = {
          totalTasks: deepScrapeResult.totalTasks,
          successCount: deepScrapeResult.successCount,
          commentsCollected: deepScrapeResult.commentsCollected,
        };
        for (const err of deepScrapeResult.errors) {
          result.errors.push({ stage: "deepScrape", postId: err.postId, error: err.error });
        }
      }

      if (env.DRAFTS_ENABLED && selectionResult.selectedForDeepScrape > 0) {
        const draftsResult = await draftGenerationStage.run({
          runAccountId: input.runAccountId,
          accountId: input.accountId,
          policy: policyJson,
        });
        result.drafts = {
          totalPosts: draftsResult.totalPosts,
          draftsGenerated: draftsResult.draftsGenerated,
        };
        for (const err of draftsResult.errors) {
          result.errors.push({ stage: "drafts", postId: err.postId, error: err.error });
        }
      }

      logger.info(
        { runAccountId: input.runAccountId, result },
        "Engagement pipeline completed"
      );

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error(
        { runAccountId: input.runAccountId, error: errorMessage },
        "Engagement pipeline failed"
      );
      result.errors.push({ stage: "coordinator", error: errorMessage });
      return result;
    }
  }
}

export const engagementPipelineCoordinator = new EngagementPipelineCoordinator();
