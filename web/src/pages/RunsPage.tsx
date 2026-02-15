import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import type { Run, RunTriggerResponse } from "@/api/types";
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
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Play, Trash2, AlertCircle } from "lucide-react";

function formatDate(ts: number) {
  return new Date(ts * 1000).toLocaleString();
}

function parseAccountId(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed <= 0) return null;
  return parsed;
}

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "success"
      ? "success"
      : status === "running"
        ? "warning"
        : status === "failed"
          ? "destructive"
          : "secondary";
  return <Badge variant={variant}>{status}</Badge>;
}

interface TriggerFormState {
  accountId: string;
  collectHome: boolean;
  collectProfiles: boolean;
  profileHandles: string;
  searchQueries: string;
  runPipeline: boolean;
  generateDrafts: boolean;
}

const defaultFormState: TriggerFormState = {
  accountId: "",
  collectHome: true,
  collectProfiles: true,
  profileHandles: "",
  searchQueries: "",
  runPipeline: true,
  generateDrafts: false,
};

export function RunsPage() {
  const queryClient = useQueryClient();
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [showTriggerDialog, setShowTriggerDialog] = useState(false);
  const [formState, setFormState] = useState<TriggerFormState>(defaultFormState);
  const [triggerResult, setTriggerResult] = useState<RunTriggerResponse | null>(null);
  const [accountIdError, setAccountIdError] = useState<string | null>(null);

  const { data: runs, isLoading } = useQuery({
    queryKey: ["runs"],
    queryFn: () => api.runs.list(50),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.runs.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["runs"] });
      setDeleteId(null);
    },
  });

  const triggerMutation = useMutation({
    mutationFn: () => {
      const accountId = parseAccountId(formState.accountId);
      if (accountId === null) {
        throw new Error("Please enter a valid positive account ID");
      }
      return api.runs.trigger({
        accountId,
        collectHome: formState.collectHome,
        collectProfiles: formState.collectProfiles,
        profileHandles: formState.profileHandles
          ? formState.profileHandles.split(",").map((s) => s.trim()).filter(Boolean)
          : undefined,
        searchQueries: formState.searchQueries
          ? formState.searchQueries.split(",").map((s) => s.trim()).filter(Boolean)
          : undefined,
        runPipeline: formState.runPipeline,
        generateDrafts: formState.generateDrafts,
      });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["runs"] });
      setTriggerResult(result);
      setAccountIdError(null);
    },
    onError: (error: Error) => {
      setAccountIdError(error.message);
    },
  });

  const handleTriggerSubmit = () => {
    setAccountIdError(null);
    const accountId = parseAccountId(formState.accountId);
    if (accountId === null) {
      setAccountIdError("Please enter a valid positive account ID");
      return;
    }
    triggerMutation.mutate();
  };

  const handleCloseTriggerDialog = () => {
    setShowTriggerDialog(false);
    setFormState(defaultFormState);
    setTriggerResult(null);
    setAccountIdError(null);
    triggerMutation.reset();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Scrape Runs</h1>
          <p className="text-muted-foreground">
            View and manage your scrape runs
          </p>
        </div>
        <Button onClick={() => setShowTriggerDialog(true)}>
          <Play className="h-4 w-4 mr-2" />
          New Run
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Trigger</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Ended</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs && runs.length > 0 ? (
              runs.map((run: Run) => (
                <TableRow key={run.id}>
                  <TableCell className="font-medium">
                    <Link
                      to={`/runs/${run.id}`}
                      className="hover:underline text-primary"
                    >
                      #{run.id}
                    </Link>
                  </TableCell>
                  <TableCell>{run.trigger}</TableCell>
                  <TableCell>
                    <StatusBadge status={run.status} />
                  </TableCell>
                  <TableCell>{formatDate(run.startedAt)}</TableCell>
                  <TableCell>
                    {run.endedAt ? formatDate(run.endedAt) : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteId(run.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="text-center">
                  No runs found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Run</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this run? This will also delete
              all associated run accounts, posts, and drafts. This action cannot
              be undone.
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

      <Dialog open={showTriggerDialog} onOpenChange={handleCloseTriggerDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Trigger New Run</DialogTitle>
            <DialogDescription>
              Start a new scrape run for an account. Optionally run the engagement pipeline.
            </DialogDescription>
          </DialogHeader>

          {triggerResult ? (
            <div className="space-y-4">
              <div className="rounded-md bg-muted p-4 space-y-2">
                <p className="font-medium">Run Created</p>
                <p>
                  Run ID:{" "}
                  <Link
                    to={`/runs/${triggerResult.runId}`}
                    className="text-primary hover:underline"
                    onClick={handleCloseTriggerDialog}
                  >
                    #{triggerResult.runId}
                  </Link>
                </p>
                <p>Status: {triggerResult.status}</p>
                <p>Posts found: {triggerResult.scrape.postsFound}</p>
                {triggerResult.pipeline.length > 0 && (
                  <p>Drafts generated: {triggerResult.pipeline.reduce((sum, p) => sum + p.draftsGenerated, 0)}</p>
                )}
              </div>
              <DialogFooter>
                <Button onClick={handleCloseTriggerDialog}>Close</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="accountId">Account ID *</Label>
                <Input
                  id="accountId"
                  type="number"
                  value={formState.accountId}
                  onChange={(e) => {
                    setFormState({ ...formState, accountId: e.target.value });
                    setAccountIdError(null);
                  }}
                  placeholder="Enter account ID (positive integer)"
                  min={1}
                  className={accountIdError ? "border-destructive" : ""}
                />
                {accountIdError && (
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    {accountIdError}
                  </div>
                )}
              </div>

              <div className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
                <strong>Note:</strong> Manual runs may take some time to complete, especially when collecting posts from home feed or profiles.
              </div>

              <div className="space-y-2">
                <Label>Scrape Options</Label>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="collectHome"
                    checked={formState.collectHome}
                    onCheckedChange={(checked: boolean) =>
                      setFormState({ ...formState, collectHome: checked })
                    }
                  />
                  <label htmlFor="collectHome" className="text-sm">
                    Collect home feed
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="collectProfiles"
                    checked={formState.collectProfiles}
                    onCheckedChange={(checked: boolean) =>
                      setFormState({ ...formState, collectProfiles: checked })
                    }
                  />
                  <label htmlFor="collectProfiles" className="text-sm">
                    Collect profiles
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="profileHandles">Profile Handles (comma-separated)</Label>
                <Input
                  id="profileHandles"
                  value={formState.profileHandles}
                  onChange={(e) =>
                    setFormState({ ...formState, profileHandles: e.target.value })
                  }
                  placeholder="user1, user2"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="searchQueries">Search Queries (comma-separated)</Label>
                <Input
                  id="searchQueries"
                  value={formState.searchQueries}
                  onChange={(e) =>
                    setFormState({ ...formState, searchQueries: e.target.value })
                  }
                  placeholder="query1, query2"
                />
              </div>

              <div className="space-y-2">
                <Label>Pipeline Options</Label>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="runPipeline"
                    checked={formState.runPipeline}
                    onCheckedChange={(checked: boolean) =>
                      setFormState({
                        ...formState,
                        runPipeline: checked,
                        generateDrafts: checked ? formState.generateDrafts : false,
                      })
                    }
                  />
                  <label htmlFor="runPipeline" className="text-sm">
                    Run engagement pipeline
                  </label>
                </div>
                <div className="flex items-center space-x-2 ml-4">
                  <Checkbox
                    id="generateDrafts"
                    checked={formState.generateDrafts}
                    disabled={!formState.runPipeline}
                    onCheckedChange={(checked: boolean) =>
                      setFormState({ ...formState, generateDrafts: checked })
                    }
                  />
                  <label
                    htmlFor="generateDrafts"
                    className={`text-sm ${!formState.runPipeline ? "text-muted-foreground" : ""}`}
                  >
                    Generate reply drafts
                  </label>
                </div>
              </div>

              {triggerMutation.isError && (
                <p className="text-sm text-destructive">
                  {triggerMutation.error?.message || "Failed to trigger run"}
                </p>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={handleCloseTriggerDialog}>
                  Cancel
                </Button>
                <Button
                  onClick={handleTriggerSubmit}
                  disabled={triggerMutation.isPending || !formState.accountId}
                >
                  {triggerMutation.isPending ? "Starting..." : "Start Run"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
