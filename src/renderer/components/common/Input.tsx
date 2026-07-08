import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "../../utils/cn";
export function Input(
  props: InputHTMLAttributes<HTMLInputElement>,
): JSX.Element {
  return (
    <input
      {...props}
      className={cn(
        "h-11 w-full rounded-xl border border-line bg-panel px-3.5 text-sm text-text outline-none transition duration-150 ease-premium placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent",
        props.className,
      )}
    />
  );
}
export function Textarea(
  props: TextareaHTMLAttributes<HTMLTextAreaElement>,
): JSX.Element {
  return (
    <textarea
      {...props}
      className={cn(
        "min-h-[120px] w-full rounded-xl border border-line bg-panel px-3.5 py-3 text-sm text-text outline-none transition duration-150 ease-premium placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent",
        props.className,
      )}
    />
  );
}
