import { eq, and, desc } from "drizzle-orm";
import type { Comment, NewComment } from "../schema";
import { comments } from "../schema";
import { getDb } from "../client";
import { logger } from "../../core/logger";

export class CommentsRepository {
  private db = getDb();

  async create(data: NewComment): Promise<Comment | null> {
    try {
      const result = await this.db.insert(comments).values(data).returning();
      if (!result || result.length === 0 || !result[0]) {
        return null;
      }
      logger.debug({ commentId: result[0].id }, "Comment created");
      return result[0];
    } catch (error: any) {
      if (error.message?.includes("UNIQUE constraint failed")) {
        return this.updateLastSeen(data);
      }
      throw error;
    }
  }

  async findById(id: number): Promise<Comment | null> {
    const [result] = await this.db.select().from(comments).where(eq(comments.id, id)).limit(1);
    return result ?? null;
  }

  async findByPlatformCommentId(platform: string, platformCommentId: string): Promise<Comment | null> {
    const [result] = await this.db
      .select()
      .from(comments)
      .where(and(eq(comments.platform, platform), eq(comments.platformCommentId, platformCommentId)))
      .limit(1);
    return result ?? null;
  }

  async findByParentPostId(parentPostId: number): Promise<Comment[]> {
    return this.db
      .select()
      .from(comments)
      .where(eq(comments.parentPostId, parentPostId))
      .orderBy(desc(comments.publishedAt));
  }

  async updateLastSeen(data: NewComment): Promise<Comment | null> {
    const [result] = await this.db
      .update(comments)
      .set({
        lastSeenAt: Math.floor(Date.now() / 1000),
      })
      .where(eq(comments.contentHash, data.contentHash))
      .returning();
    logger.debug({ commentId: result?.id }, "Comment lastSeenAt updated");
    return result ?? null;
  }

  async bulkCreateOrUpdate(dataArray: NewComment[]): Promise<Comment[]> {
    const results: Comment[] = [];
    for (const data of dataArray) {
      const result = await this.create(data);
      if (result) results.push(result);
    }
    return results;
  }
}

export const commentsRepo = new CommentsRepository();
