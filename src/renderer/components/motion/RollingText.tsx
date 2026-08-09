import type { ReactNode } from "react";
import { cn } from "../../utils/cn";

export function RollingText({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <span className={cn("projecto-roll-mask", className)}>
      <span className="projecto-roll-track">
        <span className="projecto-roll-copy">{children}</span>
        <span aria-hidden="true" className="projecto-roll-copy">
          {children}
        </span>
      </span>
    </span>
  );
}
