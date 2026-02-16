import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import type { Post } from "@/api/types";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ExternalLink,
  Trash2,
  Copy,
  Link2,
  Eye,
  CheckCircle,
  Circle,
  AlertCircle,
  Inbox,
  Filter,
  RefreshCw,
  Sparkles,
} from "lucide-react";

type Preset = "all" | "needs-triage" | "high-priority" | "not-engaged" | "today";

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

function isToday(ts: number | null): boolean {
  if (!ts) return false;
  const d = new Date(ts * 1000);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

const PRESETS: { value: Preset; label: string }[] = [
  { value: "all", label: "All" },
  { value: "needs-triage", label: "Needs Triage" },
  { value: "high-priority", label: "High Priority" },
  { value: "not-engaged", label: "Not Engaged" },
  { value: "today", label: "Today" },
];

export function PostsListPage() {
  const queryClient = useQueryClient();
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [platform, setPlatform] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [preset, setPreset] = useState<Preset>("all");

  const { data: posts, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["posts", platform],
    queryFn: () =>
      api.posts.list({
        limit: 200,
        platform: platform || undefined,
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.posts.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      setDeleteId(null);
    },
  });

  const filteredPosts = useMemo(() => {
    if (!posts) return [];

    return posts.filter((post: Post) => {
      if (preset === "needs-triage" && post.triageScore !== null) return false;
      if (preset === "high-priority" && (post.triageScore === null || post.triageScore < 75)) return false;
      if (preset === "not-engaged" && post.engaged === 1) return false;
      if (preset === "today" && !isToday(post.firstSeenAt)) return false;

      if (!search) return true;
      return (
        post.authorHandle.toLowerCase().includes(search.toLowerCase()) ||
        (post.bodyText?.toLowerCase().includes(search.toLowerCase()) ?? false)
      );
    });
  }, [posts, preset, search]);

  const presetCounts = useMemo(() => {
    if (!posts) return { all: 0, "needs-triage": 0, "high-priority": 0, "not-engaged": 0, today: 0 };
    return {
      all: posts.length,
      "needs-triage": posts.filter((p: Post) => p.triageScore === null).length,
      "high-priority": posts.filter((p: Post) => p.triageScore !== null && p.triageScore >= 75).length,
      "not-engaged": posts.filter((p: Post) => p.engaged !== 1).length,
      today: posts.filter((p: Post) => isToday(p.firstSeenAt)).length,
    };
  }, [posts]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <Spinner className="h-8 w-8" />
        <p className="text-muted-foreground text-sm">Loading posts...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-6 w-6" />
          <span className="font-medium">Failed to load posts</span>
        </div>
        <p className="text-muted-foreground text-sm max-w-md text-center">
          {error instanceof Error ? error.message : "An unexpected error occurred"}
        </p>
        <Button variant="outline" onClick={() => refetch()} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Posts</h1>
          <span className="text-sm text-muted-foreground">
            {filteredPosts.length} of {posts?.length ?? 0} posts
          </span>
        </div>
        <p className="text-muted-foreground text-sm">
          Manage scraped posts. Select a preset to filter, or search by author or content.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-1 flex-wrap">
          <Filter className="h-4 w-4 text-muted-foreground mr-1" />
          {PRESETS.map((p) => (
            <Button
              key={p.value}
              variant={preset === p.value ? "default" : "outline"}
              size="sm"
              onClick={() => setPreset(p.value)}
              className="gap-1.5"
            >
              {p.label}
              <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs">
                {presetCounts[p.value]}
              </Badge>
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap gap-3">
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
      </div>

      {filteredPosts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Inbox className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground font-medium">
              {posts && posts.length > 0 ? "No posts match your filters" : "No posts found"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {posts && posts.length > 0
                ? "Try adjusting your search or preset"
                : "Run a scrape to collect posts"}
            </p>
            {preset !== "all" && (
              <Button variant="outline" size="sm" onClick={() => setPreset("all")} className="mt-4">
                Clear preset
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="hidden md:block rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">ID</TableHead>
                  <TableHead>Author</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>Content</TableHead>
                  <TableHead className="w-24">Triage</TableHead>
                  <TableHead>Engaged</TableHead>
                  <TableHead>Scraped</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPosts.map((post: Post) => (
                  <TableRow key={post.id} className="group">
                    <TableCell className="font-medium">
                      <Link
                        to={`/posts/${post.id}`}
                        className="hover:underline text-primary"
                      >
                        #{post.id}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">@{post.authorHandle}</div>
                        {post.authorDisplayName && (
                          <div className="text-xs text-muted-foreground">
                            {post.authorDisplayName}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{post.platform}</Badge>
                    </TableCell>
                    <TableCell className="max-w-xs">
                      {truncate(post.bodyText, 80)}
                    </TableCell>
                    <TableCell>
                      {post.triageScore !== null ? (
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-mono text-sm font-medium ${
                              post.triageScore >= 75
                                ? "text-success"
                                : post.triageScore >= 50
                                  ? "text-warning"
                                  : "text-muted-foreground"
                            }`}
                          >
                            {post.triageScore}
                          </span>
                          {post.triageScore >= 75 && (
                            <Sparkles className="h-3.5 w-3.5 text-success" />
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs italic">no score</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {post.engaged ? (
                        <Badge variant="success" className="gap-1">
                          <CheckCircle className="h-3 w-3" />
                          Yes
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1">
                          <Circle className="h-3 w-3" />
                          No
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(post.firstSeenAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                        <Button variant="default" size="sm" asChild className="gap-1.5">
                          <Link to={`/posts/${post.id}`}>
                            <Eye className="h-4 w-4" />
                            <span className="hidden lg:inline">Open</span>
                          </Link>
                        </Button>
                        {post.postUrl && (
                          <Button variant="ghost" size="icon" asChild title="Open on platform">
                            <a
                              href={post.postUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
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
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => copyToClipboard(post.postUrl!)}
                            title="Copy link"
                          >
                            <Link2 className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteId(post.id)}
                          title="Delete post"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="md:hidden space-y-3">
            {filteredPosts.map((post: Post) => (
              <Card key={post.id} className="overflow-hidden">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs">{post.platform}</Badge>
                        {post.triageScore !== null && (
                          <span
                            className={`font-mono text-xs font-medium ${
                              post.triageScore >= 75
                                ? "text-success"
                                : post.triageScore >= 50
                                  ? "text-warning"
                                  : "text-muted-foreground"
                            }`}
                          >
                            {post.triageScore}
                          </span>
                        )}
                        {post.engaged ? (
                          <Badge variant="success" className="text-xs gap-1">
                            <CheckCircle className="h-2.5 w-2.5" />
                            Engaged
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs gap-1">
                            <Circle className="h-2.5 w-2.5" />
                            Not engaged
                          </Badge>
                        )}
                      </div>
                      <CardTitle className="text-base truncate">@{post.authorHandle}</CardTitle>
                      {post.authorDisplayName && (
                        <CardDescription className="truncate">
                          {post.authorDisplayName}
                        </CardDescription>
                      )}
                    </div>
                    <Link
                      to={`/posts/${post.id}`}
                      className="shrink-0 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
                    >
                      Open
                    </Link>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-sm text-muted-foreground line-clamp-3 mb-3">
                    {post.bodyText || <span className="italic">No content</span>}
                  </p>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{formatDate(post.firstSeenAt)}</span>
                    <div className="flex items-center gap-1">
                      {post.postUrl && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            asChild
                            className="h-7 w-7"
                            title="Open on platform"
                          >
                            <a
                              href={post.postUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => copyToClipboard(post.postUrl!)}
                            title="Copy link"
                          >
                            <Link2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                      {post.bodyText && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => copyToClipboard(post.bodyText!)}
                          title="Copy content"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setDeleteId(post.id)}
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
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
    </div>
  );
}
