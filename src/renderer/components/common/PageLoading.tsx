export function PageLoading({
  label = "Loading Projecto workspace...",
}: {
  label?: string;
}): JSX.Element {
  return (
    <div className="space-y-4">
      {" "}
      <div className="h-8 w-56 animate-pulse rounded-2xl bg-shell" />{" "}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {" "}
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            className="rounded-[24px] border border-line bg-panel p-5"
            key={index}
          >
            {" "}
            <div className="h-3 w-24 animate-pulse rounded-full bg-shell" />{" "}
            <div className="mt-4 h-6 w-36 animate-pulse rounded-full bg-accent" />{" "}
            <div className="mt-3 h-3 w-full animate-pulse rounded-full bg-shell" />{" "}
          </div>
        ))}{" "}
      </div>{" "}
      <div className="text-sm text-muted">{label}</div>{" "}
    </div>
  );
}
