import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Footprints, Car, X, Volume2, VolumeX } from "lucide-react";
import { TigrilloGuide } from "./TigrilloGuide";
import type { AccessMode, ArrivalGuide, MapRoom, RouteResult } from "@/types/map";
import { formatDistance, formatDuration } from "@/lib/geo";

interface Props {
  destination: MapRoom | null;
  route: RouteResult | null;
  arrival: ArrivalGuide | null;
  mode: AccessMode;
  onChangeMode: (m: AccessMode) => void;
  onClose: () => void;
  arrived: boolean;
  voice: boolean;
  onToggleVoice: () => void;
}

export function NavigationPanel({
  destination, route, arrival, mode, onChangeMode, onClose, arrived, voice, onToggleVoice,
}: Props) {
  if (!destination) return null;

  return (
    <Card className="overflow-hidden border-0 shadow-[var(--shadow-elegant)] bg-card">
      <div className="bg-[var(--gradient-hero)] p-4 text-white">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <TigrilloGuide walking={!arrived} size={64} />
            <div>
              <p className="text-xs opacity-80">Destino</p>
              <h3 className="text-lg font-bold leading-tight">
                {destination.code ? `${destination.code} · ` : ""}{destination.name}
              </h3>
            </div>
          </div>
          <div className="flex gap-1">
            <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/15"
              onClick={onToggleVoice} title={voice ? "Silenciar voz" : "Activar voz"}>
              {voice ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/15" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {route && (
          <div className="mt-3 flex items-center gap-4 text-sm">
            <span className="font-semibold">{formatDistance(route.distance)}</span>
            <span className="opacity-80">·</span>
            <span>{formatDuration(route.duration)}</span>
          </div>
        )}
      </div>

      <div className="flex gap-2 p-3 border-b">
        <Button variant={mode === "pedestrian" ? "default" : "outline"}
          size="sm" className="flex-1" onClick={() => onChangeMode("pedestrian")}>
          <Footprints className="h-4 w-4 mr-2" /> Caminar
        </Button>
        <Button variant={mode === "vehicle" ? "default" : "outline"}
          size="sm" className="flex-1" onClick={() => onChangeMode("vehicle")}>
          <Car className="h-4 w-4 mr-2" /> Vehículo
        </Button>
      </div>

      {arrived && arrival ? (
        <div className="p-4 space-y-3">
          <div className="rounded-xl bg-success/10 p-3 border border-success/30">
            <p className="font-semibold text-success-foreground" style={{ color: "hsl(var(--success))" }}>
              🎯 {arrival.arrivalInstruction}
            </p>
          </div>
          {arrival.indoorInstruction && (
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Instrucciones internas</p>
              <p className="text-sm leading-relaxed">{arrival.indoorInstruction}</p>
            </div>
          )}
          {arrival.floor && (
            <p className="text-sm">📍 {arrival.floor.name ?? `Piso ${arrival.floor.level}`}</p>
          )}
          {arrival.room?.image_url && (
            <img src={arrival.room.image_url} alt="" className="rounded-lg w-full object-cover max-h-40" />
          )}
        </div>
      ) : (
        <div className="p-4 max-h-60 overflow-auto">
          <ol className="space-y-2">
            {route?.steps.map((s, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-primary/15 text-primary text-xs font-bold">
                  {i + 1}
                </span>
                <span>{s.instruction}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </Card>
  );
}
