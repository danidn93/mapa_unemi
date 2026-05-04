// Cliente para OSRM público (https://router.project-osrm.org).
// Devuelve la polilínea real siguiendo calles públicas de OpenStreetMap,
// y opcionalmente las indicaciones giro a giro con nombres de calles.
// Sin API key. Sin SLA — usar como mejora opcional, con fallback a línea recta.
import type { LatLng, AccessMode } from "@/types/map";

const BASE = "https://router.project-osrm.org";

const cache = new Map<string, OsrmRoute | null>();

export interface OsrmStep {
  instruction: string;
  distance: number; // metros del paso
  lat: number;
  lng: number;
  street?: string | null;
}

export interface OsrmRoute {
  coords: LatLng[];
  distance: number; // metros
  duration: number; // segundos
  steps: OsrmStep[];
}

function profileFor(mode: AccessMode): string {
  return mode === "vehicle" ? "driving" : "foot";
}

function key(o: LatLng, d: LatLng, mode: AccessMode) {
  const r = (n: number) => n.toFixed(5);
  return `${profileFor(mode)}|${r(o.lat)},${r(o.lng)}->${r(d.lat)},${r(d.lng)}`;
}

// Traduce un step de OSRM (en inglés) a una indicación en español
// usando el nombre de la calle si está disponible.
function translateManeuver(step: any): string {
  const m = step?.maneuver ?? {};
  const type: string = m.type ?? "";
  const modifier: string = m.modifier ?? "";
  const name: string = step?.name ?? "";
  const onStreet = name ? ` por ${name}` : "";

  const turnMap: Record<string, string> = {
    left: "Gira a la izquierda",
    right: "Gira a la derecha",
    "sharp left": "Gira cerrado a la izquierda",
    "sharp right": "Gira cerrado a la derecha",
    "slight left": "Mantente a la izquierda",
    "slight right": "Mantente a la derecha",
    straight: "Continúa recto",
    uturn: "Da media vuelta",
  };

  switch (type) {
    case "depart":
      return name ? `Sal hacia ${name}` : "Comienza tu recorrido";
    case "arrive":
      return "Llegas al final del tramo por calle";
    case "turn":
      return `${turnMap[modifier] ?? "Gira"}${onStreet}`;
    case "new name":
      return name ? `Continúa por ${name}` : "Continúa recto";
    case "continue":
      return `Continúa recto${onStreet}`;
    case "merge":
      return `Incorpórate${onStreet}`;
    case "on ramp":
      return `Toma la rampa${onStreet}`;
    case "off ramp":
      return `Toma la salida${onStreet}`;
    case "fork":
      return `${turnMap[modifier] ?? "En la bifurcación, continúa"}${onStreet}`;
    case "end of road":
      return `${turnMap[modifier] ?? "Al final de la calle, continúa"}${onStreet}`;
    case "roundabout":
    case "rotary":
      return `Toma la rotonda${onStreet}`;
    default:
      return name ? `Continúa por ${name}` : "Continúa";
  }
}

export async function fetchStreetRoute(
  origin: LatLng,
  destination: LatLng,
  mode: AccessMode,
  signal?: AbortSignal,
): Promise<OsrmRoute | null> {
  const k = key(origin, destination, mode);
  if (cache.has(k)) return cache.get(k) ?? null;

  const profile = profileFor(mode);
  const coords = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  const url = `${BASE}/route/v1/${profile}/${coords}?overview=full&geometries=geojson&steps=true`;

  try {
    const res = await fetch(url, { signal });
    if (!res.ok) {
      cache.set(k, null);
      return null;
    }
    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route) {
      cache.set(k, null);
      return null;
    }
    const line = route.geometry?.coordinates ?? [];
    const legs = route.legs ?? [];
    const steps: OsrmStep[] = [];
    for (const leg of legs) {
      for (const s of leg.steps ?? []) {
        const loc = s?.maneuver?.location;
        if (!loc) continue;
        const txt = translateManeuver(s);
        // Filtramos el "arrive" intermedio para no terminar la lista con "llegada"
        // (la indicación de entrada al campus la añade campusGate).
        if (s?.maneuver?.type === "arrive") continue;
        steps.push({
          instruction: txt,
          distance: s.distance ?? 0,
          lat: loc[1],
          lng: loc[0],
          street: s?.name ?? null,
        });
      }
    }
    const out: OsrmRoute = {
      coords: line.map(([lng, lat]: [number, number]) => ({ lat, lng })),
      distance: route.distance ?? 0,
      duration: route.duration ?? 0,
      steps,
    };
    cache.set(k, out);
    return out;
  } catch {
    return null;
  }
}
