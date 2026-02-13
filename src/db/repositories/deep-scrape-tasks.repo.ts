import { eq, and } from "drizzle-orm";
import type { DeepScrapeTask, NewDeepScrapeTask } from "../schema";
import { deepScrapeTasks } from "../schema";
import { getDb } from "../client";
import { logger } from "../../core/logger";

export class DeepScrapeTasksRepository {
  private db = getDb();

  async create(data: NewDeepScrapeTask): Promise<DeepScrapeTask> {
    const result = await this.db.insert(deepScrapeTasks).values(data).returning();
    if (!result || result.length === 0 || !result[0]) {
      throw new Error("Failed to create deep scrape task");
    }
    logger.debug({ taskId: result[0].id, postId: data.postId }, "Deep scrape task created");
    return result[0];
  }

  async findById(id: number): Promise<DeepScrapeTask | null> {
    const [result] = await this.db
      .select()
      .from(deepScrapeTasks)
      .where(eq(deepScrapeTasks.id, id))
      .limit(1);
    return result ?? null;
  }

  async findByRunAccountAndPost(runAccountId: number, postId: number): Promise<DeepScrapeTask | null> {
    const [result] = await this.db
      .select()
      .from(deepScrapeTasks)
      .where(and(eq(deepScrapeTasks.runAccountId, runAccountId), eq(deepScrapeTasks.postId, postId)))
      .limit(1);
    return result ?? null;
  }

  async listByRunAccount(runAccountId: number): Promise<DeepScrapeTask[]> {
    return this.db
      .select()
      .from(deepScrapeTasks)
      .where(eq(deepScrapeTasks.runAccountId, runAccountId));
  }

  async listByStatus(runAccountId: number, status: DeepScrapeTask["status"]): Promise<DeepScrapeTask[]> {
    return this.db
      .select()
      .from(deepScrapeTasks)
      .where(and(eq(deepScrapeTasks.runAccountId, runAccountId), eq(deepScrapeTasks.status, status)));
  }

  async markRunning(id: number): Promise<DeepScrapeTask | null> {
    const [result] = await this.db
      .update(deepScrapeTasks)
      .set({
        status: "running",
        startedAt: Math.floor(Date.now() / 1000),
        updatedAt: Math.floor(Date.now() / 1000),
      })
      .where(eq(deepScrapeTasks.id, id))
      .returning();
    return result ?? null;
  }

  async markSuccess(id: number): Promise<DeepScrapeTask | null> {
    const [result] = await this.db
      .update(deepScrapeTasks)
      .set({
        status: "success",
        endedAt: Math.floor(Date.now() / 1000),
        updatedAt: Math.floor(Date.now() / 1000),
      })
      .where(eq(deepScrapeTasks.id, id))
      .returning();
    return result ?? null;
  }

  async markFailed(id: number, errorCode: string, errorDetail: string): Promise<DeepScrapeTask | null> {
    const task = await this.findById(id);
    const [result] = await this.db
      .update(deepScrapeTasks)
      .set({
        status: "failed",
        attemptCount: (task?.attemptCount ?? 0) + 1,
        lastErrorCode: errorCode,
        lastErrorDetail: errorDetail,
        endedAt: Math.floor(Date.now() / 1000),
        updatedAt: Math.floor(Date.now() / 1000),
      })
      .where(eq(deepScrapeTasks.id, id))
      .returning();
    return result ?? null;
  }

  async incrementAttempt(id: number): Promise<DeepScrapeTask | null> {
    const task = await this.findById(id);
    if (!task) return null;
    const [result] = await this.db
      .update(deepScrapeTasks)
      .set({
        attemptCount: task.attemptCount + 1,
        updatedAt: Math.floor(Date.now() / 1000),
      })
      .where(eq(deepScrapeTasks.id, id))
      .returning();
    return result ?? null;
  }

  async createOrSkip(data: NewDeepScrapeTask): Promise<DeepScrapeTask> {
    const existing = await this.findByRunAccountAndPost(data.runAccountId, data.postId);
    if (existing) {
      return existing;
    }
    return this.create(data);
  }

  async deleteByRunAccount(runAccountId: number): Promise<void> {
    await this.db.delete(deepScrapeTasks).where(eq(deepScrapeTasks.runAccountId, runAccountId));
    logger.debug({ runAccountId }, "Deleted deep scrape tasks for run account");
  }
}

export const deepScrapeTasksRepo = new DeepScrapeTasksRepository();
