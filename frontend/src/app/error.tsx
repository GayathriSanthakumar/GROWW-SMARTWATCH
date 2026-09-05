"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen grid place-items-center p-6 bg-[#f6f7fb]">
      <div className="card max-w-md w-full p-6 text-center">
        <div className="text-3xl mb-2">⚠️</div>
        <h1 className="text-lg font-bold mb-1">Something went wrong</h1>
        <p className="text-sm text-gray-500 mb-4">
          An unexpected error occurred{error.digest ? ` (ref ${error.digest})` : ""}. Please try again.
        </p>
        <div className="flex justify-center gap-2">
          <button className="btn-primary" onClick={() => reset()}>
            Try again
          </button>
          <a className="btn-secondary" href="/">
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}
