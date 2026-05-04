import { useMemo, useState } from "react";
import { Search, MapPin, Building2, Landmark } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { LandmarkKind, MapBuilding, MapLandmark, MapRoom } from "@/types/map";
import { cn } from "@/lib/utils";

interface Props {
  rooms: MapRoom[];
  buildings: MapBuilding[];
  landmarks?: MapLandmark[];
  onSelectRoom: (r: MapRoom) => void;
  onSelectBuilding: (b: MapBuilding) => void;
  onSelectLandmark?: (l: MapLandmark) => void;
  className?: string;
}

const LANDMARK_LABEL: Record<LandmarkKind, string> = {
  reference: "Punto de referencia",
  plaza: "Plazoleta",
  corridor: "Corredor",
  restroom: "Baños",
  cafeteria: "Cafetería",
  bar: "Bar",
  atm: "Cajero",
  emergency: "Emergencia",
  entrance: "Entrada",
  exit: "Salida",
  gate: "Puerta",
  other: "Otro",
};

export function SearchPanel({ rooms, buildings, landmarks = [], onSelectRoom, onSelectBuilding, onSelectLandmark, className }: Props) {
  const [q, setQ] = useState("");

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return { rooms: [] as MapRoom[], buildings: [] as MapBuilding[], landmarks: [] as MapLandmark[] };
    const match = (s: string | null | undefined) => s?.toLowerCase().includes(term);
    return {
      rooms: rooms
        .filter((r) => match(r.name) || match(r.code) || match(r.description) || r.keywords?.some(match))
        .slice(0, 6),
      buildings: buildings
        .filter((b) => match(b.name) || match(b.code) || match(b.faculty))
        .slice(0, 4),
      landmarks: landmarks
        .filter((l) => match(l.name) || match(l.description) || match(LANDMARK_LABEL[l.kind]))
        .slice(0, 6),
    };
  }, [q, rooms, buildings, landmarks]);

  const hasResults = results.rooms.length + results.buildings.length + results.landmarks.length > 0;

  return (
    <div className={cn("rounded-2xl bg-card shadow-[var(--shadow-card)] border", className)}>
      <div className="relative p-3">
        <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar aula, edificio, baño, plazoleta…"
          className="pl-9 h-11 rounded-xl"
        />
      </div>
      {q && (
        <div className="max-h-80 overflow-auto pb-2">
          {!hasResults && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">Sin resultados</p>
          )}
          {results.rooms.map((r) => {
            const b = buildings.find((bb) => bb.id === r.building_id);
            return (
              <button
                key={r.id}
                onClick={() => onSelectRoom(r)}
                className="flex w-full items-start gap-3 px-4 py-2.5 hover:bg-accent transition text-left"
              >
                <span className="mt-0.5 grid h-8 w-8 place-items-center rounded-lg bg-primary/15 text-primary">
                  <MapPin className="h-4 w-4" />
                </span>
                <span className="flex-1">
                  <span className="block font-medium">{r.code ? `${r.code} · ` : ""}{r.name}</span>
                  <span className="block text-xs text-muted-foreground">{b?.name ?? "Edificio"}</span>
                </span>
              </button>
            );
          })}
          {results.buildings.map((b) => (
            <button
              key={b.id}
              onClick={() => onSelectBuilding(b)}
              className="flex w-full items-start gap-3 px-4 py-2.5 hover:bg-accent transition text-left"
            >
              <span className="mt-0.5 grid h-8 w-8 place-items-center rounded-lg bg-secondary/15 text-secondary">
                <Building2 className="h-4 w-4" />
              </span>
              <span className="flex-1">
                <span className="block font-medium">{b.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {b.faculty ?? "Edificio"} · {b.floors_count} pisos
                </span>
              </span>
            </button>
          ))}
          {results.landmarks.map((l) => (
            <button
              key={l.id}
              onClick={() => onSelectLandmark?.(l)}
              className="flex w-full items-start gap-3 px-4 py-2.5 hover:bg-accent transition text-left"
            >
              <span className="mt-0.5 grid h-8 w-8 place-items-center rounded-lg bg-accent text-accent-foreground">
                <Landmark className="h-4 w-4" />
              </span>
              <span className="flex-1">
                <span className="block font-medium">{l.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {LANDMARK_LABEL[l.kind]}{l.description ? ` · ${l.description}` : ""}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
