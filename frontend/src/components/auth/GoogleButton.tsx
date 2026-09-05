"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";

type CredentialResponse = { credential: string };

export function GoogleButton({ onDone }: { onDone: (isNewUser: boolean) => void }) {
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const btnRef = useRef<HTMLDivElement>(null);
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const setUser = useAuth((s) => s.setUser);

  useEffect(() => {
    if (!clientId) return;
    let disposed = false;

    const handleCredential = async (res: CredentialResponse) => {
      setLoading(true);
      try {
        const data = await api.post<{ user: { id: string; email: string; fullName: string; authProvider: string; isDemo: boolean; knowledgeLevel: string }; isNew: boolean }>("/api/auth/google", { idToken: res.credential });
        setUser(data.user);
        onDone(data.isNew);
      } catch (e) {
        setNotice(e instanceof Error ? e.message : "Google sign-in failed");
      } finally {
        setLoading(false);
      }
    };

    const init = () => {
      if (disposed || !window.google) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleCredential,
      });
      if (btnRef.current) {
        window.google.accounts.id.renderButton(btnRef.current, {
          theme: "outline",
          size: "large",
          width: 360,
          text: "continue_with",
        });
      }
    };

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = init;
    document.head.appendChild(script);

    return () => {
      disposed = true;
      document.head.removeChild(script);
    };
  }, [clientId, onDone, setUser]);

  if (!clientId) {
    return (
      <div>
        <button
          type="button"
          disabled={loading}
          onClick={() => setNotice("Google sign-in is optional for this demo. Use email login or Demo Mode instead.")}
          className="w-full flex items-center justify-center gap-3 rounded-lg border border-surface-border bg-surface-muted/40 px-4 py-2.5 font-medium text-gray-400 cursor-not-allowed disabled:opacity-50"
        >
          <GoogleG />
          Continue with Google
        </button>
        {notice ? (
          <p className="mt-2 text-xs text-gray-400">{notice}</p>
        ) : (
          <p className="mt-2 text-center text-[11px] text-gray-400">Optional — email &amp; Demo Mode work without it.</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <div ref={btnRef} className="w-full [&>div]:w-full" />
      {loading && <p className="mt-2 text-xs text-gray-400">Signing in…</p>}
      {notice && <p className="mt-2 text-xs text-down">{notice}</p>}
    </div>
  );
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (opts: { client_id: string; callback: (r: CredentialResponse) => void }) => void;
          renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
        };
      };
    };
  }
}
