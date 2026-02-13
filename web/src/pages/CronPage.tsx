import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { CronJob, CronJobRun } from "@/api/types";
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
import { Play, Pause, Trash2, History } from "lucide-react";

function formatDate(ts: number | null) {
  if (!ts) return "-";
  return new Date(ts * 1000).toLocaleString();
}

function StatusBadge({ enabled }: { enabled: number }) {
  return (
    <Badge variant={enabled ? "success" : "secondary"}>
      {enabled ? "Enabled" : "Disabled"}
    </Badge>
  );
}

export function CronPage() {
  const queryClient = useQueryClient();
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [historyJob, setHistoryJob] = useState<CronJob | null>(null);

  const { data: jobs, isLoading } = useQuery({
    queryKey: ["cron"],
    queryFn: () => api.cron.list(),
  });

  const { data: history } = useQuery({
    queryKey: ["cron", "history", historyJob?.id],
    queryFn: () => api.cron.history(historyJob!.id, 20),
    enabled: !!historyJob,
  });

  const enableMutation = useMutation({
    mutationFn: (id: number) => api.cron.enable(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cron"] }),
  });

  const disableMutation = useMutation({
    mutationFn: (id: number) => api.cron.disable(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cron"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.cron.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cron"] });
      setDeleteId(null);
    },
  });

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
        <h1 className="text-2xl font-bold">Cron Jobs</h1>
        <p className="text-muted-foreground">
          Manage scheduled pipeline runs
        </p>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Schedule</TableHead>
              <TableHead>Timezone</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Run</TableHead>
              <TableHead>Next Run</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs && jobs.length > 0 ? (
              jobs.map((job: CronJob) => (
                <TableRow key={job.id}>
                  <TableCell className="font-medium">#{job.id}</TableCell>
                  <TableCell>{job.name}</TableCell>
                  <TableCell>Account {job.accountId}</TableCell>
                  <TableCell>
                    <code className="text-xs bg-muted px-1 py-0.5 rounded">
                      {job.cronExpr}
                    </code>
                  </TableCell>
                  <TableCell>{job.timezone}</TableCell>
                  <TableCell>
                    <StatusBadge enabled={job.enabled} />
                  </TableCell>
                  <TableCell>
                    {job.lastStatus && (
                      <Badge
                        variant={
                          job.lastStatus === "success"
                            ? "success"
                            : "destructive"
                        }
                        className="mr-1"
                      >
                        {job.lastStatus}
                      </Badge>
                    )}
                    {formatDate(job.lastRunAt)}
                  </TableCell>
                  <TableCell>{formatDate(job.nextRunAt)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {job.enabled ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => disableMutation.mutate(job.id)}
                          disabled={disableMutation.isPending}
                        >
                          <Pause className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => enableMutation.mutate(job.id)}
                          disabled={enableMutation.isPending}
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setHistoryJob(job)}
                      >
                        <History className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteId(job.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={9} className="text-center">
                  No cron jobs configured
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Cron Job</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this cron job? This action cannot
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

      <Dialog
        open={!!historyJob}
        onOpenChange={() => setHistoryJob(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Run History: {historyJob?.name}</DialogTitle>
            <DialogDescription>
              Recent executions of this cron job
            </DialogDescription>
          </DialogHeader>
          {history && history.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Ended</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((run: CronJobRun) => (
                  <TableRow key={run.id}>
                    <TableCell>#{run.id}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          run.status === "success"
                            ? "success"
                            : run.status === "running"
                              ? "warning"
                              : "destructive"
                        }
                      >
                        {run.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(run.startedAt)}</TableCell>
                    <TableCell>{formatDate(run.endedAt)}</TableCell>
                    <TableCell className="max-w-xs truncate">
                      {run.error || "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              No run history
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setHistoryJob(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
