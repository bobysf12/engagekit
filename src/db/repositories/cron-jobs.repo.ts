import { eq, and, desc } from "drizzle-orm";
import type { CronJob, NewCronJob, CronJobRun, NewCronJobRun } from "../schema";
import { cronJobs, cronJobRuns } from "../schema";
import { getDb } from "../client";
import { logger } from "../../core/logger";

export class CronJobsRepository {
  private db = getDb();

  async createJob(data: NewCronJob): Promise<CronJob> {
    const result = await this.db.insert(cronJobs).values(data).returning();
    if (!result || result.length === 0 || !result[0]) {
      throw new Error("Failed to create cron job");
    }
    logger.info({ jobId: result[0].id, accountId: data.accountId, name: data.name }, "Cron job created");
    return result[0];
  }

  async findJobById(id: number): Promise<CronJob | null> {
    const [result] = await this.db
      .select()
      .from(cronJobs)
      .where(eq(cronJobs.id, id))
      .limit(1);
    return result ?? null;
  }

  async listJobsByAccount(accountId: number): Promise<CronJob[]> {
    return this.db
      .select()
      .from(cronJobs)
      .where(eq(cronJobs.accountId, accountId))
      .orderBy(desc(cronJobs.createdAt));
  }

  async listEnabledJobs(): Promise<CronJob[]> {
    return this.db
      .select()
      .from(cronJobs)
      .where(eq(cronJobs.enabled, 1));
  }

  async listDueJobs(beforeTimestamp: number): Promise<CronJob[]> {
    return this.db
      .select()
      .from(cronJobs)
      .where(and(eq(cronJobs.enabled, 1), eq(cronJobs.nextRunAt, beforeTimestamp)));
  }

  async updateJob(id: number, data: Partial<NewCronJob>): Promise<CronJob | null> {
    const [result] = await this.db
      .update(cronJobs)
      .set({
        ...data,
        updatedAt: Math.floor(Date.now() / 1000),
      })
      .where(eq(cronJobs.id, id))
      .returning();
    return result ?? null;
  }

  async markJobRun(id: number, scrapeRunId: number, nextRunAt: number): Promise<CronJob | null> {
    const [result] = await this.db
      .update(cronJobs)
      .set({
        lastRunAt: Math.floor(Date.now() / 1000),
        nextRunAt,
        lastStatus: "running",
        updatedAt: Math.floor(Date.now() / 1000),
      })
      .where(eq(cronJobs.id, id))
      .returning();
    return result ?? null;
  }

  async markJobSuccess(id: number): Promise<CronJob | null> {
    const [result] = await this.db
      .update(cronJobs)
      .set({
        lastStatus: "success",
        lastError: null,
        updatedAt: Math.floor(Date.now() / 1000),
      })
      .where(eq(cronJobs.id, id))
      .returning();
    return result ?? null;
  }

  async markJobFailed(id: number, error: string): Promise<CronJob | null> {
    const [result] = await this.db
      .update(cronJobs)
      .set({
        lastStatus: "failed",
        lastError: error,
        updatedAt: Math.floor(Date.now() / 1000),
      })
      .where(eq(cronJobs.id, id))
      .returning();
    return result ?? null;
  }

  async enableJob(id: number): Promise<CronJob | null> {
    return this.updateJob(id, { enabled: 1 });
  }

  async disableJob(id: number): Promise<CronJob | null> {
    return this.updateJob(id, { enabled: 0 });
  }

  async deleteJob(id: number): Promise<void> {
    await this.db.delete(cronJobs).where(eq(cronJobs.id, id));
    logger.info({ jobId: id }, "Cron job deleted");
  }

  async createJobRun(data: NewCronJobRun): Promise<CronJobRun> {
    const result = await this.db.insert(cronJobRuns).values(data).returning();
    if (!result || result.length === 0 || !result[0]) {
      throw new Error("Failed to create cron job run");
    }
    logger.debug({ jobRunId: result[0].id, cronJobId: data.cronJobId }, "Cron job run created");
    return result[0];
  }

  async findJobRunById(id: number): Promise<CronJobRun | null> {
    const [result] = await this.db
      .select()
      .from(cronJobRuns)
      .where(eq(cronJobRuns.id, id))
      .limit(1);
    return result ?? null;
  }

  async listJobRunsByCronJob(cronJobId: number, limit: number = 20): Promise<CronJobRun[]> {
    return this.db
      .select()
      .from(cronJobRuns)
      .where(eq(cronJobRuns.cronJobId, cronJobId))
      .orderBy(desc(cronJobRuns.startedAt))
      .limit(limit);
  }

  async markJobRunSuccess(id: number): Promise<CronJobRun | null> {
    const [result] = await this.db
      .update(cronJobRuns)
      .set({
        status: "success",
        endedAt: Math.floor(Date.now() / 1000),
      })
      .where(eq(cronJobRuns.id, id))
      .returning();
    return result ?? null;
  }

  async markJobRunFailed(id: number, error: string): Promise<CronJobRun | null> {
    const [result] = await this.db
      .update(cronJobRuns)
      .set({
        status: "failed",
        endedAt: Math.floor(Date.now() / 1000),
        error,
      })
      .where(eq(cronJobRuns.id, id))
      .returning();
    return result ?? null;
  }
}

export const cronJobsRepo = new CronJobsRepository();
