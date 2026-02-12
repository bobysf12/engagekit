import { eq, and, desc } from "drizzle-orm";
import type { MetricSnapshot, NewMetricSnapshot } from "../schema";
import { metricSnapshots } from "../schema";
import { getDb } from "../client";

export class MetricsRepository {
  private db = getDb();

  async create(data: NewMetricSnapshot): Promise<MetricSnapshot> {
    const result = await this.db.insert(metricSnapshots).values(data).returning();
    if (!result || result.length === 0 || !result[0]) {
      throw new Error("Failed to create metric snapshot");
    }
    return result[0];
  }

  async bulkCreate(dataArray: NewMetricSnapshot[]): Promise<MetricSnapshot[]> {
    const results: MetricSnapshot[] = [];
    for (const data of dataArray) {
      results.push(await this.create(data));
    }
    return results;
  }

  async findByEntity(
    entityType: "post" | "comment",
    entityId: number,
    limit: number = 10
  ): Promise<MetricSnapshot[]> {
    return this.db
      .select()
      .from(metricSnapshots)
      .where(and(eq(metricSnapshots.entityType, entityType), eq(metricSnapshots.entityId, entityId)))
      .orderBy(desc(metricSnapshots.capturedAt))
      .limit(limit);
  }

  async findLatestByEntity(
    entityType: "post" | "comment",
    entityId: number
  ): Promise<MetricSnapshot | null> {
    const [result] = await this.findByEntity(entityType, entityId, 1);
    return result ?? null;
  }
}

export const metricsRepo = new MetricsRepository();
