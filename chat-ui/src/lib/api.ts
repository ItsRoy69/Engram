const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

import { getUser, getToken, getRefreshToken, accessTokenNeedsRefresh, refreshAccessToken } from "@/lib/auth";

export interface Memory {
  id: string;
  content: string;
  score?: number;
  rerank_score?: number;
  tags: string[];
  created_at?: string;
  graph_rel?: string;
}

export interface StoreResult {
  stored: number;
  skipped_duplicates: number;
  contradictions_resolved: number;
  graph_edges: number;
  facts: string[];
}

export interface RecallResult {
  query: string;
  memories: Memory[];
  total_found: number;
  context_tokens: number;
}

export interface ChatResult {
  response: string;
  memories_used: number;
}

export interface HealthResult {
  status: string;
  timestamp: string;
  model: string;
  graph: { nodes: number; edges: number; updates: number; extends: number; derives: number };
}

export interface ApiError {
  error: string;
  code: string;
  status: number;
}

export class EngramApiError extends Error {
  code: string;
  status: number;
  constructor(err: ApiError) {
    super(err.error);
    this.code = err.code;
    this.status = err.status;
  }
}

function sessionUserId(): string {
  if (typeof window === "undefined") return "default";
  return getUser()?.user_id ?? "default";
}

async function ensureToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (accessTokenNeedsRefresh()) await refreshAccessToken();
  return getToken();
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await ensureToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

async function request<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const headers = { ...(init.headers as Record<string, string> | undefined), ...(await authHeaders()) };
  const res = await fetch(`${API}${path}`, { ...init, headers });

  if (res.status === 401 && !retried && getRefreshToken()) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return request<T>(path, init, true);
  }

  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    if (payload && payload.error && payload.code) {
      throw new EngramApiError(payload as ApiError);
    }
    throw new EngramApiError({
      error: payload?.detail ?? `Request failed (${res.status})`,
      code: "UNKNOWN",
      status: res.status,
    });
  }
  return res.json();
}

export function friendlyError(e: unknown): string {
  if (e instanceof EngramApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "Something went wrong. Please try again.";
}

export const api = {
  health: () => request<HealthResult>("/health"),

  store: (content: string, tags: string[] = []) =>
    request<StoreResult>("/memory/store", { method: "POST", body: JSON.stringify({ content, tags }) }),

  recall: (query: string) =>
    request<RecallResult>("/memory/recall", { method: "POST", body: JSON.stringify({ query }) }),

  chat: (message: string, history: { role: string; content: string }[] = []) =>
    request<ChatResult>("/chat", { method: "POST", body: JSON.stringify({ message, history }) }),

  list: (limit = 50) =>
    request<Memory[]>(`/memory/list/${sessionUserId()}?limit=${limit}`),

  delete: (memoryId: string) =>
    request<{ memory_id: string; status: string }>(`/memory/${memoryId}`, { method: "DELETE" }),
};