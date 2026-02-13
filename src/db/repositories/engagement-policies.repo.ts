import { eq, and, desc } from "drizzle-orm";
import type { EngagementPolicy, NewEngagementPolicy } from "../schema";
import { engagementPolicies } from "../schema";
import { getDb } from "../client";
import { logger } from "../../core/logger";

export class EngagementPoliciesRepository {
  private db = getDb();

  async create(data: NewEngagementPolicy): Promise<EngagementPolicy> {
    const result = await this.db.insert(engagementPolicies).values(data).returning();
    if (!result || result.length === 0 || !result[0]) {
      throw new Error("Failed to create engagement policy");
    }
    logger.info({ policyId: result[0].id, accountId: data.accountId }, "Engagement policy created");
    return result[0];
  }

  async findById(id: number): Promise<EngagementPolicy | null> {
    const [result] = await this.db
      .select()
      .from(engagementPolicies)
      .where(eq(engagementPolicies.id, id))
      .limit(1);
    return result ?? null;
  }

  async findByAccountId(accountId: number): Promise<EngagementPolicy | null> {
    const [result] = await this.db
      .select()
      .from(engagementPolicies)
      .where(and(eq(engagementPolicies.accountId, accountId), eq(engagementPolicies.isActive, 1)))
      .limit(1);
    return result ?? null;
  }

  async upsertByAccountId(accountId: number, data: Omit<NewEngagementPolicy, "accountId">): Promise<EngagementPolicy> {
    const existing = await this.findByAccountId(accountId);
    if (existing) {
      const [result] = await this.db
        .update(engagementPolicies)
        .set({
          ...data,
          updatedAt: Math.floor(Date.now() / 1000),
        })
        .where(eq(engagementPolicies.id, existing.id))
        .returning();
      if (!result) {
        throw new Error("Failed to update engagement policy");
      }
      logger.info({ policyId: result.id, accountId }, "Engagement policy updated");
      return result;
    }
    return this.create({ ...data, accountId });
  }

  async update(id: number, data: Partial<NewEngagementPolicy>): Promise<EngagementPolicy | null> {
    const [result] = await this.db
      .update(engagementPolicies)
      .set({
        ...data,
        updatedAt: Math.floor(Date.now() / 1000),
      })
      .where(eq(engagementPolicies.id, id))
      .returning();
    return result ?? null;
  }

  async deactivateByAccountId(accountId: number): Promise<void> {
    await this.db
      .update(engagementPolicies)
      .set({ isActive: 0, updatedAt: Math.floor(Date.now() / 1000) })
      .where(eq(engagementPolicies.accountId, accountId));
    logger.debug({ accountId }, "Deactivated engagement policies for account");
  }
}

export const engagementPoliciesRepo = new EngagementPoliciesRepository();
