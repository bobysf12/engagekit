import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { RunAccount } from "@/api/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, Trash2 } from "lucide-react";

function formatDate(ts: number) {
  return new Date(ts * 1000).toLocaleString();
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

export function RunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const runId = parseInt(id || "0");
  const queryClient = useQueryClient();
  const [deleteAccountId, setDeleteAccountId] = useState<number | null>(null);

  const { data: run, isLoading } = useQuery({
    queryKey: ["runs", runId],
    queryFn: () => api.runs.get(runId),
    enabled: !!runId,
  });

  const deleteAccountMutation = useMutation({
    mutationFn: (runAccountId: number) => api.runs.deleteAccount(runAccountId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["runs", runId] });
      setDeleteAccountId(null);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (!run) {
    return (
      <div className="space-y-6">
        <Link
          to="/runs"
          className="flex items-center text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to runs
        </Link>
        <p>Run not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/runs"
          className="flex items-center text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to runs
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Run #{run.id}</h1>
            <p className="text-muted-foreground">
              Trigger: {run.trigger} | Started: {formatDate(run.startedAt)}
            </p>
          </div>
          <StatusBadge status={run.status} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Run Accounts</CardTitle>
          <CardDescription>
            Accounts processed in this run
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Posts Found</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {run.accounts && run.accounts.length > 0 ? (
                run.accounts.map((account: RunAccount) => (
                  <TableRow key={account.id}>
                    <TableCell className="font-medium">#{account.id}</TableCell>
                    <TableCell>@{account.accountHandle}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{account.accountPlatform}</Badge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={account.status} />
                    </TableCell>
                    <TableCell>{account.postsFound}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteAccountId(account.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center">
                    No accounts
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog
        open={!!deleteAccountId}
        onOpenChange={() => setDeleteAccountId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Run Account</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this run account? This will also
              delete all associated posts, triage, and drafts. This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteAccountId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                deleteAccountId && deleteAccountMutation.mutate(deleteAccountId)
              }
              disabled={deleteAccountMutation.isPending}
            >
              {deleteAccountMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
