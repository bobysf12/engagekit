import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { ExternalLink, Trash2 } from "lucide-react";

function formatDate(ts: number) {
  return new Date(ts * 1000).toLocaleString();
}

function truncate(text: string | null, max: number) {
  if (!text) return "-";
  if (text.length <= max) return text;
  return text.slice(0, max) + "...";
}

export function PostsPage() {
  const queryClient = useQueryClient();
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [platform, setPlatform] = useState<string>("");
  const [search, setSearch] = useState<string>("");

  const { data: posts, isLoading } = useQuery({
    queryKey: ["posts", platform],
    queryFn: () =>
      api.posts.list({
        limit: 100,
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
        <h1 className="text-2xl font-bold">Scraped Posts</h1>
        <p className="text-muted-foreground">View and manage scraped posts</p>
      </div>

      <div className="flex gap-4">
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
                    <div className="flex justify-end gap-2">
                      {post.postUrl && (
                        <Button
                          variant="ghost"
                          size="icon"
                          asChild
                        >
                          <a
                            href={post.postUrl ?? undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
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
