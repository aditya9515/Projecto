import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "../../utils/cn";
type PremiumCardProps = { children: ReactNode; className?: string };
export function PremiumCard({
  children,
  className,
}: PremiumCardProps): JSX.Element {
  return (
    <motion.div
      className={cn(
        "app-card-surface rounded-[0.3rem] border border-line ",
        className,
      )}
      layout
      transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {" "}
      {children}{" "}
    </motion.div>
  );
}
