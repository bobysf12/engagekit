import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import type { Post, PostWorkspace } from "@/api/types";
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
import { Card, CardContent } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  ExternalLink,
  Trash2,
  Copy,
  Link2,
  CheckCircle,
  Circle,
  AlertCircle,
  Inbox,
  Filter,
  RefreshCw,
  Sparkles,
  X,
  Check,
  SkipForward,
  Bookmark,
  BookmarkCheck,
  WandSparkles,
  ChevronRight,
} from "lucide-react";

type Preset = "all" | "needs-triage" | "high-priority" | "not-engaged" | "today";
type SavedView = {
  id: string;
  name: string;
  preset: Preset;
  platform: string;
  search: string;
};

const SAVED_VIEWS_KEY = "engagekit.posts.saved-views";
const DEFAULT_VIEW_KEY = "engagekit.posts.default-view";
const SKIPPED_IDS_KEY = "engagekit.posts.skipped";

function formatDate(ts: number | null) {
  if (!ts) return "-";
  return new Date(ts * 1000).toLocaleString();
}

function formatRelativeTime(ts: number | null) {
  if (!ts) return "-";
  const now = Date.now();
  const diff = now - ts * 1000;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(ts * 1000).toLocaleDateString();
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

function getReasonTags(post: Post): string[] {
  const tags: string[] = [];
  if (post.triageScore !== null && post.triageScore >= 75) tags.push("high intent");
  if (post.triageLabel) tags.push(post.triageLabel.toLowerCase());
  if (post.triageAction) tags.push(post.triageAction.toLowerCase().replaceAll("_", " "));
  return [...new Set(tags)].slice(0, 3);
}

function PostCardSkeleton() {
  return (
    <Card className="animate-pulse">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2">
              <div className="h-5 w-16 bg-muted rounded" />
              <div className="h-4 w-8 bg-muted rounded" />
              <div className="h-5 w-16 bg-muted rounded" />
            </div>
            <div className="h-4 w-24 bg-muted rounded" />
            <div className="h-4 w-32 bg-muted rounded opacity-60" />
          </div>
          <div className="h-8 w-16 bg-muted rounded" />
        </div>
        <div className="mt-3 space-y-1.5">
          <div className="h-4 bg-muted rounded w-full" />
          <div className="h-4 bg-muted rounded w-3/4" />
        </div>
      </CardContent>
    </Card>
  );
}

function DesktopRowSkeleton() {
  return (
    <div className="grid grid-cols-[1.2fr_2fr_1fr_0.9fr_0.9fr_1.6fr] gap-3 p-3 border-b animate-pulse">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-5 bg-muted rounded" />
      ))}
    </div>
  );
}

