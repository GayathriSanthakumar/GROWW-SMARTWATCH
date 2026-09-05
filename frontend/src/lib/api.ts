const isLoopbackUrl = (u: string) => /localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]/.test(u);

function resolveBase(): string {
  const explicit = (process.env.NEXT_PUBLIC_API_URL || "").trim();
  const host = typeof window !== "undefined" ? window.location.hostname : "";
  const pageIsLocal = host === "" || host === "localhost" || host === "127.0.0.1";
  if (explicit) {
    // A build/dev .env may pin http://localhost:4000. That is only correct when
    // the page itself is served from localhost — a remote visitor must NEVER be
    // pointed at their own machine (Chrome blocks it and it 404s for everyone
    // else). Prefer same-origin through the reverse proxy in that case.
    if (!pageIsLocal && isLoopbackUrl(explicit)) return window.location.origin;
    return explicit; // public URL (deploy) or relative ""/"/api" config
  }
  return pageIsLocal ? "http://localhost:4000" : window.location.origin;
}

const API_BASE = resolveBase();

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/auth/login") && !path.startsWith("/api/auth/signup")) {
    window.dispatchEvent(new CustomEvent("smartwatch:unauthorized"));
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data.error || "ERROR", data.message || "Request failed");
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body: JSON.stringify(body ?? {}) }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body: JSON.stringify(body ?? {}) }),
  del: <T>(path: string, body?: unknown) => request<T>(path, { method: "DELETE", body: JSON.stringify(body ?? {}) }),
};

export { API_BASE };
