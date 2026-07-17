import appIconUrl from "../../../../assets/icon.ico";

type AppIconProps = {
  className?: string;
};

export function AppIcon({
  className = "h-4 w-4",
}: AppIconProps): JSX.Element {
  return <img alt="" className={`object-contain ${className}`} src={appIconUrl} />;
}
