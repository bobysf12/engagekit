import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { Post, ReviewRow, Draft } from "@/api/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  ExternalLink,
  Trash2,
  Copy,
  Link2,
  ChevronDown,
  ChevronRight,
  Check,
  X,
  RotateCcw,
  MessageSquare,
  Sparkles,
  FileText,
  ClipboardList,
} from "lucide-react";

type ViewMode = "browse" | "review";

function parseRunAccountId(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed <= 0) return null;
  return parsed;
}

function formatDate(ts: number | null) {
  if (!ts) return "-";
  return new Date(ts * 1000).toLocaleString();
}

function truncate(text: string | null, max: number) {
  if (!text) return "-";
  if (text.length <= max) return text;
  return text.slice(0, max) + "...";
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    console.error("Failed to copy to clipboard");
  }
}

export function PostsPage() {
  const queryClient = useQueryClient();
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [platform, setPlatform] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [runAccountIdInput, setRunAccountIdInput] = useState<string>("");
  const [mode, setMode] = useState<ViewMode>("browse");
  const [includeDismissed, setIncludeDismissed] = useState<boolean>(true);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [feedbackDialog, setFeedbackDialog] = useState<{
    draftId: number;
    feedback: string;
  } | null>(null);

  const runAccountId = parseRunAccountId(runAccountIdInput);
  const isReviewMode = mode === "review" && runAccountId !== null;
  const runAccountIdError = mode === "review" && runAccountIdInput !== "" && runAccountId === null;

  const { data: posts, isLoading: postsLoading } = useQuery({
    queryKey: ["posts", platform],
    queryFn: () =>
      api.posts.list({
        limit: 100,
        platform: platform || undefined,
      }),
    enabled: mode === "browse",
  });

  const { data: reviewRows, isLoading: reviewLoading } = useQuery({
    queryKey: ["triage", "review", runAccountId, includeDismissed],
    queryFn: () =>
      api.triage.review(runAccountId!, {
        includeDismissed,
      }),
    enabled: isReviewMode,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.posts.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      setDeleteId(null);
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
      queryClient.invalidateQueries({ queryKey: ["triage", "review"] });
      setFeedbackDialog(null);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: number) => api.drafts.reject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["triage", "review"] });
    },
  });

  const undismissMutation = useMutation({
    mutationFn: (id: number) => api.drafts.undismiss(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["triage", "review"] });
    },
  });

  const generateDraftsMutation = useMutation({
    mutationFn: (id: number) => api.drafts.generate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["triage", "review"] });
    },
  });

  const toggleRow = (postId: number) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(postId)) {
      newExpanded.delete(postId);
    } else {
      newExpanded.add(postId);
    }
    setExpandedRows(newExpanded);
  };

  const filteredPosts = posts?.filter((post: Post) => {
    if (!search) return true;
    return (
      post.authorHandle.toLowerCase().includes(search.toLowerCase()) ||
      (post.bodyText?.toLowerCase().includes(search.toLowerCase()) ?? false)
    );
  });

  const isLoading = postsLoading || reviewLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Posts & Drafts Review</h1>
        <p className="text-muted-foreground">
          {isReviewMode
            ? "Review posts and drafts for the selected run account"
            : "View and manage scraped posts"}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex rounded-md border p-1 bg-muted/50">
          <Button
            variant={mode === "browse" ? "default" : "ghost"}
            size="sm"
            onClick={() => setMode("browse")}
            className="gap-2"
          >
            <FileText className="h-4 w-4" />
            Browse Posts
          </Button>
          <Button
            variant={mode === "review" ? "default" : "ghost"}
            size="sm"
            onClick={() => setMode("review")}
            className="gap-2"
          >
            <ClipboardList className="h-4 w-4" />
            Review Run Account
          </Button>
        </div>
      </div>

      {mode === "review" && (
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex flex-col gap-1">
            <Input
              placeholder="Enter Run Account ID..."
              value={runAccountIdInput}
              onChange={(e) => {
                setRunAccountIdInput(e.target.value);
                setExpandedRows(new Set());
              }}
              className={`max-w-xs ${runAccountIdError ? "border-destructive" : ""}`}
              type="number"
              min={1}
            />
            {runAccountIdError && (
              <p className="text-sm text-destructive">
                Please enter a valid positive integer
              </p>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="includeDismissed"
              checked={includeDismissed}
              onCheckedChange={(checked: boolean) => setIncludeDismissed(checked)}
              disabled={!isReviewMode}
            />
            <label htmlFor="includeDismissed" className="text-sm">
              Show dismissed drafts
            </label>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={!isReviewMode || generateDraftsMutation.isPending}
            onClick={() => {
              if (runAccountId) {
                generateDraftsMutation.mutate(runAccountId);
              }
            }}
          >
            <Sparkles className="h-4 w-4 mr-1" />
            {generateDraftsMutation.isPending ? "Generating..." : "Generate Drafts"}
          </Button>
        </div>
      )}

      {mode === "browse" && (
        <div className="flex flex-wrap gap-4">
          <Input
            placeholder="Search by author or content..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          <Select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            options={[
              { value: "", label: "All platforms" },
              { value: "threads", label: "Threads" },
              { value: "x", label: "X (Twitter)" },
            ]}
            className="w-40"
          />
        </div>
      )}

      {isReviewMode && generateDraftsMutation.isSuccess && (
        <p className="text-sm text-muted-foreground">
          Generated {generateDraftsMutation.data.draftsGenerated} drafts across {" "}
          {generateDraftsMutation.data.totalPosts} selected posts.
        </p>
      )}

      {isReviewMode ? (
        reviewRows && reviewRows.length > 0 ? (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead>Author</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Content</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reviewRows.map((row: ReviewRow) => (
                  <ReviewRowComponent
                    key={row.id}
                    row={row}
                    runAccountId={runAccountId!}
                    isExpanded={expandedRows.has(row.postId)}
                    onToggle={() => toggleRow(row.postId)}
                    onReject={(draft) => rejectMutation.mutate(draft.id)}
                    onUndismiss={(draft) => undismissMutation.mutate(draft.id)}
                    onGenerateDrafts={(id) => generateDraftsMutation.mutate(id)}
                    selectingId={
                      selectMutation.isPending
                        ? selectMutation.variables?.id
                        : null
                    }
                    rejectingId={
                      rejectMutation.isPending ? rejectMutation.variables : null
                    }
                    undismissingId={
                      undismissMutation.isPending
                        ? undismissMutation.variables
                        : null
                    }
                    generatingDrafts={generateDraftsMutation.isPending}
                    onOpenFeedback={(draftId) =>
                      setFeedbackDialog({ draftId, feedback: "" })
                    }
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                No posts selected for review
              </p>
              <p className="text-sm text-muted-foreground">
                Run a pipeline to triage and select posts for review
              </p>
            </CardContent>
          </Card>
        )
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Author</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead>Content</TableHead>
                <TableHead>Scraped</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPosts && filteredPosts.length > 0 ? (
                filteredPosts.map((post: Post) => (
                  <TableRow key={post.id}>
                    <TableCell className="font-medium">#{post.id}</TableCell>
                    <TableCell>@{post.authorHandle}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{post.platform}</Badge>
                    </TableCell>
                    <TableCell className="max-w-xs">
                      {truncate(post.bodyText, 80)}
                    </TableCell>
                    <TableCell>{formatDate(post.firstSeenAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {post.bodyText && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => copyToClipboard(post.bodyText!)}
                            title="Copy content"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        )}
                        {post.postUrl && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => copyToClipboard(post.postUrl!)}
                              title="Copy link"
                            >
                              <Link2 className="h-4 w-4 text-muted-foreground" />
                            </Button>
                            <Button variant="ghost" size="icon" asChild>
                              <a
                                href={post.postUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Open post"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </Button>
                          </>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteId(post.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center">
                    No posts found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Post</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this post? This will also delete
              all associated comments, triage, and drafts. This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!feedbackDialog}
        onOpenChange={() => setFeedbackDialog(null)}
      >
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
                    feedbackDialog
                      ? { ...feedbackDialog, feedback: e.target.value }
                      : null
                  )
                }
                placeholder="Why did you choose this option?"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setFeedbackDialog(null)}
            >
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

function ReviewRowComponent({
  row,
  runAccountId,
  isExpanded,
  onToggle,
  onReject,
  onUndismiss,
  onGenerateDrafts,
  selectingId,
  rejectingId,
  undismissingId,
  generatingDrafts,
  onOpenFeedback,
}: {
  row: ReviewRow;
  runAccountId: number;
  isExpanded: boolean;
  onToggle: () => void;
  onReject: (draft: Draft) => void;
  onUndismiss: (draft: Draft) => void;
  onGenerateDrafts: (runAccountId: number) => void;
  selectingId: number | null;
  rejectingId: number | null;
  undismissingId: number | null;
  generatingDrafts: boolean;
  onOpenFeedback: (draftId: number) => void;
}) {
  const reasons = row.reasonsJson ? JSON.parse(row.reasonsJson) : [];
  const post = row.post;

  return (
    <>
      <TableRow className="cursor-pointer hover:bg-muted/50" onClick={onToggle}>
        <TableCell>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            title={isExpanded ? "Collapse row" : "Expand row"}
            aria-label={isExpanded ? "Collapse row" : "Expand row"}
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
        </TableCell>
        <TableCell className="font-medium">#{row.postId}</TableCell>
        <TableCell>
          {post?.authorHandle ? `@${post.authorHandle}` : "-"}
        </TableCell>
        <TableCell>
          <div className="flex flex-wrap gap-1">
            <Badge variant="outline">{row.relevanceScore}</Badge>
            <Badge variant="outline">{row.relevanceLabel}</Badge>
          </div>
        </TableCell>
        <TableCell className="max-w-xs">
          {truncate(post?.bodyText || null, 60)}
        </TableCell>
        <TableCell>
          <div className="flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
            >
              {isExpanded ? "Collapse" : "Expand"}
            </Button>
            {post?.bodyText && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(post.bodyText!)}
                title="Copy content"
              >
                <Copy className="h-4 w-4 mr-1" />
                Copy
              </Button>
            )}
            {post?.postUrl && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(post.postUrl!)}
                  title="Copy link"
                >
                  <Link2 className="h-4 w-4 mr-1 text-muted-foreground" />
                  Copy Link
                </Button>
                <Button variant="ghost" size="sm" asChild>
                  <a
                    href={post.postUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open post"
                  >
                    <ExternalLink className="h-4 w-4 mr-1" />
                    Open
                  </a>
                </Button>
              </>
            )}
          </div>
        </TableCell>
      </TableRow>
      {isExpanded && (
        <TableRow>
          <TableCell colSpan={6} className="bg-muted/30 p-4">
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge variant="outline">Action: {row.action}</Badge>
                {reasons.length > 0 && (
                  <span className="text-muted-foreground">
                    {reasons.join(", ")}
                  </span>
                )}
              </div>
              {post?.bodyText && (
                <div className="text-sm whitespace-pre-wrap bg-background p-3 rounded-md border">
                  {post.bodyText}
                </div>
              )}
              <div>
                <h4 className="font-medium mb-2">Draft Replies</h4>
                {row.drafts && row.drafts.length > 0 ? (
                  <div className="grid gap-3 md:grid-cols-3">
                    {row.drafts.map((draft: Draft) => (
                      <DraftCard
                        key={draft.id}
                        draft={draft}
                        onReject={() => onReject(draft)}
                        onUndismiss={() => onUndismiss(draft)}
                        onOpenFeedback={() => onOpenFeedback(draft.id)}
                        isSelecting={selectingId === draft.id}
                        isRejecting={rejectingId === draft.id}
                        isUndismissing={undismissingId === draft.id}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <p className="text-sm text-muted-foreground">
                      No drafts available for this post.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onGenerateDrafts(runAccountId)}
                      disabled={generatingDrafts}
                    >
                      <Sparkles className="h-4 w-4 mr-1" />
                      {generatingDrafts ? "Generating..." : "Generate Reply Drafts"}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
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
