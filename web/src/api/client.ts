const API_BASE = "";

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(API_BASE + url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `HTTP ${res.status}`);
  }

  return res.json();
}

export const api = {
  health: () => fetchJSON<{ status: string; timestamp: number }>("/health"),

  runs: {
    list: (limit = 20) => fetchJSON<Run[]>(`/api/runs?limit=${limit}`),
    get: (id: number) => fetchJSON<RunWithAccounts>(`/api/runs/${id}`),
    delete: (id: number) =>
      fetchJSON<void>(`/api/runs/${id}`, { method: "DELETE" }),
    accounts: (id: number) =>
      fetchJSON<RunAccount[]>(`/api/runs/${id}/accounts`),
    deleteAccount: (runAccountId: number) =>
      fetchJSON<void>(`/api/runs/accounts/${runAccountId}`, { method: "DELETE" }),
  },

  posts: {
    list: (params?: {
      limit?: number;
      offset?: number;
      platform?: string;
      sourceAccountId?: string;
    }) => {
      const sp = new URLSearchParams();
      if (params?.limit) sp.set("limit", String(params.limit));
      if (params?.offset) sp.set("offset", String(params.offset));
      if (params?.platform) sp.set("platform", params.platform);
      if (params?.sourceAccountId) sp.set("sourceAccountId", params.sourceAccountId);
      const query = sp.toString();
      return fetchJSON<Post[]>(`/api/posts${query ? `?${query}` : ""}`);
    },
    get: (id: number) => fetchJSON<PostWithComments>(`/api/posts/${id}`),
    delete: (id: number) =>
      fetchJSON<void>(`/api/posts/${id}`, { method: "DELETE" }),
  },

  triage: {
    list: (params?: {
      limit?: number;
      runAccountId?: number;
      minScore?: number;
      label?: string;
      selectedOnly?: boolean;
    }) => {
      const sp = new URLSearchParams();
      if (params?.limit) sp.set("limit", String(params.limit));
      if (params?.runAccountId) sp.set("runAccountId", String(params.runAccountId));
      if (params?.minScore) sp.set("minScore", String(params.minScore));
      if (params?.label) sp.set("label", params.label);
      if (params?.selectedOnly) sp.set("selectedOnly", "true");
      const query = sp.toString();
      return fetchJSON<Triage[]>(`/api/triage${query ? `?${query}` : ""}`);
    },
    get: (id: number) => fetchJSON<Triage>(`/api/triage/${id}`),
    byRunAccount: (runAccountId: number) =>
      fetchJSON<Triage[]>(`/api/triage/run-account/${runAccountId}`),
    top20: (runAccountId: number) =>
      fetchJSON<Triage[]>(`/api/triage/run-account/${runAccountId}/top20`),
    selected: (runAccountId: number) =>
      fetchJSON<Triage[]>(`/api/triage/run-account/${runAccountId}/selected`),
  },

  drafts: {
    list: (params?: { runAccountId?: number; postId?: number }) => {
      const sp = new URLSearchParams();
      if (params?.runAccountId) sp.set("runAccountId", String(params.runAccountId));
      if (params?.postId) sp.set("postId", String(params.postId));
      const query = sp.toString();
      return fetchJSON<Draft[]>(`/api/drafts${query ? `?${query}` : ""}`);
    },
    get: (id: number) => fetchJSON<Draft>(`/api/drafts/${id}`),
    select: (id: number, data: { selectedBy?: string; metadata?: Record<string, unknown> }) =>
      fetchJSON<Draft>(`/api/drafts/${id}/select`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    reject: (id: number) =>
      fetchJSON<Draft>(`/api/drafts/${id}/reject`, { method: "POST" }),
    feedback: (postId: number) =>
      fetchJSON<unknown[]>(`/api/drafts/post/${postId}/feedback`),
  },

  policies: {
    get: (accountId: number) =>
      fetchJSON<Policy>(`/api/policies/account/${accountId}`),
    update: (
      accountId: number,
      data: {
        name?: string;
        topics?: string[];
        goals?: string[];
        avoidList?: string[];
        toneIdentity?: string;
        preferredLanguages?: string[];
      }
    ) =>
      fetchJSON<Policy>(`/api/policies/account/${accountId}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    delete: (accountId: number) =>
      fetchJSON<void>(`/api/policies/account/${accountId}`, { method: "DELETE" }),
  },

  cron: {
    list: (accountId?: number) => {
      const sp = accountId ? `?accountId=${accountId}` : "";
      return fetchJSON<CronJob[]>(`/api/cron${sp}`);
    },
    get: (id: number) => fetchJSON<CronJob>(`/api/cron/${id}`),
    create: (data: {
      accountId: number;
      name: string;
      cronExpr: string;
      timezone?: string;
      pipelineConfig?: Record<string, unknown>;
    }) =>
      fetchJSON<CronJob>("/api/cron", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (
      id: number,
      data: {
        name?: string;
        cronExpr?: string;
        timezone?: string;
        pipelineConfig?: Record<string, unknown>;
      }
    ) =>
      fetchJSON<CronJob>(`/api/cron/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    enable: (id: number) =>
      fetchJSON<CronJob>(`/api/cron/${id}/enable`, { method: "POST" }),
    disable: (id: number) =>
      fetchJSON<CronJob>(`/api/cron/${id}/disable`, { method: "POST" }),
    delete: (id: number) =>
      fetchJSON<void>(`/api/cron/${id}`, { method: "DELETE" }),
    history: (id: number, limit = 20) =>
      fetchJSON<CronJobRun[]>(`/api/cron/${id}/history?limit=${limit}`),
  },
};

import type {
  Run,
  RunAccount,
  RunWithAccounts,
  Post,
  PostWithComments,
  Comment,
  Triage,
  Draft,
  Policy,
  CronJob,
  CronJobRun,
} from "./types";

export type {
  Run,
  RunAccount,
  RunWithAccounts,
  Post,
  PostWithComments,
  Comment,
  Triage,
  Draft,
  Policy,
  CronJob,
  CronJobRun,
};
