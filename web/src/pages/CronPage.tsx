import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { CronJob, CronJobRun, CronPipelineConfig, CronSource } from "@/api/types";
import { DEFAULT_CRON_CONFIG } from "@/api/types";
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
import { Play, Pause, Trash2, History, Plus, Pencil, Zap } from "lucide-react";

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

function parseAccountId(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed <= 0) return null;
  return parsed;
}

interface CronFormData {
  accountId: string;
  name: string;
  cronExpr: string;
  timezone: string;
  config: CronPipelineConfig;
}

const defaultFormData: CronFormData = {
  accountId: "",
  name: "",
  cronExpr: "0 9 * * *",
  timezone: "UTC",
  config: { ...DEFAULT_CRON_CONFIG },
};

export function CronPage() {
  const queryClient = useQueryClient();
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [historyJob, setHistoryJob] = useState<CronJob | null>(null);
  const [showFormDialog, setShowFormDialog] = useState(false);
  const [editingJob, setEditingJob] = useState<CronJob | null>(null);
  const [formData, setFormData] = useState<CronFormData>(defaultFormData);
  const [accountIdError, setAccountIdError] = useState<string | null>(null);

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

  const runNowMutation = useMutation({
    mutationFn: (id: number) => api.cron.runNow(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cron"] });
    },
  });

  const createMutation = useMutation({
    mutationFn: () => {
      const accountId = parseAccountId(formData.accountId);
      if (accountId === null) {
        throw new Error("Please enter a valid positive account ID");
      }
      return api.cron.create({
        accountId,
        name: formData.name,
        cronExpr: formData.cronExpr,
        timezone: formData.timezone,
        pipelineConfig: formData.config as unknown as Record<string, unknown>,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cron"] });
      handleCloseFormDialog();
    },
    onError: (error: Error) => {
      setAccountIdError(error.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!editingJob) throw new Error("No job being edited");
      return api.cron.update(editingJob.id, {
        name: formData.name,
        cronExpr: formData.cronExpr,
        timezone: formData.timezone,
        pipelineConfig: formData.config as unknown as Record<string, unknown>,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cron"] });
      handleCloseFormDialog();
    },
  });

  const handleOpenCreateDialog = () => {
    setEditingJob(null);
    setFormData(defaultFormData);
    setAccountIdError(null);
    setShowFormDialog(true);
  };

  const handleOpenEditDialog = (job: CronJob) => {
    setEditingJob(job);
    let config = DEFAULT_CRON_CONFIG;
    if (job.pipelineConfigJson) {
      try {
        config = JSON.parse(job.pipelineConfigJson) as CronPipelineConfig;
      } catch {
        // use default
      }
    }
    setFormData({
      accountId: String(job.accountId),
      name: job.name,
      cronExpr: job.cronExpr,
      timezone: job.timezone,
      config,
    });
    setAccountIdError(null);
    setShowFormDialog(true);
  };

  const handleCloseFormDialog = () => {
    setShowFormDialog(false);
    setEditingJob(null);
    setFormData(defaultFormData);
    setAccountIdError(null);
    createMutation.reset();
    updateMutation.reset();
  };

  const handleSubmit = () => {
    setAccountIdError(null);
    if (!editingJob) {
      const accountId = parseAccountId(formData.accountId);
      if (accountId === null) {
        setAccountIdError("Please enter a valid positive account ID");
        return;
      }
      createMutation.mutate();
    } else {
      updateMutation.mutate();
    }
  };

  const addSource = (type: "home" | "profile" | "search") => {
    setFormData({
      ...formData,
      config: {
        ...formData.config,
        sources: [...formData.config.sources, { type, value: type === "home" ? undefined : "" }],
      },
    });
  };

  const removeSource = (index: number) => {
    const newSources = formData.config.sources.filter((_, i) => i !== index);
    if (newSources.length > 0) {
      setFormData({
        ...formData,
        config: { ...formData.config, sources: newSources },
      });
    }
  };

  const updateSource = (index: number, updates: Partial<CronSource>) => {
    const newSources = formData.config.sources.map((s, i) =>
      i === index ? { ...s, ...updates } : s
    );
    setFormData({
      ...formData,
      config: { ...formData.config, sources: newSources },
    });
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

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
          <h1 className="text-2xl font-bold">Cron Jobs</h1>
          <p className="text-muted-foreground">
            Manage scheduled pipeline runs
          </p>
        </div>
        <Button onClick={handleOpenCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          New Cron Job
        </Button>
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
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => runNowMutation.mutate(job.id)}
                        disabled={runNowMutation.isPending}
                        title="Run now"
                      >
                        <Zap className="h-4 w-4" />
                      </Button>
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
                        onClick={() => handleOpenEditDialog(job)}
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
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

      <Dialog open={showFormDialog} onOpenChange={handleCloseFormDialog}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingJob ? "Edit Cron Job" : "New Cron Job"}</DialogTitle>
            <DialogDescription>
              {editingJob
                ? "Update the cron job settings"
                : "Configure a new scheduled pipeline run"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {!editingJob && (
              <div className="space-y-2">
                <Label htmlFor="accountId">Account ID *</Label>
                <Input
                  id="accountId"
                  type="number"
                  value={formData.accountId}
                  onChange={(e) => {
                    setFormData({ ...formData, accountId: e.target.value });
                    setAccountIdError(null);
                  }}
                  placeholder="Enter account ID"
                  min={1}
                  className={accountIdError ? "border-destructive" : ""}
                />
                {accountIdError && (
                  <p className="text-sm text-destructive">{accountIdError}</p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Daily morning scrape"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cronExpr">Cron Expression *</Label>
                <Input
                  id="cronExpr"
                  value={formData.cronExpr}
                  onChange={(e) => setFormData({ ...formData, cronExpr: e.target.value })}
                  placeholder="0 9 * * *"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="timezone">Timezone</Label>
                <Input
                  id="timezone"
                  value={formData.timezone}
                  onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                  placeholder="UTC"
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Sources</Label>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => addSource("home")}
                    disabled={formData.config.sources.some((s) => s.type === "home")}
                  >
                    + Home
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => addSource("profile")}>
                    + Profile
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => addSource("search")}>
                    + Search
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                {formData.config.sources.map((source, index) => (
                  <div key={index} className="flex items-center gap-2 p-2 bg-muted rounded-md">
                    <Badge variant="outline">{source.type}</Badge>
                    {source.type !== "home" && (
                      <Input
                        value={source.value || ""}
                        onChange={(e) => updateSource(index, { value: e.target.value })}
                        placeholder={source.type === "profile" ? "username" : "search query"}
                        className="flex-1 h-8"
                      />
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeSource(index)}
                      disabled={formData.config.sources.length === 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="maxPosts">Max Posts Per Run</Label>
                <Input
                  id="maxPosts"
                  type="number"
                  value={formData.config.maxPostsPerRun}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      config: {
                        ...formData.config,
                        maxPostsPerRun: parseInt(e.target.value) || 100,
                      },
                    })
                  }
                  min={1}
                  max={500}
                />
              </div>
              <div className="space-y-2 pt-6">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="generateDrafts"
                    checked={formData.config.generateDrafts}
                    onCheckedChange={(checked: boolean) =>
                      setFormData({
                        ...formData,
                        config: { ...formData.config, generateDrafts: checked },
                      })
                    }
                  />
                  <label htmlFor="generateDrafts" className="text-sm">
                    Generate reply drafts
                  </label>
                </div>
              </div>
            </div>

            {(createMutation.isError || updateMutation.isError) && (
              <p className="text-sm text-destructive">
                {(createMutation.error || updateMutation.error)?.message || "Failed to save"}
              </p>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={handleCloseFormDialog}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={isPending || !formData.name}>
                {isPending ? "Saving..." : editingJob ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
