// Calcula el tramo "calle pública" desde el origen externo hasta la entrada
// del campus elegida, usando OSRM. Devuelve null mientras carga o si falla.
import { useEffect, useState } from "react";
import type { LatLng, AccessMode } from "@/types/map";
import { fetchStreetRoute, type OsrmRoute } from "@/lib/osrm";

export function useStreetApproach(
  enabled: boolean,
  origin: LatLng | null,
  destination: LatLng | null,
  mode: AccessMode,
): OsrmRoute | null {
  const [route, setRoute] = useState<OsrmRoute | null>(null);

  useEffect(() => {
    if (!enabled || !origin || !destination) {
      setRoute(null);
      return;
    }
    const ctrl = new AbortController();
    fetchStreetRoute(origin, destination, mode, ctrl.signal)
      .then((r) => setRoute(r))
      .catch(() => setRoute(null));
    return () => ctrl.abort();
  }, [
    enabled,
    origin?.lat,
    origin?.lng,
    destination?.lat,
    destination?.lng,
    mode,
  ]);

  return route;
}
