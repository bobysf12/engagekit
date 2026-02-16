import { useState } from "react";
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
  ExternalLink,
  Trash2,
  Copy,
  Link2,
  Eye,
  CheckCircle,
  Circle,
} from "lucide-react";

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

export function PostsListPage() {
  const queryClient = useQueryClient();
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [platform, setPlatform] = useState<string>("");
  const [engaged, setEngaged] = useState<string>("");
  const [search, setSearch] = useState<string>("");

  const { data: posts, isLoading } = useQuery({
    queryKey: ["posts", platform, engaged],
    queryFn: () =>
      api.posts.list({
        limit: 100,
        platform: platform || undefined,
        engaged: engaged === "true" ? true : engaged === "false" ? false : undefined,
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.posts.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      setDeleteId(null);
    },
  });

  const filteredPosts = posts?.filter((post: Post) => {
    if (!search) return true;
    return (
      post.authorHandle.toLowerCase().includes(search.toLowerCase()) ||
      (post.bodyText?.toLowerCase().includes(search.toLowerCase()) ?? false)
    );
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
        <h1 className="text-2xl font-bold">Posts</h1>
        <p className="text-muted-foreground">
          View and manage scraped posts. Click on a post to view details and generate drafts.
        </p>
      </div>

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
        <Select
          value={engaged}
          onChange={(e) => setEngaged(e.target.value)}
          options={[
            { value: "", label: "All engagement" },
            { value: "true", label: "Engaged" },
            { value: "false", label: "Not engaged" },
          ]}
          className="w-40"
        />
      </div>

      <div className="rounded-md border">
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
            {filteredPosts && filteredPosts.length > 0 ? (
              filteredPosts.map((post: Post) => (
                <TableRow key={post.id}>
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
                      <div className="flex flex-col gap-0.5">
                        <span className="font-mono text-sm">
                          {post.triageScore}
                        </span>
                        <Badge
                          variant={
                            post.triageLabel === "keep"
                              ? "success"
                              : post.triageLabel === "maybe"
                              ? "warning"
                              : "secondary"
                          }
                          className="text-xs"
                        >
                          {post.triageLabel}
                        </Badge>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">-</span>
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
                  <TableCell>{formatDate(post.firstSeenAt)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" asChild>
                        <Link to={`/posts/${post.id}`} title="View workspace">
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>
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
                <TableCell colSpan={8} className="text-center">
                  No posts found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

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
