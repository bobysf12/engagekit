import { eq, inArray } from "drizzle-orm";
import { getDb } from "../db/client";
import {
  scrapeRuns,
  scrapeRunAccounts,
  posts,
  comments,
  postTriage,
  deepScrapeTasks,
  llmDrafts,
  draftFeedbackSignals,
  metricSnapshots,
  rawSnapshots,
  engagementPolicySnapshots,
  cronJobRuns,
} from "../db/schema";
import { logger } from "../core/logger";

export class DeleteService {
  private db = getDb();

  async deleteRun(runId: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      const runAccounts = await tx
        .select({ id: scrapeRunAccounts.id })
        .from(scrapeRunAccounts)
        .where(eq(scrapeRunAccounts.runId, runId));

      const runAccountIds = runAccounts.map((ra) => ra.id);

      if (runAccountIds.length > 0) {
        await tx
          .delete(draftFeedbackSignals)
          .where(inArray(draftFeedbackSignals.runAccountId, runAccountIds));
        await tx
          .delete(llmDrafts)
          .where(inArray(llmDrafts.runAccountId, runAccountIds));
        await tx
          .delete(deepScrapeTasks)
          .where(inArray(deepScrapeTasks.runAccountId, runAccountIds));
        await tx
          .delete(postTriage)
          .where(inArray(postTriage.runAccountId, runAccountIds));
        await tx
          .delete(metricSnapshots)
          .where(inArray(metricSnapshots.runAccountId, runAccountIds));
        await tx
          .delete(rawSnapshots)
          .where(inArray(rawSnapshots.runAccountId, runAccountIds));
        await tx
          .delete(engagementPolicySnapshots)
          .where(inArray(engagementPolicySnapshots.runAccountId, runAccountIds));
      }

      await tx.delete(scrapeRunAccounts).where(eq(scrapeRunAccounts.runId, runId));
      await tx.delete(cronJobRuns).where(eq(cronJobRuns.scrapeRunId, runId));
      await tx.delete(scrapeRuns).where(eq(scrapeRuns.id, runId));
    });

    logger.info({ runId }, "Run and all dependent records deleted");
  }

  async deletePost(postId: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(draftFeedbackSignals).where(eq(draftFeedbackSignals.postId, postId));
      await tx.delete(llmDrafts).where(eq(llmDrafts.postId, postId));
      await tx.delete(deepScrapeTasks).where(eq(deepScrapeTasks.postId, postId));
      await tx.delete(postTriage).where(eq(postTriage.postId, postId));
      await tx.delete(metricSnapshots).where(eq(metricSnapshots.entityId, postId));
        await tx.delete(rawSnapshots).where(eq(rawSnapshots.entityRef, String(postId)));
      await tx.delete(comments).where(eq(comments.parentPostId, postId));
      await tx.delete(posts).where(eq(posts.id, postId));
    });

    logger.info({ postId }, "Post and all dependent records deleted");
  }

  async deleteRunAccount(runAccountId: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(draftFeedbackSignals)
        .where(eq(draftFeedbackSignals.runAccountId, runAccountId));
      await tx.delete(llmDrafts).where(eq(llmDrafts.runAccountId, runAccountId));
      await tx.delete(deepScrapeTasks).where(eq(deepScrapeTasks.runAccountId, runAccountId));
      await tx.delete(postTriage).where(eq(postTriage.runAccountId, runAccountId));
      await tx
        .delete(metricSnapshots)
        .where(eq(metricSnapshots.runAccountId, runAccountId));
      await tx
        .delete(rawSnapshots)
        .where(eq(rawSnapshots.runAccountId, runAccountId));
      await tx
        .delete(engagementPolicySnapshots)
        .where(eq(engagementPolicySnapshots.runAccountId, runAccountId));
      await tx.delete(scrapeRunAccounts).where(eq(scrapeRunAccounts.id, runAccountId));
    });

    logger.info({ runAccountId }, "Run account and all dependent records deleted");
  }
}

export const deleteService = new DeleteService();
