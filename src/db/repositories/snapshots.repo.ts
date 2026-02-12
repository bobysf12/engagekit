import { eq, and } from "drizzle-orm";
import type { RawSnapshot, NewRawSnapshot } from "../schema";
import { rawSnapshots } from "../schema";
import { getDb } from "../client";

export class SnapshotsRepository {
  private db = getDb();

  async create(data: NewRawSnapshot): Promise<RawSnapshot | null> {
    try {
      const result = await this.db.insert(rawSnapshots).values(data).returning();
      if (!result || result.length === 0 || !result[0]) {
        return null;
      }
      return result[0];
    } catch (error: any) {
      if (error.message?.includes("UNIQUE constraint failed")) {
        return null;
      }
      throw error;
    }
  }

  async bulkCreate(dataArray: NewRawSnapshot[]): Promise<RawSnapshot[]> {
    const results: RawSnapshot[] = [];
    for (const data of dataArray) {
      const result = await this.create(data);
      if (result) results.push(result);
    }
    return results;
  }

  async findByRunAccount(runAccountId: number): Promise<RawSnapshot[]> {
    return this.db.select().from(rawSnapshots).where(eq(rawSnapshots.runAccountId, runAccountId));
  }
}

export const snapshotsRepo = new SnapshotsRepository();
