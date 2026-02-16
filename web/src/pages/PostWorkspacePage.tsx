import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { PostWorkspace, Draft } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  ExternalLink,
  Copy,
  Link2,
  Sparkles,
  Check,
  X,
  RotateCcw,
  CheckCircle,
  Circle,
  Heart,
  MessageSquare,
  Eye,
} from "lucide-react";

function formatDate(ts: number | null) {
  if (!ts) return "-";
  return new Date(ts * 1000).toLocaleString();
}

function formatNumber(n: number | null): string {
  if (n === null) return "-";
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(n);
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    console.error("Failed to copy to clipboard");
  }
}

export function PostWorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const postId = parseInt(id || "0", 10);
  const queryClient = useQueryClient();
  const [feedbackDialog, setFeedbackDialog] = useState<{
    draftId: number;
    feedback: string;
  } | null>(null);

  const { data: workspace, isLoading, error } = useQuery({
    queryKey: ["post", postId, "workspace"],
    queryFn: () => api.posts.workspace(postId),
    enabled: !!postId && !isNaN(postId),
  });

  const generateDraftsMutation = useMutation({
    mutationFn: () => api.posts.generateDrafts(postId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["post", postId, "workspace"] });
    },
  });

  const selectMutation = useMutation({
    mutationFn: ({
      id,
      metadata,
    }: {
      id: number;
      metadata?: Record<string, unknown>;
    }) => api.drafts.select(id, { selectedBy: "dashboard", metadata }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["post", postId, "workspace"] });
      setFeedbackDialog(null);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: number) => api.drafts.reject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["post", postId, "workspace"] });
    },
  });

  const undismissMutation = useMutation({
    mutationFn: (id: number) => api.drafts.undismiss(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["post", postId, "workspace"] });
    },
  });

  const engagementMutation = useMutation({
    mutationFn: (engaged: boolean) => api.posts.setEngagement(postId, engaged, "dashboard"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["post", postId, "workspace"] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (error || !workspace) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/posts">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">Post Not Found</h1>
        </div>
        <p className="text-muted-foreground">
          The post you're looking for doesn't exist or has been deleted.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/posts">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Post #{postId}</h1>
            <p className="text-muted-foreground">
              View post details, triage, and manage drafts
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <EngagementToggle
            engaged={workspace.post.engaged === 1}
            onToggle={(engaged) => engagementMutation.mutate(engaged)}
            isLoading={engagementMutation.isPending}
          />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <PostCard workspace={workspace} />
        <TriageCard workspace={workspace} />
      </div>

      <MetricsCard workspace={workspace} />

      <DraftsSection
        workspace={workspace}
        onGenerateDrafts={() => generateDraftsMutation.mutate()}
        isGenerating={generateDraftsMutation.isPending}
        onReject={(draftId) => rejectMutation.mutate(draftId)}
        onUndismiss={(draftId) => undismissMutation.mutate(draftId)}
        selectingId={selectMutation.isPending ? selectMutation.variables?.id : null}
        rejectingId={rejectMutation.isPending ? rejectMutation.variables : null}
        undismissingId={undismissMutation.isPending ? undismissMutation.variables : null}
        onOpenFeedback={(draftId) => setFeedbackDialog({ draftId, feedback: "" })}
      />

      <Dialog open={!!feedbackDialog} onOpenChange={() => setFeedbackDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select Draft</DialogTitle>
            <DialogDescription>
              Optionally add feedback about why you selected this draft.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="feedback">Feedback (optional)</Label>
              <Textarea
                id="feedback"
                value={feedbackDialog?.feedback || ""}
                onChange={(e) =>
                  setFeedbackDialog(
                    feedbackDialog ? { ...feedbackDialog, feedback: e.target.value } : null
                  )
                }
                placeholder="Why did you choose this option?"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFeedbackDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (feedbackDialog) {
                  selectMutation.mutate({
                    id: feedbackDialog.draftId,
                    metadata: feedbackDialog.feedback
                      ? { feedback: feedbackDialog.feedback }
                      : undefined,
                  });
                }
              }}
              disabled={selectMutation.isPending}
            >
              {selectMutation.isPending ? "Selecting..." : "Confirm Selection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EngagementToggle({
  engaged,
  onToggle,
  isLoading,
}: {
  engaged: boolean;
  onToggle: (engaged: boolean) => void;
  isLoading: boolean;
}) {
  return (
    <Button
      variant={engaged ? "default" : "outline"}
      onClick={() => onToggle(!engaged)}
      disabled={isLoading}
      className="gap-2"
    >
      {engaged ? (
        <>
          <CheckCircle className="h-4 w-4" />
          Engaged
        </>
      ) : (
        <>
          <Circle className="h-4 w-4" />
          Mark Engaged
        </>
      )}
    </Button>
  );
}

function PostCard({ workspace }: { workspace: PostWorkspace }) {
  const { post, account } = workspace;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Post Details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="font-medium">@{post.authorHandle}</div>
            {post.authorDisplayName && (
              <div className="text-sm text-muted-foreground">
                {post.authorDisplayName}
              </div>
            )}
          </div>
          <Badge variant="outline">{post.platform}</Badge>
        </div>

        {post.bodyText && (
          <div className="text-sm whitespace-pre-wrap bg-muted/50 p-3 rounded-md">
            {post.bodyText}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-muted-foreground">Source Account: </span>
            {account ? (
              <span>{account.displayName} (@{account.handle})</span>
            ) : (
              <span className="text-muted-foreground">Unknown</span>
            )}
          </div>
          <div>
            <span className="text-muted-foreground">Published: </span>
            {formatDate(post.publishedAt)}
          </div>
          <div>
            <span className="text-muted-foreground">First Seen: </span>
            {formatDate(post.firstSeenAt)}
          </div>
          <div>
            <span className="text-muted-foreground">Last Seen: </span>
            {formatDate(post.lastSeenAt)}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {post.bodyText && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => copyToClipboard(post.bodyText!)}
            >
              <Copy className="h-4 w-4 mr-1" />
              Copy Content
            </Button>
          )}
          {post.postUrl && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(post.postUrl!)}
              >
                <Link2 className="h-4 w-4 mr-1" />
                Copy Link
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href={post.postUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-1" />
                  Open Post
                </a>
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function TriageCard({ workspace }: { workspace: PostWorkspace }) {
  const { triage } = workspace;

  if (!triage) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Triage</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            No triage data available for this post. Generate drafts to create triage.
          </p>
        </CardContent>
      </Card>
    );
  }

  const reasons = triage.reasonsJson ? JSON.parse(triage.reasonsJson) : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Triage</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">Score: {triage.relevanceScore}</Badge>
          <Badge variant="outline">{triage.relevanceLabel}</Badge>
          <Badge variant="outline">Action: {triage.action}</Badge>
          <Badge variant="outline">Confidence: {triage.confidence}%</Badge>
        </div>
        {reasons.length > 0 && (
          <div className="text-sm">
            <span className="text-muted-foreground">Reasons: </span>
            {reasons.join(", ")}
          </div>
        )}
        <div className="text-sm text-muted-foreground">
          Created: {formatDate(triage.createdAt)}
        </div>
      </CardContent>
    </Card>
  );
}

