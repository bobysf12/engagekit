import { eq, and, desc, inArray } from "drizzle-orm";
import type { PostTriage, NewPostTriage } from "../schema";
import { postTriage } from "../schema";
import { getDb } from "../client";
import { logger } from "../../core/logger";

export class PostTriageRepository {
  private db = getDb();

  async create(data: NewPostTriage): Promise<PostTriage> {
    const result = await this.db.insert(postTriage).values(data).returning();
    if (!result || result.length === 0 || !result[0]) {
      throw new Error("Failed to create post triage");
    }
    logger.debug({ triageId: result[0].id, postId: data.postId }, "Post triage created");
    return result[0];
  }

  async findById(id: number): Promise<PostTriage | null> {
    const [result] = await this.db
      .select()
      .from(postTriage)
      .where(eq(postTriage.id, id))
      .limit(1);
    return result ?? null;
  }

  async findByRunAccountAndPost(runAccountId: number, postId: number): Promise<PostTriage | null> {
    const [result] = await this.db
      .select()
      .from(postTriage)
      .where(and(eq(postTriage.runAccountId, runAccountId), eq(postTriage.postId, postId)))
      .limit(1);
    return result ?? null;
  }

  async listByRunAccount(runAccountId: number, limit: number = 100): Promise<PostTriage[]> {
    return this.db
      .select()
      .from(postTriage)
      .where(eq(postTriage.runAccountId, runAccountId))
      .orderBy(desc(postTriage.relevanceScore))
      .limit(limit);
  }

  async listSelectedForDeepScrape(runAccountId: number): Promise<PostTriage[]> {
    return this.db
      .select()
      .from(postTriage)
      .where(and(eq(postTriage.runAccountId, runAccountId), eq(postTriage.selectedForDeepScrape, 1)))
      .orderBy(desc(postTriage.relevanceScore));
  }

  async listTop20(runAccountId: number): Promise<PostTriage[]> {
    return this.db
      .select()
      .from(postTriage)
      .where(and(eq(postTriage.runAccountId, runAccountId), eq(postTriage.isTop20, 1)))
      .orderBy(desc(postTriage.relevanceScore));
  }

  async updateSelectionFlags(
    runAccountId: number,
    postId: number,
    flags: { isTop20?: boolean; selectedForDeepScrape?: boolean; rank?: number }
  ): Promise<PostTriage | null> {
    const [result] = await this.db
      .update(postTriage)
      .set({
        isTop20: flags.isTop20 !== undefined ? (flags.isTop20 ? 1 : 0) : undefined,
        selectedForDeepScrape: flags.selectedForDeepScrape !== undefined ? (flags.selectedForDeepScrape ? 1 : 0) : undefined,
        rank: flags.rank,
      })
      .where(and(eq(postTriage.runAccountId, runAccountId), eq(postTriage.postId, postId)))
      .returning();
    return result ?? null;
  }

  async bulkCreateOrSkip(dataArray: NewPostTriage[]): Promise<PostTriage[]> {
    const results: PostTriage[] = [];
    for (const data of dataArray) {
      const existing = await this.findByRunAccountAndPost(data.runAccountId, data.postId);
      if (existing) {
        results.push(existing);
      } else {
        const created = await this.create(data);
        results.push(created);
      }
    }
    return results;
  }

  async deleteByRunAccount(runAccountId: number): Promise<void> {
    await this.db.delete(postTriage).where(eq(postTriage.runAccountId, runAccountId));
    logger.debug({ runAccountId }, "Deleted post triage records for run account");
  }
}

export const postTriageRepo = new PostTriageRepository();
