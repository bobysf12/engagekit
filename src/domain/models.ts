import { z } from "zod";

export const PlatformSchema = z.enum(["threads", "x"]);
export type Platform = z.infer<typeof PlatformSchema>;

export const AccountStatusSchema = z.enum([
  "active",
  "needs_initial_auth",
  "needs_reauth",
  "disabled",
]);
export type AccountStatus = z.infer<typeof AccountStatusSchema>;

export const ScrapeRunStatusSchema = z.enum(["running", "success", "partial", "failed"]);
export type ScrapeRunStatus = z.infer<typeof ScrapeRunStatusSchema>;

export const ScrapeRunAccountStatusSchema = z.enum([
  "running",
  "success",
  "skipped_needs_reauth",
  "failed",
]);
export type ScrapeRunAccountStatus = z.infer<typeof ScrapeRunAccountStatusSchema>;

export const EntityTypeSchema = z.enum(["post", "comment"]);
export type EntityType = z.infer<typeof EntityTypeSchema>;

export const SnapshotEntityTypeSchema = z.enum(["post", "comment", "thread", "notification"]);
export type SnapshotEntityType = z.infer<typeof SnapshotEntityTypeSchema>;

export const EngagementQueueStatusSchema = z.enum(["pending", "in_review", "done", "dismissed"]);
export type EngagementQueueStatus = z.infer<typeof EngagementQueueStatusSchema>;

export const LlmDraftStatusSchema = z.enum(["generated", "approved", "rejected"]);
export type LlmDraftStatus = z.infer<typeof LlmDraftStatusSchema>;

export const CollectedPostSchema = z.object({
  platformPostId: z.string().nullable(),
  authorHandle: z.string(),
  authorDisplayName: z.string(),
  bodyText: z.string().nullable(),
  contentHash: z.string(),
  postUrl: z.string().nullable(),
  threadRootPlatformPostId: z.string().nullable(),
  publishedAt: z.number().nullable(),
  mediaUrls: z.array(z.string()).default([]),
});
export type CollectedPost = z.infer<typeof CollectedPostSchema>;

export const CollectedCommentSchema = z.object({
  platformCommentId: z.string().nullable(),
  authorHandle: z.string(),
  authorDisplayName: z.string(),
  bodyText: z.string().nullable(),
  contentHash: z.string(),
  commentUrl: z.string().nullable(),
  publishedAt: z.number().nullable(),
  mediaUrls: z.array(z.string()).default([]),
});
export type CollectedComment = z.infer<typeof CollectedCommentSchema>;

export const MetricSnapshotSchema = z.object({
  likesCount: z.number().nullable(),
  repliesCount: z.number().nullable(),
  repostsCount: z.number().nullable(),
  viewsCount: z.number().nullable(),
});
export type MetricSnapshot = z.infer<typeof MetricSnapshotSchema>;

export const AuthStateSchema = z.object({
  isValid: z.boolean(),
  error: z.string().nullable(),
});
export type AuthState = z.infer<typeof AuthStateSchema>;

export const RelevanceLabelSchema = z.enum(["keep", "maybe", "drop"]);
export type RelevanceLabel = z.infer<typeof RelevanceLabelSchema>;

export const TriageActionSchema = z.enum(["reply", "quote", "save", "ignore"]);
export type TriageAction = z.infer<typeof TriageActionSchema>;

export const PostTriageOutputSchema = z.object({
  relevance_score: z.number().min(0).max(100),
  relevance_label: RelevanceLabelSchema,
  reasons: z.array(z.string()),
  action: TriageActionSchema,
  confidence: z.number().min(0).max(1),
});
export type PostTriageOutput = z.infer<typeof PostTriageOutputSchema>;

export const EngagementGoalSchema = z.enum(["reply", "quote", "learn", "find_leads", "build_in_public"]);
export type EngagementGoal = z.infer<typeof EngagementGoalSchema>;

export const EngagementPolicyInputSchema = z.object({
  topics: z.array(z.string()),
  goals: z.array(EngagementGoalSchema),
  avoidList: z.array(z.string()),
  toneIdentity: z.string(),
  preferredLanguages: z.array(z.string()),
});
export type EngagementPolicyInput = z.infer<typeof EngagementPolicyInputSchema>;

export const DraftOptionSchema = z.object({
  text: z.string(),
  tone: z.string().optional(),
  length: z.enum(["short", "medium", "long"]).optional(),
});
export type DraftOption = z.infer<typeof DraftOptionSchema>;

export const DraftGenerationOutputSchema = z.object({
  options: z.array(DraftOptionSchema).length(3),
});
export type DraftGenerationOutput = z.infer<typeof DraftGenerationOutputSchema>;

export const DeepScrapeTaskStatusSchema = z.enum(["pending", "running", "success", "failed"]);
export type DeepScrapeTaskStatus = z.infer<typeof DeepScrapeTaskStatusSchema>;

export const CronJobRunStatusSchema = z.enum(["running", "success", "failed"]);
export type CronJobRunStatus = z.infer<typeof CronJobRunStatusSchema>;