function MetricsCard({ workspace }: { workspace: PostWorkspace }) {
  const { metrics } = workspace;

  if (!metrics) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            No metrics available for this post.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Metrics</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-4 gap-4">
          <div className="flex flex-col items-center p-3 bg-muted/50 rounded-lg">
            <Heart className="h-5 w-5 text-muted-foreground mb-1" />
            <span className="text-lg font-semibold">{formatNumber(metrics.likesCount)}</span>
            <span className="text-xs text-muted-foreground">Likes</span>
          </div>
          <div className="flex flex-col items-center p-3 bg-muted/50 rounded-lg">
            <MessageSquare className="h-5 w-5 text-muted-foreground mb-1" />
            <span className="text-lg font-semibold">{formatNumber(metrics.repliesCount)}</span>
            <span className="text-xs text-muted-foreground">Replies</span>
          </div>
          <div className="flex flex-col items-center p-3 bg-muted/50 rounded-lg">
            <Eye className="h-5 w-5 text-muted-foreground mb-1" />
            <span className="text-lg font-semibold">{formatNumber(metrics.viewsCount)}</span>
            <span className="text-xs text-muted-foreground">Views</span>
          </div>
          <div className="flex flex-col items-center p-3 bg-muted/50 rounded-lg">
            <Link2 className="h-5 w-5 text-muted-foreground mb-1" />
            <span className="text-lg font-semibold">{formatNumber(metrics.repostsCount)}</span>
            <span className="text-xs text-muted-foreground">Reposts</span>
          </div>
        </div>
        <div className="mt-3 text-xs text-muted-foreground">
          Captured: {formatDate(metrics.capturedAt)}
        </div>
      </CardContent>
    </Card>
  );
}

