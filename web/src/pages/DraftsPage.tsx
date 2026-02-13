import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { Draft, Triage } from "@/api/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Check, X, MessageSquare } from "lucide-react";

function formatDate(ts: number | null) {
  if (!ts) return "-";
  return new Date(ts * 1000).toLocaleString();
}

function DraftCard({
  draft,
  onSelect,
  onReject,
  isSelecting,
  isRejecting,
}: {
  draft: Draft;
  onSelect: (metadata?: Record<string, unknown>) => void;
  onReject: () => void;
  isSelecting: boolean;
  isRejecting: boolean;
}) {
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState("");

  const handleSelect = () => {
    if (feedback) {
      onSelect({ feedback });
    } else {
      onSelect();
    }
    setShowFeedback(false);
  };

  const isSelected = draft.status === "approved";
  const isRejected = draft.status === "rejected";

  return (
    <>
      <Card className={isSelected ? "border-success" : isRejected ? "border-destructive" : ""}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <Badge variant={isSelected ? "success" : isRejected ? "destructive" : "secondary"}>
              Option {(draft.optionIndex ?? 0) + 1}
              {isSelected && " (Selected)"}
              {isRejected && " (Rejected)"}
            </Badge>
            {isSelected && draft.selectedAt && (
              <span className="text-xs text-muted-foreground">
                Selected {formatDate(draft.selectedAt)}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm whitespace-pre-wrap">{draft.draftText}</p>
          {!isSelected && !isRejected && (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="default"
                onClick={() => setShowFeedback(true)}
                disabled={isSelecting}
              >
                <Check className="h-4 w-4 mr-1" />
                {isSelecting ? "Selecting..." : "Select"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={onReject}
                disabled={isRejecting}
              >
                <X className="h-4 w-4 mr-1" />
                {isRejecting ? "Rejecting..." : "Reject"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showFeedback} onOpenChange={setShowFeedback}>
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
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Why did you choose this option?"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFeedback(false)}>
              Cancel
            </Button>
            <Button onClick={handleSelect} disabled={isSelecting}>
              {isSelecting ? "Selecting..." : "Confirm Selection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function DraftsPage() {
  const queryClient = useQueryClient();
  const [runAccountId, setRunAccountId] = useState<string>("");

  const { data: triage, isLoading: triageLoading } = useQuery({
    queryKey: ["triage", "selected", runAccountId],
    queryFn: () =>
      runAccountId
        ? api.triage.selected(parseInt(runAccountId))
        : api.triage.list({ selectedOnly: true, limit: 50 }),
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
      queryClient.invalidateQueries({ queryKey: ["drafts"] });
      queryClient.invalidateQueries({ queryKey: ["triage"] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: number) => api.drafts.reject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drafts"] });
    },
  });

  if (triageLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Draft Review</h1>
        <p className="text-muted-foreground">
          Review and select reply drafts for selected posts
        </p>
      </div>

      <div className="flex gap-4">
        <Input
          placeholder="Filter by Run Account ID..."
          value={runAccountId}
          onChange={(e) => setRunAccountId(e.target.value)}
          className="max-w-xs"
          type="number"
        />
      </div>

      {triage && triage.length > 0 ? (
        <div className="space-y-8">
          {triage.map((item: Triage) => (
            <DraftPostSection
              key={item.id}
              triage={item}
              onSelect={(draft, metadata) =>
                selectMutation.mutate({ id: draft.id, metadata })
              }
              onReject={(draft) => rejectMutation.mutate(draft.id)}
              selectingId={
                selectMutation.isPending ? selectMutation.variables?.id : null
              }
              rejectingId={
                rejectMutation.isPending ? rejectMutation.variables : null
              }
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No drafts to review</p>
            <p className="text-sm text-muted-foreground">
              Run a pipeline to generate drafts
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DraftPostSection({
  triage,
  onSelect,
  onReject,
  selectingId,
  rejectingId,
}: {
  triage: Triage;
  onSelect: (draft: Draft, metadata?: Record<string, unknown>) => void;
  onReject: (draft: Draft) => void;
  selectingId: number | null;
  rejectingId: number | null;
}) {
  const runAccountId = triage.runAccountId;
  
  const { data: drafts, isLoading } = useQuery({
    queryKey: ["drafts", "post", triage.postId, runAccountId],
    queryFn: () => {
      if (!runAccountId) return [];
      return api.drafts.list({ runAccountId, postId: triage.postId });
    },
    enabled: !!runAccountId,
  });

  if (isLoading) {
    return <Spinner className="h-6 w-6" />;
  }

  const reasons = triage.reasonsJson ? JSON.parse(triage.reasonsJson) : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {triage.post?.authorHandle ? `@${triage.post.authorHandle}` : `Post #${triage.postId}`}
        </CardTitle>
        <CardDescription className="line-clamp-2">
          {triage.post?.bodyText || "Post content not available"}
        </CardDescription>
        <div className="flex flex-wrap gap-2 mt-2">
          <Badge variant="outline">Score: {triage.relevanceScore}</Badge>
          <Badge variant="outline">{triage.relevanceLabel}</Badge>
          <Badge variant="outline">{triage.action}</Badge>
          {reasons.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {reasons.join(", ")}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {drafts && drafts.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-3">
            {drafts.map((draft: Draft) => (
              <DraftCard
                key={draft.id}
                draft={draft}
                onSelect={(metadata) => onSelect(draft, metadata)}
                onReject={() => onReject(draft)}
                isSelecting={selectingId === draft.id}
                isRejecting={rejectingId === draft.id}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No drafts available</p>
        )}
      </CardContent>
    </Card>
  );
}
