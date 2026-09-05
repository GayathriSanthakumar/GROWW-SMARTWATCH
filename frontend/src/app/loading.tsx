export default function Loading() {
  return (
    <div className="grid place-items-center py-16 text-sm text-gray-400" role="status" aria-live="polite">
      <div className="flex items-center gap-2">
        <span className="inline-block h-4 w-4 rounded-full border-2 border-surface-border border-t-brand animate-spin" />
        Loading…
      </div>
    </div>
  );
}