function DraftsSection({
  workspace,
  onGenerateDrafts,
  isGenerating,
  onReject,
  onUndismiss,
  selectingId,
  rejectingId,
  undismissingId,
  onOpenFeedback,
}: {
  workspace: PostWorkspace;
  onGenerateDrafts: () => void;
  isGenerating: boolean;
  onReject: (draftId: number) => void;
  onUndismiss: (draftId: number) => void;
  selectingId: number | null;
  rejectingId: number | null;
  undismissingId: number | null;
  onOpenFeedback: (draftId: number) => void;
}) {
  const { drafts } = workspace;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Reply Drafts</CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={onGenerateDrafts}
          disabled={isGenerating}
        >
          <Sparkles className="h-4 w-4 mr-1" />
          {isGenerating ? "Generating..." : "Generate Drafts"}
        </Button>
      </CardHeader>
      <CardContent>
        {drafts && drafts.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-3">
            {drafts.map((draft) => (
              <DraftCard
                key={draft.id}
                draft={draft}
                onReject={() => onReject(draft.id)}
                onUndismiss={() => onUndismiss(draft.id)}
                onOpenFeedback={() => onOpenFeedback(draft.id)}
                isSelecting={selectingId === draft.id}
                isRejecting={rejectingId === draft.id}
                isUndismissing={undismissingId === draft.id}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-2">No drafts available for this post.</p>
            <Button onClick={onGenerateDrafts} disabled={isGenerating}>
              <Sparkles className="h-4 w-4 mr-1" />
              {isGenerating ? "Generating..." : "Generate Reply Drafts"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DraftCard({
  draft,
  onReject,
  onUndismiss,
  onOpenFeedback,
  isSelecting,
  isRejecting,
  isUndismissing,
}: {
  draft: Draft;
  onReject: () => void;
  onUndismiss: () => void;
  onOpenFeedback: () => void;
  isSelecting: boolean;
  isRejecting: boolean;
  isUndismissing: boolean;
}) {
  const isSelected = draft.status === "approved";
  const isDismissed = draft.status === "rejected";

  return (
    <Card
      className={
        isSelected
          ? "border-success"
          : isDismissed
            ? "border-destructive/50 opacity-75"
            : ""
      }
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <Badge
            variant={
              isSelected
                ? "success"
                : isDismissed
                  ? "destructive"
                  : "secondary"
            }
          >
            Option {(draft.optionIndex ?? 0) + 1}
            {isSelected && " (Selected)"}
            {isDismissed && " (Dismissed)"}
          </Badge>
          {isSelected && draft.selectedAt && (
            <span className="text-xs text-muted-foreground">
              Selected {formatDate(draft.selectedAt)}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm whitespace-pre-wrap">{draft.draftText}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => copyToClipboard(draft.draftText)}
          >
            <Copy className="h-3 w-3 mr-1" />
            Copy
          </Button>
          {!isSelected && !isDismissed && (
            <>
              <Button
                size="sm"
                variant="default"
                onClick={onOpenFeedback}
                disabled={isSelecting}
              >
                <Check className="h-3 w-3 mr-1" />
                {isSelecting ? "Selecting..." : "Select"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={onReject}
                disabled={isRejecting}
              >
                <X className="h-3 w-3 mr-1" />
                {isRejecting ? "Dismissing..." : "Dismiss"}
              </Button>
            </>
          )}
          {isDismissed && (
            <Button
              size="sm"
              variant="outline"
              onClick={onUndismiss}
              disabled={isUndismissing}
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              {isUndismissing ? "Restoring..." : "Undo Dismiss"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
