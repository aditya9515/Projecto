export function SkeletonCard(): JSX.Element {
  return (
    <div className="overflow-hidden rounded-[0.3rem] border border-line bg-panel p-5">
      {" "}
      <div className="shimmer h-5 w-40 rounded-lg bg-shell" />{" "}
      <div className="mt-3 shimmer h-4 w-3/4 rounded-lg bg-shell" />{" "}
      <div className="mt-6 grid gap-3">
        {" "}
        <div className="shimmer h-11 rounded-xl bg-shell" />{" "}
        <div className="shimmer h-11 rounded-xl bg-shell" />{" "}
      </div>{" "}
    </div>
  );
}
