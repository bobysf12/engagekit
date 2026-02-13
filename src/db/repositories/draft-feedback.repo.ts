import { eq, and, desc } from "drizzle-orm";
import type { DraftFeedbackSignal, NewDraftFeedbackSignal, LlmDraft, NewLlmDraft } from "../schema";
import { draftFeedbackSignals, llmDrafts } from "../schema";
import { getDb } from "../client";
import { logger } from "../../core/logger";

export class DraftFeedbackRepository {
  private db = getDb();

  async createSignal(data: NewDraftFeedbackSignal): Promise<DraftFeedbackSignal> {
    const result = await this.db.insert(draftFeedbackSignals).values(data).returning();
    if (!result || result.length === 0 || !result[0]) {
      throw new Error("Failed to create draft feedback signal");
    }
    logger.info({ signalId: result[0].id, postId: data.postId }, "Draft feedback signal created");
    return result[0];
  }

  async findSignalById(id: number): Promise<DraftFeedbackSignal | null> {
    const [result] = await this.db
      .select()
      .from(draftFeedbackSignals)
      .where(eq(draftFeedbackSignals.id, id))
      .limit(1);
    return result ?? null;
  }

  async findSignalByPostId(postId: number): Promise<DraftFeedbackSignal | null> {
    const [result] = await this.db
      .select()
      .from(draftFeedbackSignals)
      .where(eq(draftFeedbackSignals.postId, postId))
      .orderBy(desc(draftFeedbackSignals.createdAt))
      .limit(1);
    return result ?? null;
  }

  async listSignalsByRunAccount(runAccountId: number, limit: number = 50): Promise<DraftFeedbackSignal[]> {
    return this.db
      .select()
      .from(draftFeedbackSignals)
      .where(eq(draftFeedbackSignals.runAccountId, runAccountId))
      .orderBy(desc(draftFeedbackSignals.createdAt))
      .limit(limit);
  }

  async listApprovedDraftsForStyle(accountId: number, limit: number = 20): Promise<LlmDraft[]> {
    return this.db
      .select()
      .from(llmDrafts)
      .where(eq(llmDrafts.status, "approved"))
      .orderBy(desc(llmDrafts.selectedAt))
      .limit(limit);
  }

  async createDraft(data: NewLlmDraft): Promise<LlmDraft> {
    const result = await this.db.insert(llmDrafts).values(data).returning();
    if (!result || result.length === 0 || !result[0]) {
      throw new Error("Failed to create draft");
    }
    logger.debug({ draftId: result[0].id }, "Draft created");
    return result[0];
  }

  async findDraftById(id: number): Promise<LlmDraft | null> {
    const [result] = await this.db
      .select()
      .from(llmDrafts)
      .where(eq(llmDrafts.id, id))
      .limit(1);
    return result ?? null;
  }

  async findDraftsByPost(runAccountId: number, postId: number): Promise<LlmDraft[]> {
    return this.db
      .select()
      .from(llmDrafts)
      .where(and(eq(llmDrafts.runAccountId, runAccountId), eq(llmDrafts.postId, postId)))
      .orderBy(llmDrafts.optionIndex);
  }

  async selectDraft(id: number, selectedBy: string, metadata?: Record<string, unknown>): Promise<LlmDraft | null> {
    const [result] = await this.db
      .update(llmDrafts)
      .set({
        status: "approved",
        selectedAt: Math.floor(Date.now() / 1000),
        selectedBy,
      })
      .where(eq(llmDrafts.id, id))
      .returning();
    return result ?? null;
  }

  async rejectDraft(id: number): Promise<LlmDraft | null> {
    const [result] = await this.db
      .update(llmDrafts)
      .set({
        status: "rejected",
        reviewedAt: Math.floor(Date.now() / 1000),
      })
      .where(eq(llmDrafts.id, id))
      .returning();
    return result ?? null;
  }
}

export const draftFeedbackRepo = new DraftFeedbackRepository();
