import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Footprints, Car, X, Play, Navigation2 } from "lucide-react";
import { TigrilloGuide } from "./TigrilloGuide";
import type { AccessMode, ArrivalGuide, RouteResult } from "@/types/map";
import { formatDistance, formatDuration } from "@/lib/geo";

interface Props {
  destinationName: string;
  destinationCode?: string | null;
  route: RouteResult | null;
  arrival: ArrivalGuide | null;
  mode: AccessMode;
  onChangeMode: (m: AccessMode) => void;
  onStart: () => void;
  onClose: () => void;
}

/**
 * Vista previa al estilo Google Maps: muestra la ruta completa con tiempo
 * estimado de llegada y la lista de pasos, antes de iniciar el recorrido.
 */
export function RoutePreview({
  destinationName, destinationCode, route, arrival, mode, onChangeMode, onStart, onClose,
}: Props) {
  const eta = route ? new Date(Date.now() + route.duration * 1000) : null;
  const etaStr = eta
    ? eta.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "—";

  return (
    <Card className="overflow-hidden border-0 shadow-[var(--shadow-elegant)] bg-card pointer-events-auto">
      <div className="bg-[var(--gradient-hero)] p-4 text-white">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <TigrilloGuide size={56} />
            <div className="min-w-0">
              <p className="text-xs opacity-80">Ruta hacia</p>
              <h3 className="text-lg font-bold leading-tight truncate">
                {destinationCode ? `${destinationCode} · ` : ""}{destinationName}
              </h3>
            </div>
          </div>
          <Button
            size="icon" variant="ghost"
            className="h-8 w-8 text-white hover:bg-white/15 flex-none"
            onClick={onClose} title="Cancelar"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {route && (
          <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
            <div>
              <p className="text-[10px] uppercase opacity-70">Distancia</p>
              <p className="font-bold">{formatDistance(route.distance)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase opacity-70">Tiempo</p>
              <p className="font-bold">{formatDuration(route.duration)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase opacity-70">Llegada</p>
              <p className="font-bold">{etaStr}</p>
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2 p-3 border-b">
        <Button
          variant={mode === "pedestrian" ? "default" : "outline"}
          size="sm" className="flex-1" onClick={() => onChangeMode("pedestrian")}
        >
          <Footprints className="h-4 w-4 mr-2" /> Caminar
        </Button>
        <Button
          variant={mode === "vehicle" ? "default" : "outline"}
          size="sm" className="flex-1" onClick={() => onChangeMode("vehicle")}
        >
          <Car className="h-4 w-4 mr-2" /> Vehículo
        </Button>
      </div>

      <div className="p-4 max-h-52 overflow-auto">
        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
          Indicaciones
        </p>
        <ol className="space-y-2">
          {route?.steps.map((s, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-primary/15 text-primary text-xs font-bold">
                {i + 1}
              </span>
              <div className="flex-1">
                <p>{s.instruction}</p>
                {s.distance > 0 && (
                  <p className="text-[11px] text-muted-foreground">{formatDistance(s.distance)}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
        {arrival?.indoorInstruction && (
          <div className="mt-3 rounded-lg bg-muted/60 p-3 text-sm">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
              Al llegar al edificio
            </p>
            {arrival.floor && (
              <p className="text-xs mb-1">
                📍 {arrival.floor.name ?? `Piso ${arrival.floor.level}`}
              </p>
            )}
            <p className="leading-relaxed">{arrival.indoorInstruction}</p>
          </div>
        )}
      </div>

      <div className="p-3 border-t flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onClose}>
          Cancelar
        </Button>
        <Button className="flex-[2]" onClick={onStart}>
          <Play className="h-4 w-4 mr-2 fill-current" /> Iniciar recorrido
        </Button>
      </div>
    </Card>
  );
}

interface RecenterProps {
  onClick: () => void;
  rotated?: boolean;
}
export function RecenterFab({ onClick, rotated }: RecenterProps) {
  return (
    <button
      onClick={onClick}
      title="Centrar mi ubicación"
      className="pointer-events-auto h-12 w-12 rounded-full bg-card shadow-[var(--shadow-elegant)] border grid place-items-center hover:bg-accent transition-colors"
    >
      <Navigation2
        className={`h-5 w-5 text-primary ${rotated ? "rotate-0" : ""}`}
        style={{ transform: rotated ? undefined : "rotate(0deg)" }}
      />
    </button>
  );
}
