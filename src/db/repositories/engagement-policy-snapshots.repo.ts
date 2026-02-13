import { eq } from "drizzle-orm";
import type { EngagementPolicySnapshot, NewEngagementPolicySnapshot } from "../schema";
import { engagementPolicySnapshots } from "../schema";
import { getDb } from "../client";
import { logger } from "../../core/logger";

export class EngagementPolicySnapshotsRepository {
  private db = getDb();

  async create(data: NewEngagementPolicySnapshot): Promise<EngagementPolicySnapshot> {
    const result = await this.db.insert(engagementPolicySnapshots).values(data).returning();
    if (!result || result.length === 0 || !result[0]) {
      throw new Error("Failed to create policy snapshot");
    }
    logger.debug({ snapshotId: result[0].id, runAccountId: data.runAccountId }, "Policy snapshot created");
    return result[0];
  }

  async findById(id: number): Promise<EngagementPolicySnapshot | null> {
    const [result] = await this.db
      .select()
      .from(engagementPolicySnapshots)
      .where(eq(engagementPolicySnapshots.id, id))
      .limit(1);
    return result ?? null;
  }

  async findByRunAccountId(runAccountId: number): Promise<EngagementPolicySnapshot | null> {
    const [result] = await this.db
      .select()
      .from(engagementPolicySnapshots)
      .where(eq(engagementPolicySnapshots.runAccountId, runAccountId))
      .limit(1);
    return result ?? null;
  }

  async createOrSkip(data: NewEngagementPolicySnapshot): Promise<EngagementPolicySnapshot> {
    const existing = await this.findByRunAccountId(data.runAccountId);
    if (existing) {
      return existing;
    }
    return this.create(data);
  }
}

export const policySnapshotsRepo = new EngagementPolicySnapshotsRepository();
