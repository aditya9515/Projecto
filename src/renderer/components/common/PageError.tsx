import type { ReactNode } from "react";
import { Button } from "./Button";
export function PageError({
  title = "Something needs attention",
  description,
  actionLabel = "Try Again",
  onAction,
  secondaryAction,
}: {
  title?: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryAction?: ReactNode;
}): JSX.Element {
  return (
    <div className="rounded-[28px] border border-line bg-panel p-8">
      {" "}
      <div className="max-w-2xl">
        {" "}
        <div className="text-[11px] uppercase tracking-[0.18em] text-muted">
          Projecto
        </div>{" "}
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-text">
          {title}
        </h2>{" "}
        <p className="mt-3 text-sm leading-6 text-muted">{description}</p>{" "}
        <div className="mt-6 flex flex-wrap gap-3">
          {" "}
          {onAction ? (
            <Button onClick={onAction} variant="primary">
              {" "}
              {actionLabel}{" "}
            </Button>
          ) : null}{" "}
          {secondaryAction}{" "}
        </div>{" "}
      </div>{" "}
    </div>
  );
}
