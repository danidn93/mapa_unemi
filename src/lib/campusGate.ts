// Detección de "fuera del campus" y selección de la mejor ENTRADA al campus
// (filtrando salidas y respetando el modo de movilidad).
import type { LatLng, MapBuilding, MapCampusEntrance, MapPath, AccessMode, RouteResult } from "@/types/map";
import { haversine, UNEMI_CENTER } from "./geo";
import { computeRoute } from "./routing";

// Radio aproximado del campus UNEMI (en metros). Si el usuario está más lejos
// que esto del centro Y de cualquier edificio, lo consideramos fuera.
const CAMPUS_RADIUS_M = 350;
const NEAR_BUILDING_M = 60;

/** ¿El punto está fuera del campus? */
export function isOutsideCampus(p: LatLng, buildings: MapBuilding[]): boolean {
  if (haversine(p, UNEMI_CENTER) <= CAMPUS_RADIUS_M) return false;
  // Cerca de un edificio del campus → lo tratamos como dentro.
  for (const b of buildings) {
    if (haversine(p, { lat: b.centroid_lat, lng: b.centroid_lng }) <= NEAR_BUILDING_M) {
      return false;
    }
  }
  return true;
}

/** ¿Esta entrada del campus admite el modo dado? */
function entranceSupports(e: MapCampusEntrance, mode: AccessMode): boolean {
  if (e.entry_type === "mixed") return true;
  if (mode === "vehicle") return e.entry_type === "vehicle";
  return e.entry_type === "pedestrian";
}

/**
 * Elige la mejor ENTRADA al campus para alguien que viene desde `origin`.
 * - Filtra accesos marcados como "salida solamente" (direction === 'exit').
 * - Filtra por compatibilidad con el modo (peatonal / vehicular).
 * - Devuelve la más cercana al origen.
 */
export function pickBestCampusEntry(args: {
  origin: LatLng;
  campusEntrances: MapCampusEntrance[];
  mode: AccessMode;
}): MapCampusEntrance | null {
  const { origin, campusEntrances, mode } = args;
  const usable = campusEntrances.filter(
    (e) =>
      e.is_active !== false &&
      (e as any).status !== "closed" &&
      (e as any).status !== "temporary_closed" &&
      e.direction !== "exit" &&
      entranceSupports(e, mode),
  );
  if (usable.length === 0) return null;
  return usable.sort((a, b) => haversine(origin, a) - haversine(origin, b))[0];
}

/**
 * Calcula una ruta desde `origin` (fuera del campus) hasta `destination`
 * pasando OBLIGATORIAMENTE por la entrada al campus más cercana y compatible
 * con el modo. La primera mitad (calle pública → entrada) se dibuja como
 * un trazo recto orientativo, ya que normalmente no tenemos calles externas
 * mapeadas. La segunda mitad usa el grafo interno del campus.
 */
export function routeViaCampusEntry(args: {
  origin: LatLng;
  destination: LatLng;
  campusEntrances: MapCampusEntrance[];
  paths: MapPath[];
  mode: AccessMode;
  obstacles?: MapBuilding[];
  /**
   * Tramo externo precalculado por OSRM (calles públicas). Si se provee,
   * reemplaza la línea recta orientativa entre el origen y la entrada del campus.
   */
  streetApproach?: { coords: LatLng[]; distance: number; duration: number; steps?: { instruction: string; distance: number; lat: number; lng: number }[] } | null;
}): { route: RouteResult; entry: MapCampusEntrance } | null {
  const { origin, destination, campusEntrances, paths, mode, obstacles, streetApproach } = args;
  const entry = pickBestCampusEntry({ origin, campusEntrances, mode });
  if (!entry) return null;

  const entryPoint: LatLng = { lat: entry.lat, lng: entry.lng };
  const inner = computeRoute(paths, entryPoint, destination, mode, obstacles ?? []);

  const speed = mode === "vehicle" ? 8 : 1.4;

  // Tramo externo: si tenemos OSRM, usamos la polilínea por calles. Si no,
  // caemos a una línea recta orientativa.
  const useStreets = !!(streetApproach && streetApproach.coords.length > 1);
  const approachCoords: LatLng[] = useStreets
    ? streetApproach!.coords
    : [origin, entryPoint];
  const approachDist = useStreets ? streetApproach!.distance : haversine(origin, entryPoint);
  const approachDur = useStreets ? streetApproach!.duration : approachDist / speed;

  // Concatenamos: calles externas → entrada → grafo interno (sin duplicar la entrada).
  const coords: LatLng[] = [...approachCoords, ...inner.coords.slice(1)];

  // Pasos externos: si OSRM nos dio indicaciones giro a giro, las usamos.
  // Si no, una sola instrucción genérica orientativa.
  const externalSteps: RouteResult["steps"] =
    useStreets && streetApproach!.steps && streetApproach!.steps.length > 0
      ? streetApproach!.steps!.map((s) => ({
          instruction: s.instruction,
          distance: s.distance,
          lat: s.lat,
          lng: s.lng,
        }))
      : [
          {
            instruction: useStreets
              ? `Sigue las calles hasta la entrada "${entry.name}" del campus`
              : `Dirígete a la entrada "${entry.name}" del campus`,
            distance: approachDist,
            lat: entryPoint.lat,
            lng: entryPoint.lng,
          },
        ];

  const steps: RouteResult["steps"] = [
    ...externalSteps,
    {
      instruction: `Llega a la entrada "${entry.name}" del campus y accede`,
      distance: 0,
      lat: entryPoint.lat,
      lng: entryPoint.lng,
    },
    ...inner.steps,
  ];

  return {
    entry,
    route: {
      distance: approachDist + inner.distance,
      duration: approachDur + inner.duration,
      coords,
      steps,
    },
  };
}
