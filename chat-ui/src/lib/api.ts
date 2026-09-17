const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

import {
  getUser,
  getToken,
  getRefreshToken,
  accessTokenNeedsRefresh,
  refreshAccessToken,
} from "@/lib/auth";

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
  memoryId?: string;
  constructor(err: ApiError) {
    super(err.error);
    this.name = "EngramApiError";
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
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
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
    const payload = (await res.json().catch(() => null)) as ApiError | null;
    if (payload && payload.error && payload.code) {
      throw new EngramApiError(payload);
    }
    throw new EngramApiError({
      error: payload?.error ?? `Request failed (${res.status})`,
      code: "UNKNOWN",
      status: res.status,
    });
  }
  return res.json() as Promise<T>;
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

  streamChat: async (
    message: string,
    history: { role: string; content: string }[] = [],
    onToken: (token: string) => void,
    signal?: AbortSignal,
  ): Promise<string> => {
    const res = await fetch(`${API}/chat/stream`, {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({ message, history }),
      signal,
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as ApiError | null;
      throw new EngramApiError(
        payload && payload.error && payload.code
          ? payload
          : { error: payload?.error ?? `Request failed (${res.status})`, code: "STREAM_UNSUPPORTED", status: res.status },
      );
    }
    if (!res.body) return "";

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const line = frame.split("\n").find((l) => l.startsWith("data:"));
        if (!line) continue;
        const raw = line.slice(5).trim();
        let parsed: { event?: string; text?: string };
        try {
          parsed = JSON.parse(raw);
        } catch {
          continue;
        }
        const ev = parsed.event;
        if (ev === "token" && parsed.text) {
          full += parsed.text;
          onToken(parsed.text);
        } else if (ev === "done" && parsed.text) {
          full = parsed.text;
        }
      }
    }
    return full;
  },

  list: (limit = 50) => request<Memory[]>(`/memory/list?limit=${limit}`),

  delete: (memoryId: string) =>
    request<{ memory_id: string; status: string }>(`/memory/${memoryId}`, { method: "DELETE" }),
};
