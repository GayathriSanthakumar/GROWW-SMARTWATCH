"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/store/auth";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, initialized, fetchMe } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!initialized) fetchMe();
    else if (!user) router.replace("/");
  }, [initialized, user, router, fetchMe]);

  useEffect(() => {
    const handler = () => router.replace("/");
    window.addEventListener("smartwatch:unauthorized", handler);
    return () => window.removeEventListener("smartwatch:unauthorized", handler);
  }, [router]);

  if (!initialized) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="text-gray-400">Loading…</div>
      </div>
    );
  }
  if (!user) return null;

  return <>{children}</>;
}
