"use client";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <div className="card p-6 text-center">
        <div className="text-3xl mb-2">⚠️</div>
        <h1 className="text-lg font-bold mb-1">Something went wrong on this page</h1>
        <p className="text-sm text-gray-500 mb-4">
          An unexpected error occurred{error.digest ? ` (ref ${error.digest})` : ""}. Please try again.
        </p>
        <div className="flex justify-center gap-2">
          <button className="btn-primary" onClick={() => reset()}>
            Try again
          </button>
          <a className="btn-secondary" href="/watchlist">
            Go to Watchlist
          </a>
        </div>
      </div>
    </div>
  );
}
