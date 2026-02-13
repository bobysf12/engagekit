import * as React from "react";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Save, Trash2 } from "lucide-react";

function formatDate(ts: number) {
  return new Date(ts * 1000).toLocaleString();
}

export function PolicyPage() {
  const queryClient = useQueryClient();
  const [accountId, setAccountId] = useState<string>("1");
  const [showDelete, setShowDelete] = useState(false);

  const [formData, setFormData] = useState<{
    name: string;
    topics: string;
    goals: string;
    avoidList: string;
    toneIdentity: string;
    preferredLanguages: string;
  }>({
    name: "",
    topics: "",
    goals: "",
    avoidList: "",
    toneIdentity: "",
    preferredLanguages: "",
  });

  const { data: policy, isLoading } = useQuery({
    queryKey: ["policy", accountId],
    queryFn: () => api.policies.get(parseInt(accountId)),
    enabled: !!accountId,
  });

  React.useEffect(() => {
    if (policy) {
      setFormData({
        name: policy.name || "",
        topics: policy.topics?.join(", ") || "",
        goals: policy.goals?.join(", ") || "",
        avoidList: policy.avoidList?.join(", ") || "",
        toneIdentity: policy.toneIdentity || "",
        preferredLanguages: policy.preferredLanguages?.join(", ") || "",
      });
    }
  }, [policy]);

  const updateMutation = useMutation({
    mutationFn: (data: {
      name?: string;
      topics?: string[];
      goals?: string[];
      avoidList?: string[];
      toneIdentity?: string;
      preferredLanguages?: string[];
    }) => api.policies.update(parseInt(accountId), data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["policy", accountId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.policies.delete(parseInt(accountId)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["policy", accountId] });
      setShowDelete(false);
      setFormData({
        name: "",
        topics: "",
        goals: "",
        avoidList: "",
        toneIdentity: "",
        preferredLanguages: "",
      });
    },
  });

  const handleSave = () => {
    updateMutation.mutate({
      name: formData.name || undefined,
      topics: formData.topics
        ? formData.topics.split(",").map((t) => t.trim()).filter(Boolean)
        : undefined,
      goals: formData.goals
        ? formData.goals.split(",").map((t) => t.trim()).filter(Boolean)
        : undefined,
      avoidList: formData.avoidList
        ? formData.avoidList.split(",").map((t) => t.trim()).filter(Boolean)
        : undefined,
      toneIdentity: formData.toneIdentity || undefined,
      preferredLanguages: formData.preferredLanguages
        ? formData.preferredLanguages.split(",").map((t) => t.trim()).filter(Boolean)
        : undefined,
    });
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
      <div>
        <h1 className="text-2xl font-bold">Engagement Policy</h1>
        <p className="text-muted-foreground">
          Configure engagement policy for your accounts
        </p>
      </div>

      <div className="flex gap-4 items-center">
        <Label htmlFor="accountId">Account ID</Label>
        <Input
          id="accountId"
          type="number"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="w-32"
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Policy Configuration</CardTitle>
              <CardDescription>
                Define how the AI should engage with content
              </CardDescription>
            </div>
            {policy && (
              <div className="text-right">
                <Badge variant="outline">ID: {policy.id}</Badge>
                <p className="text-xs text-muted-foreground mt-1">
                  Updated: {formatDate(policy.updatedAt)}
                </p>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">Policy Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="My Engagement Policy"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="topics">Topics (comma-separated)</Label>
            <Textarea
              id="topics"
              value={formData.topics}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, topics: e.target.value }))
              }
              placeholder="AI, technology, startups, productivity"
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="goals">Engagement Goals (comma-separated)</Label>
            <Textarea
              id="goals"
              value={formData.goals}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, goals: e.target.value }))
              }
              placeholder="Build relationships, share knowledge, support community"
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="avoidList">Topics to Avoid (comma-separated)</Label>
            <Textarea
              id="avoidList"
              value={formData.avoidList}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, avoidList: e.target.value }))
              }
              placeholder="Politics, controversy, competitors"
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="toneIdentity">Tone & Identity</Label>
            <Textarea
              id="toneIdentity"
              value={formData.toneIdentity}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  toneIdentity: e.target.value,
                }))
              }
              placeholder="Friendly, helpful, professional but approachable. Use casual language when appropriate."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="languages">Preferred Languages (comma-separated)</Label>
            <Input
              id="languages"
              value={formData.preferredLanguages}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  preferredLanguages: e.target.value,
                }))
              }
              placeholder="en, es, fr"
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button onClick={handleSave} disabled={updateMutation.isPending}>
              <Save className="h-4 w-4 mr-2" />
              {updateMutation.isPending ? "Saving..." : "Save Policy"}
            </Button>
            {policy && (
              <Button
                variant="destructive"
                onClick={() => setShowDelete(true)}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Policy</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this policy? This will deactivate
              it for the account. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate()}
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
