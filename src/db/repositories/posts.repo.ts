import { eq, and, desc, inArray, sql } from "drizzle-orm";
import type { Post, NewPost } from "../schema";
import { posts } from "../schema";
import { getDb } from "../client";
import { logger } from "../../core/logger";

export class PostsRepository {
  private db = getDb();

  async create(data: NewPost): Promise<Post | null> {
    try {
      const result = await this.db.insert(posts).values(data).returning();
      if (!result || result.length === 0 || !result[0]) {
        return null;
      }
      logger.debug({ postId: result[0].id }, "Post created");
      return result[0];
    } catch (error: any) {
      if (error.message?.includes("UNIQUE constraint failed")) {
        return this.updateLastSeen(data);
      }
      throw error;
    }
  }

  async findById(id: number): Promise<Post | null> {
    const [result] = await this.db.select().from(posts).where(eq(posts.id, id)).limit(1);
    return result ?? null;
  }

  async findByPlatformPostId(platform: string, platformPostId: string): Promise<Post | null> {
    const [result] = await this.db
      .select()
      .from(posts)
      .where(and(eq(posts.platform, platform), eq(posts.platformPostId, platformPostId)))
      .limit(1);
    return result ?? null;
  }

  async findByContentHash(contentHash: string): Promise<Post[]> {
    return this.db.select().from(posts).where(eq(posts.contentHash, contentHash));
  }

  async updateLastSeen(data: NewPost): Promise<Post | null> {
    if (!data.platformPostId) return null;
    
    const [result] = await this.db
      .update(posts)
      .set({
        lastSeenAt: Math.floor(Date.now() / 1000),
        // Update bodyText if it was previously null/empty but we now have it
        ...(data.bodyText ? { bodyText: data.bodyText } : {}),
      })
      .where(
        and(
          eq(posts.platform, data.platform),
          eq(posts.platformPostId, data.platformPostId)
        )
      )
      .returning();
    logger.debug({ postId: result?.id }, "Post lastSeenAt updated");
    return result ?? null;
  }

  async bulkCreateOrUpdate(dataArray: NewPost[]): Promise<Post[]> {
    const results: Post[] = [];
    for (const data of dataArray) {
      const result = await this.create(data);
      if (result) results.push(result);
    }
    return results;
  }

  async listBySourceAccount(
    sourceAccountId: number,
    limit: number = 100
  ): Promise<Post[]> {
    return this.db
      .select()
      .from(posts)
      .where(eq(posts.sourceAccountId, sourceAccountId))
      .orderBy(desc(posts.lastSeenAt))
      .limit(limit);
  }

  async listRecent(platform: string, limit: number = 100): Promise<Post[]> {
    return this.db
      .select()
      .from(posts)
      .where(eq(posts.platform, platform))
      .orderBy(desc(posts.publishedAt))
      .limit(limit);
  }

  async listByRunAccount(runAccountId: number, accountId: number, sinceTimestamp: number, limit: number = 200): Promise<Post[]> {
    return this.db
      .select()
      .from(posts)
      .where(
        and(
          eq(posts.sourceAccountId, accountId),
          sql`${posts.firstSeenAt} >= ${sinceTimestamp}`
        )
      )
      .orderBy(desc(posts.firstSeenAt))
      .limit(limit);
  }

  async listPaginated(options: {
    limit?: number;
    offset?: number;
    platform?: string;
    sourceAccountId?: number;
    engaged?: boolean;
  }): Promise<{ posts: Post[]; total: number }> {
    const { limit = 50, offset = 0, platform, sourceAccountId, engaged } = options;
    
    const conditions = [];
    if (platform) conditions.push(eq(posts.platform, platform));
    if (sourceAccountId) conditions.push(eq(posts.sourceAccountId, sourceAccountId));
    if (engaged !== undefined) conditions.push(eq(posts.engaged, engaged ? 1 : 0));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const postsResult = await this.db
      .select()
      .from(posts)
      .where(whereClause)
      .orderBy(desc(posts.lastSeenAt))
      .limit(limit)
      .offset(offset);

    const countResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(posts)
      .where(whereClause);

    const total = countResult[0]?.count ?? 0;

    return { posts: postsResult, total };
  }

  async updateEngagement(
    id: number,
    engaged: boolean,
    engagedBy?: string
  ): Promise<Post | null> {
    const now = Math.floor(Date.now() / 1000);
    const [result] = await this.db
      .update(posts)
      .set({
        engaged: engaged ? 1 : 0,
        engagedAt: engaged ? now : null,
        engagedBy: engaged ? (engagedBy ?? null) : null,
      })
      .where(eq(posts.id, id))
      .returning();
    logger.debug({ postId: id, engaged }, "Post engagement updated");
    return result ?? null;
  }

  async delete(id: number): Promise<boolean> {
    const result = await this.db.delete(posts).where(eq(posts.id, id)).returning();
    return result.length > 0;
  }
}

export const postsRepo = new PostsRepository();
