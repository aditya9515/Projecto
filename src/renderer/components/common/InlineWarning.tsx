import type { ReactNode } from "react";
export function InlineWarning({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="rounded-[22px] border border-warning bg-warning px-4 py-3">
      {" "}
      <div className="text-sm font-semibold text-text">{title}</div>{" "}
      <div className="mt-1 text-sm leading-6 text-muted">{children}</div>{" "}
    </div>
  );
}
