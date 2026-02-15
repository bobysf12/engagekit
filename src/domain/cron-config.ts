import { z } from "zod";
import type { CronJob } from "../db/schema";

export const CronSourceSchema = z.object({
  type: z.enum(["home", "profile", "search"]),
  value: z.string().optional(),
});

export const CronPipelineConfigSchema = z.object({
  sources: z.array(CronSourceSchema).min(1),
  maxPostsPerRun: z.number().int().min(1).max(500).default(100),
  clearStatusPerRun: z.boolean().default(false),
  generateDrafts: z.boolean().default(true),
});

export type CronSource = z.infer<typeof CronSourceSchema>;
export type CronPipelineConfig = z.infer<typeof CronPipelineConfigSchema>;

export function parsePipelineConfig(json: string | null): CronPipelineConfig | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    return CronPipelineConfigSchema.parse(parsed);
  } catch {
    return null;
  }
}

export function serializePipelineConfig(config: CronPipelineConfig): string {
  return JSON.stringify(config);
}

export function getDefaultPipelineConfig(): CronPipelineConfig {
  return {
    sources: [{ type: "home" }],
    maxPostsPerRun: 100,
    clearStatusPerRun: false,
    generateDrafts: true,
  };
}

export function getSourcesFromConfig(config: CronPipelineConfig): {
  collectHome: boolean;
  profileHandles: string[];
  searchQueries: string[];
} {
  const collectHome = config.sources.some((s) => s.type === "home");
  const profileHandles = config.sources
    .filter((s) => s.type === "profile" && s.value)
    .map((s) => s.value!);
  const searchQueries = config.sources
    .filter((s) => s.type === "search" && s.value)
    .map((s) => s.value!);

  return { collectHome, profileHandles, searchQueries };
}
