export default function Loading() {
  return (
    <div
      className="grid min-h-svh place-items-center"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center">
        <span
          aria-hidden="true"
          className="size-8 animate-spin rounded-full border-t-2 border-b-2 border-blue-500 motion-reduce:animate-none"
        />
        <p className="ml-4 text-lg font-semibold">Loading Dashboard…</p>
      </div>
    </div>
  );
}
