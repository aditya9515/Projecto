import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../utils/cn";
import { RollingText } from "../motion/RollingText";
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  variant?: ButtonVariant;
  leadingIcon?: ReactNode;
  children?: ReactNode;
  roll?: boolean;
};
const variantClasses: Record<ButtonVariant, string> = {
  primary: "app-button-primary focus-visible:ring-accent",
  secondary: "app-button-secondary focus-visible:ring-accent",
  ghost: "app-button-ghost focus-visible:ring-accent",
  danger: "app-button-danger focus-visible:ring-accent",
};
export function Button({
  className,
  variant = "secondary",
  leadingIcon,
  children,
  roll = true,
  type = "button",
  ...props
}: ButtonProps): JSX.Element {
  const content = (
    <>
      {leadingIcon}
      {children}
    </>
  );
  return (
    <button
      className={cn(
        "app-action-button inline-flex min-h-10 items-center justify-center gap-2 rounded-[2px] px-4 py-2 text-[0.68rem] font-bold uppercase tracking-[0.09em] transition-all duration-150 ease-premium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:pointer-events-none disabled:cursor-not-allowed disabled:border-line disabled:bg-shell disabled:text-muted",
        variantClasses[variant],
        className,
      )}
      type={type}
      {...props}
    >
      {roll ? <RollingText>{content}</RollingText> : content}
    </button>
  );
}
