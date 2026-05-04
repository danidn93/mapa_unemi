import { Button } from "@/components/ui/button";
import { X, ChevronUp, ChevronDown, Volume2, VolumeX, Footprints, Car } from "lucide-react";
import { formatDistance, formatDuration } from "@/lib/geo";
import { useState } from "react";
import { TigrilloGuide } from "./TigrilloGuide";
import type { AccessMode } from "@/types/map";
import { cn } from "@/lib/utils";

interface Step { instruction: string; lat: number; lng: number; }
interface Props {
  step: Step | null;
  stepIndex: number;
  totalSteps: number;
  distanceToStep: number | null;
  remainingDistance: number;
  remainingDuration: number;
  destinationName: string;
  arrived: boolean;
  arrivalText?: string | null;
  voice: boolean;
  onToggleVoice: () => void;
  onClose: () => void;
  mode: AccessMode;
  onChangeMode: (m: AccessMode) => void;
}

export function StepFloating({
  step, stepIndex, totalSteps, distanceToStep, remainingDistance, remainingDuration,
  destinationName, arrived, arrivalText, voice, onToggleVoice, onClose,
  mode, onChangeMode,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="pointer-events-auto rounded-2xl bg-card/95 backdrop-blur shadow-[var(--shadow-elegant)] border overflow-hidden">
      <div className="flex items-center gap-2 p-3">
        <TigrilloGuide walking={!arrived} size={48} className="flex-none" />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">
            {arrived ? "Has llegado" : `Paso ${stepIndex + 1} de ${totalSteps} · ${destinationName}`}
          </p>
          <p className="text-sm font-semibold leading-tight line-clamp-2">
            {arrived ? (arrivalText ?? "Destino alcanzado") : (step?.instruction ?? "Continúa")}
          </p>
          {!arrived && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {distanceToStep != null && <>En {formatDistance(distanceToStep)} · </>}
              Faltan {formatDistance(remainingDistance)} · {formatDuration(remainingDuration)} · llegada{" "}
              {new Date(Date.now() + remainingDuration * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
        </div>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onToggleVoice}
          title={voice ? "Silenciar" : "Activar voz"}>
          {voice ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        </Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "Expandir" : "Contraer"}>
          {collapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onClose} title="Cancelar ruta">
          <X className="h-4 w-4" />
        </Button>
      </div>
      {!collapsed && (
        <div className="flex gap-2 px-3 pb-3 -mt-1">
          <Button
            size="sm"
            variant={mode === "pedestrian" ? "default" : "outline"}
            className="flex-1 h-8"
            onClick={() => onChangeMode("pedestrian")}
          >
            <Footprints className="h-4 w-4 mr-1.5" /> Caminar
          </Button>
          <Button
            size="sm"
            variant={mode === "vehicle" ? "default" : "outline"}
            className="flex-1 h-8"
            onClick={() => onChangeMode("vehicle")}
          >
            <Car className="h-4 w-4 mr-1.5" /> Vehículo
          </Button>
        </div>
      )}
      {!collapsed && !arrived && totalSteps > 1 && (
        <div className="h-1.5 bg-muted">
          <div className={cn("h-full bg-primary transition-all")}
            style={{ width: `${Math.min(100, ((stepIndex + 1) / totalSteps) * 100)}%` }} />
        </div>
      )}
    </div>
  );
}
