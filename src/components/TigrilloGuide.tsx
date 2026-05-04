import tigrillo from "@/assets/tigrillo.png";
import { cn } from "@/lib/utils";

interface Props {
  walking?: boolean;
  size?: number;
  className?: string;
}
export function TigrilloGuide({ walking = false, size = 96, className }: Props) {
  return (
    <div className={cn("relative inline-block", className)} style={{ width: size, height: size }}>
      <div className={cn("absolute inset-0 rounded-full bg-primary/10 pulse-ring")} />
      <img
        src={tigrillo}
        alt="Tigrillo guía UNEMI"
        className={cn(
          "relative h-full w-full object-contain drop-shadow-xl",
          walking ? "tigrillo-walking" : "tigrillo-idle",
        )}
        draggable={false}
      />
    </div>
  );
}
