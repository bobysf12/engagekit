import { eq, and, desc } from "drizzle-orm";
import type { ScrapeRun, NewScrapeRun, ScrapeRunAccount, NewScrapeRunAccount } from "../schema";
import { scrapeRuns, scrapeRunAccounts } from "../schema";
import { getDb } from "../client";
import { logger } from "../../core/logger";

export class RunsRepository {
  private db = getDb();

  async createRun(data: NewScrapeRun): Promise<ScrapeRun> {
    const result = await this.db.insert(scrapeRuns).values(data).returning();
    if (!result || result.length === 0 || !result[0]) {
      throw new Error("Failed to create scrape run");
    }
    logger.info({ runId: result[0].id, trigger: result[0].trigger }, "Scrape run created");
    return result[0];
  }

  async findById(id: number): Promise<ScrapeRun | null> {
    const [result] = await this.db.select().from(scrapeRuns).where(eq(scrapeRuns.id, id)).limit(1);
    return result ?? null;
  }

  async listRecent(limit: number = 20): Promise<ScrapeRun[]> {
    return this.db
      .select()
      .from(scrapeRuns)
      .orderBy(desc(scrapeRuns.startedAt))
      .limit(limit);
  }

  async updateRun(id: number, data: Partial<NewScrapeRun>): Promise<ScrapeRun | null> {
    const [result] = await this.db.update(scrapeRuns).set(data).where(eq(scrapeRuns.id, id)).returning();
    return result ?? null;
  }

  async createRunAccount(data: NewScrapeRunAccount): Promise<ScrapeRunAccount> {
    const result = await this.db.insert(scrapeRunAccounts).values(data).returning();
    if (!result || result.length === 0 || !result[0]) {
      throw new Error("Failed to create run account");
    }
    logger.debug({ runAccountId: result[0].id, accountId: data.accountId }, "Run account created");
    return result[0];
  }

  async findRunAccountById(id: number): Promise<ScrapeRunAccount | null> {
    const [result] = await this.db
      .select()
      .from(scrapeRunAccounts)
      .where(eq(scrapeRunAccounts.id, id))
      .limit(1);
    return result ?? null;
  }

  async findByRunId(runId: number): Promise<ScrapeRunAccount[]> {
    return this.db
      .select()
      .from(scrapeRunAccounts)
      .where(eq(scrapeRunAccounts.runId, runId));
  }

  async updateRunAccount(id: number, data: Partial<NewScrapeRunAccount>): Promise<ScrapeRunAccount | null> {
    const [result] = await this.db.update(scrapeRunAccounts).set(data).where(eq(scrapeRunAccounts.id, id)).returning();
    return result ?? null;
  }

  async markRunAccountSuccess(id: number, counters: { postsFound: number; commentsFound: number; snapshotsWritten: number }): Promise<void> {
    await this.updateRunAccount(id, {
      status: "success",
      ...counters,
      endedAt: Math.floor(Date.now() / 1000),
    });
  }

  async markRunAccountSkippedNeedsReauth(id: number): Promise<void> {
    await this.updateRunAccount(id, {
      status: "skipped_needs_reauth",
      endedAt: Math.floor(Date.now() / 1000),
    });
  }

  async markRunAccountFailed(id: number, errorCode: string, errorDetail: string): Promise<void> {
    await this.updateRunAccount(id, {
      status: "failed",
      errorCode,
      errorDetail,
      endedAt: Math.floor(Date.now() / 1000),
    });
  }
}

export const runsRepo = new RunsRepository();
