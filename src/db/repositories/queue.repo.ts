import { eq, and, desc } from "drizzle-orm";
import type { EngagementQueue, NewEngagementQueue, LlmDraft, NewLlmDraft } from "../schema";
import { engagementQueue, llmDrafts } from "../schema";
import { getDb } from "../client";

export class QueueRepository {
  private db = getDb();

  async createItem(data: NewEngagementQueue): Promise<EngagementQueue> {
    const result = await this.db.insert(engagementQueue).values(data).returning();
    if (!result || result.length === 0 || !result[0]) {
      throw new Error("Failed to create queue item");
    }
    return result[0];
  }

  async findById(id: number): Promise<EngagementQueue | null> {
    const [result] = await this.db.select().from(engagementQueue).where(eq(engagementQueue.id, id)).limit(1);
    return result ?? null;
  }

  async listByStatus(status: string, limit: number = 50): Promise<EngagementQueue[]> {
    return this.db
      .select()
      .from(engagementQueue)
      .where(eq(engagementQueue.status, status as any))
      .orderBy(desc(engagementQueue.priority), desc(engagementQueue.createdAt))
      .limit(limit);
  }

  async updateStatus(id: number, status: EngagementQueue["status"]): Promise<EngagementQueue | null> {
    const [result] = await this.db
      .update(engagementQueue)
      .set({ status, updatedAt: Math.floor(Date.now() / 1000) })
      .where(eq(engagementQueue.id, id))
      .returning();
    return result ?? null;
  }

  async createDraft(data: NewLlmDraft): Promise<LlmDraft> {
    const result = await this.db.insert(llmDrafts).values(data).returning();
    if (!result || result.length === 0 || !result[0]) {
      throw new Error("Failed to create draft");
    }
    return result[0];
  }

  async findDraftsByQueueId(queueId: number): Promise<LlmDraft[]> {
    return this.db
      .select()
      .from(llmDrafts)
      .where(eq(llmDrafts.queueId, queueId))
      .orderBy(desc(llmDrafts.createdAt));
  }
}

export const queueRepo = new QueueRepository();
