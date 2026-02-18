export interface Run {
  id: number;
  trigger: string;
  startedAt: number;
  endedAt: number | null;
  status: string;
  notes: string | null;
}

export interface RunAccount {
  id: number;
  runId: number;
  accountId: number;
  accountHandle: string;
  accountDisplayName: string;
  accountPlatform: string;
  status: string;
  postsFound: number;
  commentsFound: number;
  snapshotsWritten: number;
  errorCode: string | null;
  errorDetail: string | null;
  startedAt: number;
  endedAt: number | null;
}

export interface RunWithAccounts extends Run {
  accounts: RunAccount[];
}

export interface RunTriggerRequest {
  accountId: number;
  collectHome?: boolean;
  collectProfiles?: boolean;
  profileHandles?: string[];
  searchQueries?: string[];
  runPipeline?: boolean;
  generateDrafts?: boolean;
}

export interface RunTriggerPipelineResult {
  runAccountId: number;
  triaged: number;
  selected: number;
  draftsGenerated: number;
  errors: number;
}

export interface RunTriggerResponse {
  runId: number;
  status: string;
  scrape: {
    accountsProcessed: number;
    accountsSucceeded: number;
    accountsFailed: number;
    postsFound: number;
    commentsFound: number;
  };
  pipeline: RunTriggerPipelineResult[];
}

export interface Post {
  id: number;
  platformPostId: string | null;
  platform: string;
  sourceAccountId: number | null;
  authorHandle: string;
  authorDisplayName: string;
  bodyText: string | null;
  postUrl: string | null;
  publishedAt: number | null;
  firstSeenAt: number;
  lastSeenAt: number;
  engaged: number;
  engagedAt: number | null;
  engagedBy: string | null;
  triageScore: number | null;
  triageLabel: string | null;
  triageAction: string | null;
}

export interface PostsListResponse {
  posts: Post[];
  total: number;
  hasMore: boolean;
}

export interface PostWithComments extends Post {
  comments: Comment[];
}

export interface MetricSnapshot {
  id: number;
  entityType: "post" | "comment";
  entityId: number;
  likesCount: number | null;
  repliesCount: number | null;
  repostsCount: number | null;
  viewsCount: number | null;
  capturedAt: number;
  runAccountId: number;
}

export interface Account {
  id: number;
  platform: string;
  displayName: string;
  handle: string;
  status: string;
}

export interface PostWorkspace {
  post: Post;
  account: Account | null;
  triage: Triage | null;
  metrics: MetricSnapshot | null;
  drafts: Draft[];
}

export interface GenerateDraftsResult {
  runAccountId: number;
  triage: Triage;
  drafts: Draft[];
}

export interface Comment {
  id: number;
  postId: number;
  platformCommentId: string | null;
  platform: string;
  authorHandle: string;
  authorDisplayName: string;
  bodyText: string | null;
  commentUrl: string | null;
  publishedAt: number | null;
  firstSeenAt: number;
  lastSeenAt: number;
}

export interface TriagePost {
  id: number;
  authorHandle: string;
  authorDisplayName: string;
  bodyText: string | null;
  postUrl: string | null;
  platform: string;
}

export interface Triage {
  id: number;
  runAccountId: number;
  postId: number;
  relevanceScore: number;
  relevanceLabel: string;
  reasonsJson: string;
  action: string;
  confidence: number;
  model: string | null;
  promptVersion: string | null;
  rank: number | null;
  isTop20: number;
  selectedForDeepScrape: number;
  createdAt: number;
  post?: TriagePost;
}

export interface Draft {
  id: number;
  runAccountId: number | null;
  postId: number | null;
  optionIndex: number | null;
  queueId: number | null;
  promptVersion: string;
  draftText: string;
  model: string | null;
  status: string;
  inputContextJson: string | null;
  selectedAt: number | null;
  selectedBy: string | null;
  reviewedAt: number | null;
  createdAt: number;
}

export interface DraftGenerationResult {
  totalPosts: number;
  draftsGenerated: number;
  draftsPerPost: number;
  failedPosts: number;
  errors: Array<{ postId: number; error: string }>;
}

export interface ReviewRow extends Triage {
  drafts: Draft[];
}

export interface Policy {
  id: number;
  accountId: number;
  name: string;
  topicsJson: string;
  goalsJson: string;
  avoidListJson: string;
  toneIdentity: string;
  preferredLanguagesJson: string;
  isActive: number;
  createdAt: number;
  updatedAt: number;
  topics: string[];
  goals: string[];
  avoidList: string[];
  preferredLanguages: string[];
}

export interface CronJob {
  id: number;
  accountId: number;
  name: string;
  cronExpr: string;
  timezone: string;
  enabled: number;
  pipelineConfigJson: string | null;
  lastRunAt: number | null;
  nextRunAt: number | null;
  lastStatus: string | null;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface CronJobRun {
  id: number;
  cronJobId: number;
  scrapeRunId: number | null;
  status: string;
  startedAt: number;
  endedAt: number | null;
  error: string | null;
}

export interface CronSource {
  type: "home" | "profile" | "search";
  value?: string;
}

export interface CronPipelineConfig {
  sources: CronSource[];
  maxPostsPerRun: number;
  clearStatusPerRun: boolean;
  generateDrafts: boolean;
}

export const DEFAULT_CRON_CONFIG: CronPipelineConfig = {
  sources: [{ type: "home" }],
  maxPostsPerRun: 100,
  clearStatusPerRun: false,
  generateDrafts: true,
};

