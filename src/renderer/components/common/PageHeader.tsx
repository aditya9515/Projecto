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
        <div className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-accent">
          {eyebrow}
        </div>{" "}
        <h2 className="app-page-title mt-2 text-text">
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
