import { eq, and, desc } from "drizzle-orm";
import type { Account, NewAccount } from "../schema";
import { accounts } from "../schema";
import { getDb } from "../client";
import { logger } from "../../core/logger";

export class AccountsRepository {
  private db = getDb();

  async create(data: NewAccount): Promise<Account> {
    const result = await this.db.insert(accounts).values(data).returning();
    if (!result || result.length === 0 || !result[0]) {
      throw new Error("Failed to create account");
    }
    logger.info({ accountId: result[0].id, platform: result[0].platform }, "Account created");
    return result[0];
  }

  async findById(id: number): Promise<Account | null> {
    const [result] = await this.db.select().from(accounts).where(eq(accounts.id, id)).limit(1);
    return result ?? null;
  }

  async findByHandle(platform: string, handle: string): Promise<Account | null> {
    const [result] = await this.db
      .select()
      .from(accounts)
      .where(and(eq(accounts.platform, platform), eq(accounts.handle, handle)))
      .limit(1);
    return result ?? null;
  }

  async findByStatus(status: string): Promise<Account[]> {
    return this.db.select().from(accounts).where(eq(accounts.status, status as any));
  }

  async listByPlatform(platform: string): Promise<Account[]> {
    return this.db
      .select()
      .from(accounts)
      .where(eq(accounts.platform, platform))
      .orderBy(desc(accounts.createdAt));
  }

  async update(id: number, data: Partial<NewAccount>): Promise<Account | null> {
    const [result] = await this.db
      .update(accounts)
      .set({ ...data, updatedAt: Math.floor(Date.now() / 1000) })
      .where(eq(accounts.id, id))
      .returning();
    return result ?? null;
  }

  async updateStatus(id: number, status: Account["status"]): Promise<Account | null> {
    return this.update(id, { status });
  }

  async setNeedsReauth(
    id: number,
    errorCode: string,
    errorDetail: string
  ): Promise<Account | null> {
    return this.update(id, {
      status: "needs_reauth",
      lastErrorCode: errorCode,
      lastErrorDetail: errorDetail,
      lastErrorAt: Math.floor(Date.now() / 1000),
    });
  }

  async clearAuthError(id: number): Promise<Account | null> {
    return this.update(id, {
      lastErrorCode: null,
      lastErrorDetail: null,
      lastErrorAt: null,
    });
  }
}

export const accountsRepo = new AccountsRepository();
