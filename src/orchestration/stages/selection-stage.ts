import { logger } from "../../core/logger";
import { env } from "../../core/config";
import { postTriageRepo } from "../../db/repositories/post-triage.repo";
import { deepScrapeTasksRepo } from "../../db/repositories/deep-scrape-tasks.repo";

export interface SelectionStageInput {
  runAccountId: number;
}

export interface SelectionStageResult {
  totalTriaged: number;
  top20Count: number;
  selectedForDeepScrape: number;
  top20PostIds: number[];
  deepScrapePostIds: number[];
}

export class SelectionStage {
  async run(input: SelectionStageInput): Promise<SelectionStageResult> {
    if (!env.TRIAGE_ENABLED) {
      logger.info({ runAccountId: input.runAccountId }, "Selection stage disabled (triage disabled), skipping");
      return {
        totalTriaged: 0,
        top20Count: 0,
        selectedForDeepScrape: 0,
        top20PostIds: [],
        deepScrapePostIds: [],
      };
    }

    logger.info({ runAccountId: input.runAccountId }, "Starting selection stage");

    const triageResults = await postTriageRepo.listByRunAccount(input.runAccountId, 200);

    const result: SelectionStageResult = {
      totalTriaged: triageResults.length,
      top20Count: 0,
      selectedForDeepScrape: 0,
      top20PostIds: [],
      deepScrapePostIds: [],
    };

    if (triageResults.length === 0) {
      logger.info({ runAccountId: input.runAccountId }, "No triage results to select from");
      return result;
    }

    const top20 = triageResults.slice(0, env.SELECTION_TOP_N);
    const deepScrapeThreshold = env.SELECTION_SCORE_THRESHOLD;

    for (let i = 0; i < top20.length; i++) {
      const triage = top20[i];
      if (!triage) continue;
      
      const rank = i + 1;
      const isTop20 = true;
      const selectedForDeepScrape = triage.relevanceScore >= deepScrapeThreshold;

      await postTriageRepo.updateSelectionFlags(input.runAccountId, triage.postId, {
        rank,
        isTop20,
        selectedForDeepScrape,
      });

      result.top20Count++;
      result.top20PostIds.push(triage.postId);

      if (selectedForDeepScrape) {
        result.selectedForDeepScrape++;
        result.deepScrapePostIds.push(triage.postId);

        if (env.DEEP_SCRAPE_ENABLED) {
          await deepScrapeTasksRepo.createOrSkip({
            runAccountId: input.runAccountId,
            postId: triage.postId,
            status: "pending",
            attemptCount: 0,
          });
        }
      }
    }

    logger.info(
      {
        runAccountId: input.runAccountId,
        totalTriaged: result.totalTriaged,
        top20Count: result.top20Count,
        selectedForDeepScrape: result.selectedForDeepScrape,
        deepScrapeThreshold,
      },
      "Selection stage completed"
    );

    return result;
  }
}

export const selectionStage = new SelectionStage();