function PostCard({
  post,
  onDelete,
  onSelect,
}: {
  post: Post;
  onDelete: (id: number) => void;
  onSelect: (post: Post) => void;
}) {
  return (
    <Card className="overflow-hidden active:bg-muted/50 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
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
                <Badge variant="success" className="text-xs gap-0.5">
                  <CheckCircle className="h-2.5 w-2.5" />
                  Engaged
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs gap-0.5">
                  <Circle className="h-2.5 w-2.5" />
                  Not engaged
                </Badge>
              )}
            </div>
            <div className="font-medium truncate text-sm">@{post.authorHandle}</div>
            {post.authorDisplayName && (
              <div className="text-xs text-muted-foreground truncate">
                {post.authorDisplayName}
              </div>
            )}
          </div>
          <Button
            variant="default"
            size="sm"
            onClick={() => onSelect(post)}
            className="shrink-0 h-8 px-3"
          >
            Open
          </Button>
        </div>
        <p className="text-sm text-muted-foreground line-clamp-2 mt-2 break-words">
          {post.bodyText || <span className="italic">No content</span>}
        </p>
        <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
          <span>{formatRelativeTime(post.firstSeenAt)}</span>
          <div className="flex items-center gap-0.5">
            {post.postUrl && (
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
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(post.id);
              }}
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function PostsListPage() {
  const queryClient = useQueryClient();
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [platform, setPlatform] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [preset, setPreset] = useState<Preset>("all");
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [defaultViewId, setDefaultViewId] = useState<string>("all");
  const [skippedIds, setSkippedIds] = useState<Set<number>>(new Set());

  const { data: posts, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["posts", platform],
    queryFn: () =>
      api.posts.list({
        limit: 200,
        platform: platform || undefined,
      }),
  });

  const { data: selectedWorkspace } = useQuery<PostWorkspace | null>({
    queryKey: ["post-workspace", selectedPost?.id],
    queryFn: () => (selectedPost ? api.posts.workspace(selectedPost.id) : Promise.resolve(null)),
    enabled: !!selectedPost,
  });

  useEffect(() => {
    try {
      const rawViews = localStorage.getItem(SAVED_VIEWS_KEY);
      const rawDefault = localStorage.getItem(DEFAULT_VIEW_KEY);
      const rawSkipped = localStorage.getItem(SKIPPED_IDS_KEY);

      const parsedViews = rawViews ? (JSON.parse(rawViews) as SavedView[]) : [];
      const defaultId = rawDefault || "all";
      const parsedSkipped = rawSkipped ? (JSON.parse(rawSkipped) as number[]) : [];

      setSavedViews(parsedViews);
      setDefaultViewId(defaultId);
      setSkippedIds(new Set(parsedSkipped));

      if (defaultId !== "all") {
        const view = parsedViews.find((v) => v.id === defaultId);
        if (view) {
          setPreset(view.preset);
          setPlatform(view.platform);
          setSearch(view.search);
        }
      }
    } catch {
      // no-op
    }
  }, []);

  const persistSkipped = (next: Set<number>) => {
    setSkippedIds(next);
    localStorage.setItem(SKIPPED_IDS_KEY, JSON.stringify([...next]));
  };

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.posts.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      setDeleteId(null);
      if (selectedPost?.id === deleteId) {
        setSheetOpen(false);
        setSelectedPost(null);
      }
    },
  });

  const engageMutation = useMutation({
    mutationFn: ({ id, engaged }: { id: number; engaged: boolean }) =>
      api.posts.setEngagement(id, engaged),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      if (selectedPost) {
        setSelectedPost({ ...selectedPost, engaged: variables.engaged ? 1 : 0 });
      }
    },
  });

  const draftMutation = useMutation({
    mutationFn: (id: number) => api.posts.generateDrafts(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["posts"] }),
  });

  const filteredPosts = useMemo(() => {
    if (!posts) return [];

    return posts.filter((post: Post) => {
      if (skippedIds.has(post.id)) return false;
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
  }, [posts, preset, search, skippedIds]);

  const presetCounts = useMemo(() => {
    if (!posts) return { all: 0, "needs-triage": 0, "high-priority": 0, "not-engaged": 0, today: 0 };
    const visible = posts.filter((p: Post) => !skippedIds.has(p.id));
    return {
      all: visible.length,
      "needs-triage": visible.filter((p: Post) => p.triageScore === null).length,
      "high-priority": visible.filter((p: Post) => p.triageScore !== null && p.triageScore >= 75).length,
      "not-engaged": visible.filter((p: Post) => p.engaged !== 1).length,
      today: visible.filter((p: Post) => isToday(p.firstSeenAt)).length,
    };
  }, [posts, skippedIds]);

  useEffect(() => {
    if (!selectedPost && filteredPosts.length > 0) {
      setSelectedPost(filteredPosts[0]);
      return;
    }

    if (selectedPost && !filteredPosts.some((p) => p.id === selectedPost.id)) {
      setSelectedPost(filteredPosts[0] ?? null);
    }
  }, [filteredPosts, selectedPost]);

  const handleSelectPost = (post: Post) => {
    setSelectedPost(post);
    setSheetOpen(true);
  };

  const handleSkip = (post?: Post | null) => {
    const target = post ?? selectedPost;
    if (!target) return;
    const next = new Set(skippedIds);
    next.add(target.id);
    persistSkipped(next);
    if (sheetOpen) setSheetOpen(false);
  };

  const saveCurrentView = () => {
    const name = prompt("Name this saved view:", `Queue • ${preset}`)?.trim();
    if (!name) return;

    const next: SavedView[] = [
      ...savedViews.filter((v) => v.name.toLowerCase() !== name.toLowerCase()),
      { id: crypto.randomUUID(), name, preset, platform, search },
    ].slice(-6);

    setSavedViews(next);
    localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(next));
  };

  const applyView = (view: SavedView) => {
    setPreset(view.preset);
    setPlatform(view.platform);
    setSearch(view.search);
  };

  const setAsDefault = (id: string) => {
    setDefaultViewId(id);
    localStorage.setItem(DEFAULT_VIEW_KEY, id);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || target?.isContentEditable) return;
      if (!selectedPost) return;

      const key = e.key.toLowerCase();
      if (key === "e") {
        e.preventDefault();
        engageMutation.mutate({ id: selectedPost.id, engaged: !selectedPost.engaged });
      }
      if (key === "s") {
        e.preventDefault();
        handleSkip(selectedPost);
      }
      if (key === "d") {
        e.preventDefault();
        draftMutation.mutate(selectedPost.id);
      }
      if (key === "o" && selectedPost.postUrl) {
        e.preventDefault();
        window.open(selectedPost.postUrl, "_blank", "noopener,noreferrer");
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedPost, engageMutation, draftMutation]);

  return (
    <div className="space-y-4 min-w-0 max-w-full overflow-x-hidden">
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Posts</h1>
          <span className="text-sm text-muted-foreground">{filteredPosts.length} in queue</span>
        </div>
        <p className="text-muted-foreground text-sm">Review → decide → engage. Shortcuts: E (engage), S (skip), D (draft), O (open).</p>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex w-full items-center gap-1 overflow-x-auto scrollbar-hide">
          <Filter className="h-4 w-4 text-muted-foreground shrink-0 mr-1" />
          {PRESETS.map((p) => (
            <Button
              key={p.value}
              variant={preset === p.value ? "default" : "outline"}
              size="sm"
              onClick={() => setPreset(p.value)}
              className="shrink-0 h-9 gap-1.5 whitespace-nowrap"
            >
              <span>{p.label}</span>
              <Badge variant="secondary" className="px-1.5 py-0 text-xs min-w-[1.5rem] text-center">
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
            className="max-w-sm min-w-0 flex-1"
          />
          <Select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            options={[
              { value: "", label: "All platforms" },
              { value: "threads", label: "Threads" },
              { value: "x", label: "X (Twitter)" },
            ]}
            className="w-36 shrink-0"
          />
          <Button variant="outline" className="gap-2" onClick={saveCurrentView}>
            <Bookmark className="h-4 w-4" />
            Save view
          </Button>
        </div>

        {savedViews.length > 0 && (
          <div className="flex w-full items-center gap-2 overflow-x-auto scrollbar-hide">
            {savedViews.map((view) => (
              <div key={view.id} className="inline-flex items-center gap-1 rounded-md border p-1">
                <Button variant="ghost" size="sm" className="h-7" onClick={() => applyView(view)}>
                  {view.name}
                </Button>
                <Button
                  variant={defaultViewId === view.id ? "secondary" : "ghost"}
                  size="icon"
                  className="h-7 w-7"
                  title="Set as default"
                  onClick={() => setAsDefault(view.id)}
                >
                  {defaultViewId === view.id ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
                </Button>
              </div>
            ))}
            <Button variant={defaultViewId === "all" ? "secondary" : "ghost"} size="sm" onClick={() => setAsDefault("all")}>
              Default: All
            </Button>
          </div>
        )}
      </div>

      {isLoading ? (
        <>
          <div className="hidden lg:block rounded-md border overflow-hidden">
            <div className="grid grid-cols-[1.2fr_2fr_1fr_0.9fr_0.9fr_1.6fr] gap-3 p-3 border-b bg-muted/40 text-xs font-medium text-muted-foreground">
              <span>Author</span>
              <span>Snippet</span>
              <span>Priority + reasons</span>
              <span>Engaged</span>
              <span>Scraped</span>
              <span>Actions</span>
            </div>
            {Array.from({ length: 7 }).map((_, i) => (
              <DesktopRowSkeleton key={i} />
            ))}
          </div>
          <div className="lg:hidden space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <PostCardSkeleton key={i} />
            ))}
          </div>
        </>
      ) : isError ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
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
          </CardContent>
        </Card>
      ) : filteredPosts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Inbox className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground font-medium">
              {posts && posts.length > 0 ? "No posts match your queue" : "No posts found"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {posts && posts.length > 0 ? "Try adjusting filters or clear skipped items" : "Run a scrape to collect posts"}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => {
                persistSkipped(new Set());
                setPreset("all");
              }}
            >
              Reset queue
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="hidden lg:grid lg:grid-cols-[minmax(0,1fr)_380px] gap-4 items-start">
            <div className="rounded-md border overflow-hidden">
              <div className="sticky top-0 z-10 grid grid-cols-[1.2fr_2fr_1fr_0.9fr_0.9fr_1.6fr] gap-3 p-3 border-b bg-background text-xs font-medium text-muted-foreground">
                <span>Author</span>
                <span>Snippet</span>
                <span>Priority + reasons</span>
                <span>Engaged</span>
                <span>Scraped</span>
                <span>Actions</span>
              </div>
              <div className="max-h-[68vh] overflow-y-auto">
                {filteredPosts.map((post: Post) => {
                  const selected = selectedPost?.id === post.id;
                  const reasonTags = getReasonTags(post);
                  return (
                    <button
                      key={post.id}
                      type="button"
                      onClick={() => setSelectedPost(post)}
                      className={`w-full text-left grid grid-cols-[1.2fr_2fr_1fr_0.9fr_0.9fr_1.6fr] gap-3 p-3 border-b transition-colors ${
                        selected ? "bg-muted/60" : "hover:bg-muted/30"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="font-medium truncate">@{post.authorHandle}</p>
                        <p className="text-xs text-muted-foreground truncate">{post.authorDisplayName}</p>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">{truncate(post.bodyText, 120)}</p>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          {post.triageScore !== null ? (
                            <span className="font-mono text-sm font-semibold">{post.triageScore}</span>
                          ) : (
                            <span className="text-xs italic text-muted-foreground">no score</span>
                          )}
                          {post.triageScore !== null && post.triageScore >= 75 && <Sparkles className="h-3.5 w-3.5 text-success" />}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {reasonTags.length > 0 ? (
                            reasonTags.map((tag) => (
                              <Badge key={`${post.id}-${tag}`} variant="outline" className="text-[10px] px-1.5 py-0">{tag}</Badge>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </div>
                      <div>
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
                      </div>
                      <div className="text-sm text-muted-foreground">{formatRelativeTime(post.firstSeenAt)}</div>
                      <div className="flex flex-wrap justify-start gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="sm"
                          variant={post.engaged ? "secondary" : "default"}
                          className="h-7 px-2"
                          onClick={() => engageMutation.mutate({ id: post.id, engaged: !post.engaged })}
                        >
                          E
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => handleSkip(post)}>
                          S
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2"
                          onClick={() => draftMutation.mutate(post.id)}
                          disabled={draftMutation.isPending}
                        >
                          D
                        </Button>
                        {post.postUrl && (
                          <Button size="sm" variant="outline" className="h-7 px-2" asChild>
                            <a href={post.postUrl} target="_blank" rel="noopener noreferrer">O</a>
                          </Button>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <Card className="sticky top-4">
              <CardContent className="p-4 space-y-4">
                {selectedPost ? (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline">{selectedPost.platform}</Badge>
                          <span className="font-medium">@{selectedPost.authorHandle}</span>
                        </div>
                        <p className="text-sm text-muted-foreground">{selectedPost.authorDisplayName}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {selectedPost.triageScore !== null && (
                        <Badge variant={selectedPost.triageScore >= 75 ? "success" : "secondary"} className="gap-1">
                          <Sparkles className="h-3 w-3" />
                          Score {selectedPost.triageScore}
                        </Badge>
                      )}
                      {selectedPost.engaged ? (
                        <Badge variant="success" className="gap-1">
                          <CheckCircle className="h-3 w-3" />
                          Engaged
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1">
                          <Circle className="h-3 w-3" />
                          Not engaged
                        </Badge>
                      )}
                    </div>

                    <div className="bg-muted/50 rounded-lg p-3">
                      <p className="text-sm break-words whitespace-pre-wrap">
                        {selectedPost.bodyText || <span className="italic text-muted-foreground">No content</span>}
                      </p>
                    </div>

                    <div className="space-y-1 text-xs text-muted-foreground">
                      <p>Scraped: {formatDate(selectedPost.firstSeenAt)}</p>
                      <p>Last seen: {formatDate(selectedPost.lastSeenAt)}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant={selectedPost.engaged ? "secondary" : "default"}
                        className="gap-2"
                        onClick={() => engageMutation.mutate({ id: selectedPost.id, engaged: !selectedPost.engaged })}
                      >
                        {selectedPost.engaged ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                        {selectedPost.engaged ? "Unmark" : "Mark Engaged"}
                      </Button>

                      <Button variant="outline" className="gap-2" onClick={() => handleSkip(selectedPost)}>
                        <SkipForward className="h-4 w-4" />
                        Skip
                      </Button>

                      <Button
                        variant="outline"
                        className="gap-2"
                        onClick={() => draftMutation.mutate(selectedPost.id)}
                        disabled={draftMutation.isPending}
                      >
                        {draftMutation.isPending ? <Spinner className="h-4 w-4" /> : <WandSparkles className="h-4 w-4" />}
                        Generate Draft
                      </Button>

                      {selectedPost.postUrl ? (
                        <Button variant="outline" className="gap-2" asChild>
                          <a href={selectedPost.postUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4" />
                            Open Source
                          </a>
                        </Button>
                      ) : (
                        <Button variant="outline" disabled>
                          Open Source
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-2 border-t">
                      {selectedPost.bodyText && (
                        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => copyToClipboard(selectedPost.bodyText!)}>
                          <Copy className="h-3.5 w-3.5" /> Copy text
                        </Button>
                      )}
                      {selectedPost.postUrl && (
                        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => copyToClipboard(selectedPost.postUrl!)}>
                          <Link2 className="h-3.5 w-3.5" /> Copy link
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="gap-1.5 text-destructive" onClick={() => setDeleteId(selectedPost.id)}>
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="py-8 text-sm text-muted-foreground text-center">Pick a post from the left queue.</div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="lg:hidden space-y-3">
            {filteredPosts.map((post: Post) => (
              <PostCard key={post.id} post={post} onDelete={setDeleteId} onSelect={handleSelectPost} />
            ))}
          </div>
        </>
      )}

      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Post</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this post? This will also delete all associated comments, triage, and drafts.
              This action cannot be undone.
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

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Badge variant="outline">{selectedPost?.platform}</Badge>
              @{selectedPost?.authorHandle}
            </SheetTitle>
            <SheetDescription>{selectedPost?.authorDisplayName}</SheetDescription>
          </SheetHeader>

          <div className="px-4 space-y-4 pb-24">
            <div className="flex items-center gap-2 flex-wrap">
              {selectedPost?.triageScore !== null && (
                <Badge variant={selectedPost?.triageScore && selectedPost.triageScore >= 75 ? "success" : "secondary"} className="gap-1">
                  <Sparkles className="h-3 w-3" />
                  Score: {selectedPost?.triageScore}
                </Badge>
              )}
              {selectedPost?.engaged ? (
                <Badge variant="success" className="gap-1">
                  <CheckCircle className="h-3 w-3" />
                  Engaged
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1">
                  <Circle className="h-3 w-3" />
                  Not engaged
                </Badge>
              )}
            </div>

            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-sm break-words whitespace-pre-wrap">
                {selectedPost?.bodyText || <span className="italic text-muted-foreground">No content</span>}
              </p>
            </div>

            <div className="rounded-lg border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Post metrics</p>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <p className="text-[11px] text-muted-foreground">Likes</p>
                  <p className="text-sm font-medium">{selectedWorkspace?.metrics?.likesCount ?? "-"}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">Replies</p>
                  <p className="text-sm font-medium">{selectedWorkspace?.metrics?.repliesCount ?? "-"}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">Reposts</p>
                  <p className="text-sm font-medium">{selectedWorkspace?.metrics?.repostsCount ?? "-"}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">Views</p>
                  <p className="text-sm font-medium">{selectedWorkspace?.metrics?.viewsCount ?? "-"}</p>
                </div>
              </div>
            </div>

            <div className="text-xs text-muted-foreground">Scraped: {formatDate(selectedPost?.firstSeenAt ?? null)}</div>
          </div>

          <SheetFooter className="grid grid-cols-2 gap-2 sm:flex-row">
            <Button variant="outline" className="gap-2" onClick={() => handleSkip()}>
              <SkipForward className="h-4 w-4" />
              Skip
            </Button>

            <Button
              variant={selectedPost?.engaged ? "secondary" : "default"}
              className="gap-2"
              onClick={() => {
                if (selectedPost) {
                  engageMutation.mutate({ id: selectedPost.id, engaged: !selectedPost.engaged });
                }
              }}
              disabled={engageMutation.isPending}
            >
              {selectedPost?.engaged ? (
                <>
                  <X className="h-4 w-4" />
                  Unmark
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Engage
                </>
              )}
            </Button>

            <Button
              variant="outline"
              className="gap-2"
              onClick={() => selectedPost && draftMutation.mutate(selectedPost.id)}
              disabled={draftMutation.isPending || !selectedPost}
            >
              {draftMutation.isPending ? <Spinner className="h-4 w-4" /> : <WandSparkles className="h-4 w-4" />}
              Draft
            </Button>

            {selectedPost?.postUrl ? (
              <Button variant="outline" className="gap-2" asChild>
                <a href={selectedPost.postUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  Source
                </a>
              </Button>
            ) : (
              <Button variant="outline" disabled>
                Source
              </Button>
            )}

            {selectedPost ? (
              <Button variant="outline" className="col-span-2 gap-2" asChild>
                <Link to={`/posts/${selectedPost.id}`} onClick={() => setSheetOpen(false)}>
                  Open full details
                </Link>
              </Button>
            ) : null}
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
