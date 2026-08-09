import type { ReactNode } from "react";
import { Button } from "./Button";
import { RollingTitle } from "../motion/RollingTitle";
type EmptyStateProps = {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: ReactNode;
};
export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  icon,
}: EmptyStateProps): JSX.Element {
  return (
    <div className="rounded-[0.3rem] border border-line bg-panel p-10">
      {" "}
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4 text-center">
        {" "}
        <div className="flex h-14 w-14 items-center justify-center rounded-[0.3rem] bg-shell text-text">
          {" "}
          {icon}{" "}
        </div>{" "}
        <div className="space-y-2">
          {" "}
          <RollingTitle
            className="app-section-title text-3xl text-text"
            text={title}
          />{" "}
          <p className="text-sm leading-6 text-muted">{description}</p>{" "}
        </div>{" "}
        {actionLabel && onAction ? (
          <Button className="mt-2" onClick={onAction} variant="primary">
            {" "}
            {actionLabel}{" "}
          </Button>
        ) : null}{" "}
      </div>{" "}
    </div>
  );
}
