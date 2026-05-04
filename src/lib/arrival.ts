// Cuando el destino es un AULA: ruta exterior hasta la entrada principal del edificio
// + instrucciones internas (no GPS dentro del edificio).
import type {
  ArrivalGuide, LatLng, MapBuilding, MapEntrance, MapFloor, MapPath, MapRoom, AccessMode,
} from "@/types/map";
import { computeRoute } from "./routing";
import { haversine } from "./geo";

/**
 * Elige la mejor entrada de un edificio para una ruta:
 * 1) Si existe una entrada PRINCIPAL activa, se usa siempre (aunque no sea la más cercana).
 *    Si hay varias principales, la más cercana al origen.
 * 2) Si no hay principal, la entrada activa compatible con el modo más cercana.
 * 3) Si no hay compatibles, la entrada activa más cercana (cualquier modo).
 */
export function pickBestEntrance(args: {
  origin: LatLng;
  building: MapBuilding;
  entrances: MapEntrance[];
  mode: AccessMode;
}): MapEntrance | null {
  const { origin, building, entrances, mode } = args;
  const ofBuilding = entrances.filter(
    (e) => e.building_id === building.id && e.status !== "closed",
  );
  if (ofBuilding.length === 0) return null;

  const mains = ofBuilding.filter((e) => e.is_main);
  if (mains.length > 0) {
    return mains.sort((a, b) => haversine(origin, a) - haversine(origin, b))[0];
  }

  const compat = ofBuilding.filter(
    (e) => e.access_modes?.includes(mode) || mode === "pedestrian",
  );
  const pool = compat.length > 0 ? compat : ofBuilding;
  return pool.sort((a, b) => haversine(origin, a) - haversine(origin, b))[0];
}

function isPointInsideBuilding(point: LatLng, building: MapBuilding): boolean {
  const ring = building.geom?.coordinates?.[0] ?? [];
  if (ring.length < 3) return false;
  const x = point.lng;
  const y = point.lat;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersects = ((yi > y) !== (yj > y)) &&
      (x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

export function resolveOriginFromBuildingExit(args: {
  origin: LatLng;
  buildings: MapBuilding[];
  entrances: MapEntrance[];
  mode: AccessMode;
}): { origin: LatLng; building: MapBuilding | null; entrance: MapEntrance | null } {
  const { origin, buildings, entrances, mode } = args;
  const building = buildings.find((b) => isPointInsideBuilding(origin, b)) ?? null;
  if (!building) return { origin, building: null, entrance: null };

  const entrance = pickBestEntrance({ origin, building, entrances, mode });
  if (!entrance) return { origin, building, entrance: null };
  return {
    origin: { lat: entrance.lat, lng: entrance.lng },
    building,
    entrance,
  };
}


export function routeToRoomDestination(args: {
  origin: LatLng;
  room: MapRoom;
  building: MapBuilding;
  floors: MapFloor[];
  entrances: MapEntrance[];
  paths: MapPath[];
  mode: AccessMode;
  buildings?: MapBuilding[];
}): ArrivalGuide {
  const { origin, room, building, floors, entrances, paths, mode, buildings } = args;

  const best = pickBestEntrance({ origin, building, entrances, mode });
  const entry: LatLng = best
    ? { lat: best.lat, lng: best.lng }
    : { lat: building.centroid_lat, lng: building.centroid_lng };

  // Para line-of-sight, excluir el propio edificio destino (la entrada está en su borde).
  const obstacles = (buildings ?? []).filter((b) => b.id !== building.id);
  const exteriorRoute = computeRoute(paths, origin, entry, mode, obstacles);

  const floor = floors.find((f) => f.id === room.floor_id) ?? null;
  const floorLabel = floor
    ? floor.name ?? `piso ${floor.level}`
    : "la planta indicada";

  const arrivalInstruction = `Has llegado al edificio ${building.name}. Tu destino está en ${floorLabel}.`;
  const indoorInstruction = room.directions ?? null;

  return {
    exteriorRoute,
    building,
    floor,
    room,
    arrivalInstruction,
    indoorInstruction,
  };
}
