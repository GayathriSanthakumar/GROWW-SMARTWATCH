import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="text-center">
        <p className="text-6xl font-black text-brand/20 mb-2">404</p>
        <h1 className="text-lg font-bold mb-1">Page not found</h1>
        <p className="text-sm text-gray-500 mb-4">That page doesn't exist (yet).</p>
        <Link className="btn-primary inline-block" href="/watchlist">
          Go to Watchlist
        </Link>
      </div>
    </div>
  );
}
