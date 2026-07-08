import type { CommandRisk } from "../../../main/types/shared";
import { StatusPill } from "../common/StatusPill";
export function CommandRiskBadge({
  risk,
  approved,
}: {
  risk: CommandRisk;
  approved?: boolean;
}): JSX.Element {
  const tone =
    risk === "dangerous" ? "danger" : risk === "medium" ? "warning" : "success";
  return (
    <StatusPill tone={approved === false ? "warning" : tone}>
      {" "}
      {approved === false ? `${risk} - review` : risk}{" "}
    </StatusPill>
  );
}
