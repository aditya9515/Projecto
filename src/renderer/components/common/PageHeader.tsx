import type { ReactNode } from "react";
export function PageHeader({
  eyebrow = "Projecto",
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      {" "}
      <div>
        {" "}
        <div className="text-[11px] uppercase tracking-[0.18em] text-muted">
          {eyebrow}
        </div>{" "}
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-text">
          {title}
        </h2>{" "}
        {description ? (
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            {description}
          </p>
        ) : null}{" "}
      </div>{" "}
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}{" "}
    </div>
  );
}
