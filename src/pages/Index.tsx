import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { GoogleCampusMap } from "@/components/GoogleCampusMap";
import { SearchPanel } from "@/components/SearchPanel";
import { NavigationPanel } from "@/components/NavigationPanel";
import { StepFloating } from "@/components/StepFloating";
import { RoutePreview, RecenterFab } from "@/components/RoutePreview";
import { TigrilloGuide } from "@/components/TigrilloGuide";
import { useMapData } from "@/hooks/useMapData";
import { useGeolocation } from "@/hooks/useGeolocation";
import { computeRoute } from "@/lib/routing";
import {
  routeToRoomDestination,
  pickBestEntrance,
  resolveOriginFromBuildingExit,
} from "@/lib/arrival";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  isOutsideCampus,
  routeViaCampusEntry,
  pickBestCampusEntry,
} from "@/lib/campusGate";
import { useStreetApproach } from "@/hooks/useStreetApproach";
import { haversine, UNEMI_CENTER } from "@/lib/geo";
import { speak, stopSpeaking, primeSpeech } from "@/lib/voice";
import type {
  AccessMode,
  ArrivalGuide,
  LatLng,
  MapBuilding,
  MapRoom,
  RouteResult,
} from "@/types/map";
import {
  LogIn,
  MapPin,
  LayoutDashboard,
  Share2,
  Download,
  Search,
  School,
  Menu,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const SNAP_TO_ROUTE_MAX_M = 35;
const ARRIVAL_POINT_THRESHOLD_M = 6;

function bearingBetween(a: LatLng, b: LatLng) {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const toDeg = (v: number) => (v * 180) / Math.PI;

  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const lngDiff = toRad(b.lng - a.lng);

  const y = Math.sin(lngDiff) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(lngDiff);

  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function pointInPolygon(point: LatLng, polygon: LatLng[]) {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;

    const intersect =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;

    if (intersect) inside = !inside;
  }

  return inside;
}

function getBuildingPolygon(building: any): LatLng[] {
  const raw =
    building.polygon ??
    building.geom ??
    building.geometry ??
    building.location ??
    null;

  if (!raw) return [];

  if (Array.isArray(raw)) {
    return raw
      .map((p: any) => ({
        lat: Number(p.lat ?? p.latitude),
        lng: Number(p.lng ?? p.longitude),
      }))
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  }

  if (Array.isArray(raw?.coordinates?.[0])) {
    return raw.coordinates[0]
      .map((p: any) => ({
        lat: Number(p[1]),
        lng: Number(p[0]),
      }))
      .filter((p: LatLng) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  }

  return [];
}

function resolveOriginThroughBuildingDoor(params: {
  origin: LatLng;
  buildings: MapBuilding[];
  entrances: any[];
  mode: AccessMode;
}) {
  const { origin, buildings, entrances, mode } = params;

  const insideBuilding = buildings.find((b: any) => {
    const polygon = getBuildingPolygon(b);
    if (!polygon.length) return false;
    return pointInPolygon(origin, polygon);
  });

  if (!insideBuilding) {
    return {
      origin,
      building: null as MapBuilding | null,
      forcedDoor: null as any,
      isInsideBuilding: false,
    };
  }

  const enabledDoors = entrances.filter((e: any) => {
    const sameBuilding = e.building_id === insideBuilding.id;

    const enabled =
      e.is_active !== false &&
      e.status !== "closed" &&
      e.status !== "temporary_closed" &&
      e.status !== "maintenance";

    const validDirection =
      e.direction === "entry" ||
      e.direction === "both" ||
      e.direction == null;

    const accessModes = Array.isArray(e.access_modes) ? e.access_modes : [];

    const validMode =
      accessModes.length === 0 ||
      accessModes.includes(mode) ||
      accessModes.includes("both") ||
      (mode === "pedestrian" &&
        (e.type === "pedestrian" || e.type === "mixed" || e.entry_type === "pedestrian" || e.entry_type === "mixed")) ||
      (mode === "vehicle" &&
        (e.type === "vehicle" || e.type === "mixed" || e.entry_type === "vehicle" || e.entry_type === "mixed"));

    return sameBuilding && enabled && validDirection && validMode;
  });

  if (!enabledDoors.length) {
    return {
      origin,
      building: insideBuilding,
      forcedDoor: null as any,
      isInsideBuilding: true,
    };
  }

  const forcedDoor = enabledDoors.reduce((best: any, door: any) => {
    const d = haversine(origin, { lat: door.lat, lng: door.lng });
    const bestD = haversine(origin, { lat: best.lat, lng: best.lng });
    return d < bestD ? door : best;
  }, enabledDoors[0]);

  return {
    origin: { lat: forcedDoor.lat, lng: forcedDoor.lng },
    building: insideBuilding,
    forcedDoor,
    isInsideBuilding: true,
  };
}

function nearestPointOnRoute(
  user: LatLng | null,
  route: RouteResult | null,
): LatLng | null {
  if (!user || !route?.coords?.length) return user;

  let nearest = route.coords[0];
  let best = Infinity;

  for (let i = 0; i < route.coords.length - 1; i++) {
    const a = route.coords[i];
    const b = route.coords[i + 1];

    const ax = a.lat;
    const ay = a.lng;
    const bx = b.lat;
    const by = b.lng;
    const px = user.lat;
    const py = user.lng;

    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;

    if (len2 === 0) continue;

    const t = Math.max(
      0,
      Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2),
    );

    const projected = {
      lat: ax + t * dx,
      lng: ay + t * dy,
    };

    const d = haversine(user, projected);

    if (d < best) {
      best = d;
      nearest = projected;
    }
  }

  return best <= SNAP_TO_ROUTE_MAX_M ? nearest : user;
}

export default function Index() {
  const {
    buildings,
    floors,
    rooms,
    entrances,
    campusEntrances,
    paths,
    parkings,
    landmarks,
    loading,
    error,
  } = useMapData();

  const {
    position,
    accuracy,
    heading,
    error: gpsError,
    needsCompassPermission,
    enableCompass,
  } = useGeolocation();

  const [lockedNavigationRoute, setLockedNavigationRoute] =
    useState<RouteResult | null>(null);

  const [destination, setDestination] = useState<MapRoom | null>(null);
  const [destBuilding, setDestBuilding] = useState<MapBuilding | null>(null);
  const [destLandmark, setDestLandmark] =
    useState<import("@/types/map").MapLandmark | null>(null);

  const [exitMode, setExitMode] = useState(false);
  const [mode, setMode] = useState<AccessMode>("pedestrian");
  const [voice, setVoice] = useState(true);
  const [arrived, setArrived] = useState(false);
  const [showArrivalModal, setShowArrivalModal] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [hasSession, setHasSession] = useState(false);
  const [sharedPin, setSharedPin] = useState<LatLng | null>(null);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [navMode, setNavMode] = useState<"preview" | "navigating">("preview");
  const [recenterToken, setRecenterToken] = useState(0);
  const [fitRouteToken, setFitRouteToken] = useState(0);
  const [role, setRole] = useState<string>("public");
  const [destParking, setDestParking] = useState<any | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isInstalledPwa, setIsInstalledPwa] = useState(false);

  const [profile, setProfile] = useState<{
    id: string;
    cedula: string;
    user_type: string;
  } | null>(null);

  const [loadingClassRoute, setLoadingClassRoute] = useState(false);

  const [classRouteMessage, setClassRouteMessage] = useState<{
    type: "warning" | "error";
    title: string;
    description: string;
  } | null>(null);

  useEffect(() => {
    const onPrompt = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  useEffect(() => {
    const checkInstalled = () => {
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as any).standalone === true;

      setIsInstalledPwa(standalone);
    };

    checkInstalled();

    const media = window.matchMedia("(display-mode: standalone)");
    media.addEventListener?.("change", checkInstalled);

    return () => media.removeEventListener?.("change", checkInstalled);
  }, []);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const s = sp.get("share");

    if (s) {
      const [lat, lng] = s.split(",").map(Number);

      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        setSharedPin({ lat, lng });
        toast({
          title: "📍 Ubicación compartida",
          description: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        });
      }
    }
  }, []);

  useEffect(() => {
    if (loading) return;

    const sp = new URLSearchParams(window.location.search);
    const f = sp.get("focus");
    if (!f) return;

    const [kind, id] = f.split(":");
    if (!kind || !id) return;

    if (kind === "building") {
      const b = buildings.find((x) => String(x.id) === id);
      if (b) {
        setDestination(null);
        setDestBuilding(b);
        setDestLandmark(null);
        setExitMode(false);
        toast({
          title: "📌 " + b.name,
          description: "Trazando ruta desde la notificación",
        });
      }
    } else if (kind === "room") {
      const r = rooms.find((x) => String(x.id) === id);
      if (r) {
        setDestination(r);
        setDestBuilding(null);
        setDestLandmark(null);
        setExitMode(false);
        toast({
          title: "📌 " + r.name,
          description: "Trazando ruta desde la notificación",
        });
      }
    } else if (kind === "landmark") {
      const l = landmarks.find((x) => String(x.id) === id);
      if (l) {
        setDestination(null);
        setDestBuilding(null);
        setDestLandmark(l);
        setExitMode(false);
        toast({
          title: "📌 " + l.name,
          description: "Trazando ruta desde la notificación",
        });
      }
    }

    const url = new URL(window.location.href);
    url.searchParams.delete("focus");
    window.history.replaceState({}, "", url.toString());
  }, [loading, buildings, rooms, landmarks]);

  const loadUserProfile = async (userId: string | undefined) => {
    if (!userId) {
      setRole("public");
      setProfile(null);
      return;
    }

    try {
      const { data: roleData } = await (supabase as any).rpc(
        "get_user_effective_role",
        {
          _user_id: userId,
        },
      );

      setRole((roleData as string) ?? "public");

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, cedula, user_type")
        .eq("id", userId)
        .maybeSingle();

      if (profileError) throw profileError;

      setProfile(profileData ?? null);
    } catch {
      setRole("public");
      setProfile(null);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(!!data.session);
      loadUserProfile(data.session?.user.id);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setHasSession(!!s);
      loadUserProfile(s?.user.id);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const canAccessAdmin = ["admin", "operator", "superadmin"].includes(role);
  const isStudent = profile?.user_type === "estudiante";

  const isOp = (s?: string | null) => !s || s === "active";

  const visibleBuildings = useMemo(
    () => buildings.filter((b) => b.is_active !== false && isOp(b.status)),
    [buildings],
  );

  const currentAudience =
    profile?.user_type === "docente"
      ? "teacher"
      : profile?.user_type === "administrativo"
        ? "administrative"
        : profile?.user_type === "estudiante"
          ? "student"
          : "public";

  const visibleParkings = useMemo(
    () =>
      parkings.filter((p) => {
        const audiences = (p as any).target_audiences ?? [
          (p as any).target_audience ?? "public",
        ];

        return (
          (p as any).is_active !== false &&
          isOp(p.status) &&
          (audiences.includes("public") || audiences.includes(currentAudience))
        );
      }),
    [parkings, currentAudience],
  );

  const visibleLandmarks = useMemo(
    () => landmarks.filter((l) => l.is_active !== false && isOp(l.status)),
    [landmarks],
  );

  const visibleEntrances = useMemo(
    () =>
      entrances.filter(
        (e) =>
          (e as any).is_active !== false &&
          isOp(e.status) &&
          ((e as any).direction === "entry" ||
            (e as any).direction === "exit" ||
            (e as any).direction === "both" ||
            (e as any).direction == null),
      ),
    [entrances],
  );

  const visibleCampusEnts = useMemo(
    () =>
      campusEntrances.filter(
        (c) => c.is_active !== false && isOp(c.status),
      ),
    [campusEntrances],
  );

  const visiblePaths = useMemo(
    () =>
      paths.filter(
        (p) =>
          (p as any).is_active !== false &&
          isOp(p.status) &&
          p.status !== "closed" &&
          p.status !== "temporary_closed",
      ),
    [paths],
  );

  const gpsOrigin = position ?? UNEMI_CENTER;

  const buildingDoorOriginInfo = useMemo(
    () =>
      resolveOriginThroughBuildingDoor({
        origin: gpsOrigin,
        buildings: visibleBuildings,
        entrances: visibleEntrances,
        mode,
      }),
    [gpsOrigin, visibleBuildings, visibleEntrances, mode],
  );

  const routeOriginInfo = useMemo(
    () =>
      resolveOriginFromBuildingExit({
        origin: buildingDoorOriginInfo.origin,
        buildings: visibleBuildings,
        entrances: visibleEntrances,
        mode,
      }),
    [buildingDoorOriginInfo.origin, visibleBuildings, visibleEntrances, mode],
  );

  const origin = routeOriginInfo.origin;

  const sortedVisibleLandmarks = useMemo(() => {
    return [...visibleLandmarks].sort((a, b) => {
      const da = haversine(origin, { lat: a.lat, lng: a.lng });
      const db = haversine(origin, { lat: b.lat, lng: b.lng });
      return da - db;
    });
  }, [visibleLandmarks, origin]);

  const outside = useMemo(
    () => isOutsideCampus(origin, visibleBuildings),
    [origin, visibleBuildings],
  );

  const bestCampusEntry = useMemo(
    () =>
      outside
        ? pickBestCampusEntry({
            origin,
            campusEntrances: visibleCampusEnts,
            mode,
          })
        : null,
    [outside, origin, visibleCampusEnts, mode],
  );

  const streetApproach = useStreetApproach(
    outside,
    outside ? origin : null,
    bestCampusEntry
      ? { lat: bestCampusEntry.lat, lng: bestCampusEntry.lng }
      : null,
    mode,
  );

  const arrival = useMemo<ArrivalGuide | null>(() => {
    if (!destination) return null;

    const b = visibleBuildings.find((bb) => bb.id === destination.building_id);
    if (!b) return null;

    const guide = routeToRoomDestination({
      origin,
      room: destination,
      building: b,
      floors,
      entrances: visibleEntrances,
      paths: visiblePaths,
      mode,
      buildings: visibleBuildings,
    });

    if (outside) {
      const best = pickBestEntrance({
        origin,
        building: b,
        entrances: visibleEntrances,
        mode,
      });

      const target = best
        ? { lat: best.lat, lng: best.lng }
        : { lat: b.centroid_lat, lng: b.centroid_lng };

      const via = routeViaCampusEntry({
        origin,
        destination: target,
        campusEntrances: visibleCampusEnts,
        paths: visiblePaths,
        mode,
        obstacles: visibleBuildings.filter((x) => x.id !== b.id),
        streetApproach,
      });

      if (via) return { ...guide, exteriorRoute: via.route };
    }

    return guide;
  }, [
    destination,
    visibleBuildings,
    floors,
    visibleEntrances,
    visiblePaths,
    visibleCampusEnts,
    origin,
    mode,
    outside,
    streetApproach,
  ]);

  const buildingRoute = useMemo<RouteResult | null>(() => {
    if (exitMode) {
      const validExits = visibleCampusEnts.filter(
        (c) =>
          c.is_active !== false &&
          isOp(c.status) &&
          (c.direction === "exit" || c.direction === "both") &&
          (mode === "pedestrian"
            ? c.entry_type === "pedestrian" || c.entry_type === "mixed"
            : c.entry_type === "vehicle" || c.entry_type === "mixed"),
      );

      if (!validExits.length) return null;

      let bestRoute: RouteResult | null = null;

      for (const gate of validExits) {
        const route = computeRoute(
          visiblePaths,
          origin,
          { lat: gate.lat, lng: gate.lng },
          mode,
          visibleBuildings,
          { allowExitRouting: true } as any,
        );

        if (!route) continue;

        if (!bestRoute || route.distance < bestRoute.distance) {
          bestRoute = route;
        }
      }

      return bestRoute;
    }

    if (destination) return arrival?.exteriorRoute ?? null;

    if (destBuilding) {
      const best = pickBestEntrance({
        origin,
        building: destBuilding,
        entrances: visibleEntrances,
        mode,
      });

      const target = best
        ? { lat: best.lat, lng: best.lng }
        : { lat: destBuilding.centroid_lat, lng: destBuilding.centroid_lng };

      const obstacles = visibleBuildings.filter((b) => b.id !== destBuilding.id);

      if (outside) {
        const via = routeViaCampusEntry({
          origin,
          destination: target,
          campusEntrances: visibleCampusEnts,
          paths: visiblePaths,
          mode,
          obstacles,
          streetApproach,
        });

        if (via) return via.route;
      }

      return computeRoute(visiblePaths, origin, target, mode, obstacles);
    }

    if (destLandmark) {
      const target = { lat: destLandmark.lat, lng: destLandmark.lng };

      if (outside) {
        const via = routeViaCampusEntry({
          origin,
          destination: target,
          campusEntrances: visibleCampusEnts,
          paths: visiblePaths,
          mode,
          obstacles: visibleBuildings,
          streetApproach,
        });

        if (via) return via.route;
      }

      return computeRoute(visiblePaths, origin, target, mode, visibleBuildings);
    }

    if (destParking) {
      const target = {
        lat: destParking.centroid_lat,
        lng: destParking.centroid_lng,
      };

      if (outside) {
        const via = routeViaCampusEntry({
          origin,
          destination: target,
          campusEntrances: visibleCampusEnts,
          paths: visiblePaths,
          mode,
          obstacles: visibleBuildings,
          streetApproach,
        });

        if (via) return via.route;
      }

      return computeRoute(visiblePaths, origin, target, mode, visibleBuildings);
    }
    return null;
  }, [
    exitMode,
    destination,
    destBuilding,
    destLandmark,
    destParking,
    visiblePaths,
    visibleEntrances,
    visibleBuildings,
    visibleCampusEnts,
    origin,
    mode,
    arrival,
    outside,
    streetApproach,
  ]);

  const routeWithBuildingExit = useMemo<RouteResult | null>(() => {
    if (!buildingRoute) return null;

    if (
      !buildingDoorOriginInfo.isInsideBuilding ||
      !buildingDoorOriginInfo.forcedDoor ||
      !position
    ) {
      return buildingRoute;
    }

    const door = buildingDoorOriginInfo.forcedDoor;
    const blockName = buildingDoorOriginInfo.building?.name ?? "el bloque actual";

    const userPoint = {
      lat: position.lat,
      lng: position.lng,
    };

    const doorPoint = {
      lat: door.lat,
      lng: door.lng,
    };

    const firstRoutePoint = buildingRoute.coords?.[0];

    const coords = [
      userPoint,
      doorPoint,
      ...(firstRoutePoint && haversine(doorPoint, firstRoutePoint) < 3
        ? buildingRoute.coords.slice(1)
        : buildingRoute.coords),
    ];

    const extraDistance = haversine(userPoint, doorPoint);

    const exitStep = {
      instruction: `Dirígete desde tu ubicación actual hasta la puerta habilitada más cercana de ${blockName}.`,
      lat: door.lat,
      lng: door.lng,
    };

    return {
      ...buildingRoute,
      coords,
      distance: buildingRoute.distance + extraDistance,
      duration:
        buildingRoute.duration +
        extraDistance / (mode === "vehicle" ? 8 : 1.4),
      steps: [exitStep, ...buildingRoute.steps],
    };
  }, [buildingRoute, buildingDoorOriginInfo, position, mode]);

  const routeWithStreetNames = useMemo<RouteResult | null>(() => {
    const baseRoute = routeWithBuildingExit ?? buildingRoute;

    if (!baseRoute) return null;
    if (!outside || !streetApproach) return baseRoute;

    const streetSteps =
      (streetApproach as any)?.steps ??
      (streetApproach as any)?.route?.steps ??
      (streetApproach as any)?.legs?.[0]?.steps ??
      [];

    if (!Array.isArray(streetSteps) || streetSteps.length === 0) {
      return baseRoute;
    }

    const namedStreetSteps = streetSteps
      .map((s: any) => {
        const name =
          s.name ||
          s.street ||
          s.road ||
          s.ref ||
          s.maneuver?.street_name ||
          "calle sin nombre";

        const instruction =
          s.instruction ||
          s.maneuver?.instruction ||
          `Continúa por ${name}`;

        const location = s.location ?? s.maneuver?.location;

        return {
          instruction:
            name && name !== "calle sin nombre"
              ? `${instruction}. Referencia: ${name}`
              : instruction,
          lat: Array.isArray(location) ? location[1] : baseRoute.steps[0]?.lat,
          lng: Array.isArray(location) ? location[0] : baseRoute.steps[0]?.lng,
        };
      })
      .filter((s: any) => Number.isFinite(s.lat) && Number.isFinite(s.lng));

    if (!namedStreetSteps.length) return baseRoute;

    return {
      ...baseRoute,
      steps: [...namedStreetSteps, ...baseRoute.steps],
    };
  }, [buildingRoute, routeWithBuildingExit, outside, streetApproach]);

  const liveRoute = routeWithStreetNames ?? routeWithBuildingExit ?? buildingRoute;

  const routeForRender =
    navMode === "navigating" && lockedNavigationRoute
      ? lockedNavigationRoute
      : liveRoute;

  useEffect(() => {
    if (!voice || arrived || !routeForRender || navMode !== "navigating") return;
    if (!destination && !destBuilding && !destLandmark && !destParking && !exitMode) return;

    const target =
      destination?.name ??
      destBuilding?.name ??
      destLandmark?.name ??
      destParking?.name ??
      (exitMode ? "salida del campus" : "tu destino");

    const dist = Math.round(routeForRender.distance);
    const first = routeForRender.steps[0]?.instruction ?? "Comienza tu recorrido.";

    speak(`Iniciando ruta hacia ${target}. Distancia ${dist} metros. ${first}`, {
      force: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navMode]);

  useEffect(() => {
    if (arrived || !routeForRender || !position || navMode !== "navigating") return;

    const steps = routeForRender.steps;
    if (!steps.length) return;

    const current = steps[stepIndex];
    if (!current) return;

    if (haversine(position, { lat: current.lat, lng: current.lng }) < 15) {
      const nextIdx = Math.min(stepIndex + 1, steps.length - 1);

      if (nextIdx !== stepIndex) {
        setStepIndex(nextIdx);

        if (voice) speak(steps[nextIdx].instruction);
      }
    }
  }, [position, routeForRender, voice, arrived, stepIndex, navMode]);

  useEffect(() => {
    if (!routeForRender || navMode !== "preview") return;
    setFitRouteToken((t) => t + 1);
  }, [routeForRender, navMode]);

  const announceSelection = (name: string) => {
    if (!voice) return;

    primeSpeech();
    speak(`Calculando ruta hacia ${name}.`, { force: true });
  };

  const resetRoute = () => {
    setArrived(false);
    setStepIndex(0);
    setNavMode("preview");
    setLockedNavigationRoute(null);
  };

  const handleSelectRoom = (r: MapRoom) => {
    setDestination(r);
    setDestBuilding(null);
    setDestLandmark(null);
    setDestParking(null);
    setExitMode(false);
    resetRoute();
    announceSelection(r.name);
  };

  const handleSelectBuilding = (b: MapBuilding) => {
    setDestination(null);
    setDestBuilding(b);
    setDestLandmark(null);
    setDestParking(null);
    setExitMode(false);
    resetRoute();
    announceSelection(b.name);
  };

  const handleSelectLandmark = (l: import("@/types/map").MapLandmark) => {
    setDestination(null);
    setDestBuilding(null);
    setDestLandmark(l);
    setDestParking(null);
    setExitMode(false);
    resetRoute();
    announceSelection(l.name);
  };

  const handleSelectExit = () => {
    setDestination(null);
    setDestBuilding(null);
    setDestLandmark(null);
    setDestParking(null);
    setExitMode(true);
    resetRoute();
    announceSelection("salida del campus");
  };

  const handleClose = () => {
    setDestination(null);
    setDestBuilding(null);
    setDestLandmark(null);
    setExitMode(false);
    resetRoute();
    stopSpeaking();
    setDestParking(null);
  };

  const finishRoute = () => {
    setShowArrivalModal(false);

    setDestination(null);
    setDestBuilding(null);
    setDestLandmark(null);
    setDestParking(null);
    setExitMode(false);

    setArrived(false);
    setStepIndex(0);
    setNavMode("preview");

    setFitRouteToken(0);
    setRecenterToken((t) => t + 1);

    stopSpeaking();

    setLockedNavigationRoute(null);

    toast({
      title: "✅ Ruta finalizada",
      description: "Se limpió la ruta del mapa.",
    });
  };

  const handleStartNavigation = () => {
    if (liveRoute?.coords?.length) {
      setLockedNavigationRoute(liveRoute);
    }

    setNavMode("navigating");
    setRecenterToken((t) => t + 1);
  };

  const handleRecenter = () => setRecenterToken((t) => t + 1);

  const shareMyLocation = async () => {
    const p = position;

    if (!p) {
      toast({
        title: "Sin ubicación GPS",
        description: "Activa el GPS para compartir tu ubicación.",
        variant: "destructive",
      });
      return;
    }

    const url = `${window.location.origin}/?share=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

    const shareData = {
      title: "Mi ubicación en UNEMI",
      text: "Estoy aquí en el campus",
      url,
    };

    try {
      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(url);
        toast({ title: "🔗 Enlace copiado", description: url });
      }
    } catch {
      // usuario canceló
    }
  };

  const installApp = async () => {
    if (!installPrompt) {
      toast({
        title: "Instalación no disponible",
        description:
          "En iOS: usa Compartir → Agregar a pantalla de inicio. En desktop: ícono de instalación de la barra de direcciones.",
      });
      return;
    }

    installPrompt.prompt();

    const { outcome } = await installPrompt.userChoice;

    if (outcome === "accepted") toast({ title: "✅ App instalada" });

    setInstallPrompt(null);
  };

  const hasActiveRoute = !!(destination || destBuilding || destLandmark || destParking || exitMode);

  const activeDestinationName = exitMode
    ? "Salida del campus"
    : destination?.name ??
      destBuilding?.name ??
      destLandmark?.name ??
      destParking?.name ??
      "tu destino";

  const handleSelectParking = (p: any) => {
    setDestination(null);
    setDestBuilding(null);
    setDestLandmark(null);
    setDestParking(p);
    setExitMode(false);
    resetRoute();
    announceSelection(p.name ?? "parqueadero");
  };

  const remainingDistance = useMemo(() => {
    if (!routeForRender || !position) return routeForRender?.distance ?? 0;

    const coords = routeForRender.coords;

    let total = 0;
    let nearestIdx = 0;
    let nearestDist = Infinity;

    for (let i = 0; i < coords.length; i++) {
      const d = haversine(position, coords[i]);

      if (d < nearestDist) {
        nearestDist = d;
        nearestIdx = i;
      }
    }

    total += nearestDist;

    for (let i = nearestIdx; i < coords.length - 1; i++) {
      total += haversine(coords[i], coords[i + 1]);
    }

    return total;
  }, [routeForRender, position]);

  const remainingDuration = useMemo(() => {
    if (!routeForRender) return 0;

    const speed = mode === "vehicle" ? 8 : 1.4;

    if (!routeForRender.distance) return routeForRender.duration ?? 0;

    return remainingDistance / speed;
  }, [remainingDistance, routeForRender, mode]);

  const isNavigating = hasActiveRoute && navMode === "navigating";
  const isPreviewing = hasActiveRoute && navMode === "preview";

  const previewDestinationCode =
    destination?.code ??
    destBuilding?.code ??
    (destParking ? "Parqueadero" : null);

  const snappedUser = useMemo(
    () => nearestPointOnRoute(position, isNavigating ? routeForRender : null),
    [position, routeForRender, isNavigating],
  );

  useEffect(() => {
    if (
      arrived ||
      navMode !== "navigating" ||
      !routeForRender?.coords?.length ||
      !snappedUser
    ) {
      return;
    }

    const finalPoint = routeForRender.coords[routeForRender.coords.length - 1];
    const distanceToFinalPoint = haversine(snappedUser, finalPoint);

    if (distanceToFinalPoint <= ARRIVAL_POINT_THRESHOLD_M) {
      setArrived(true);
      setShowArrivalModal(true);
      setNavMode("preview");

      if (voice) {
        speak(`Hemos llegado a ${activeDestinationName}.`, { force: true });
      }
    }
  }, [
    arrived,
    navMode,
    routeForRender,
    snappedUser,
    voice,
    activeDestinationName,
  ]);

  const routeBearing = useMemo(() => {
    if (!routeForRender?.coords?.length) return heading ?? 0;

    const coords = routeForRender.coords;

    let startIndex = 0;

    if (position) {
      let best = Infinity;

      coords.forEach((p, i) => {
        const d = haversine(position, p);

        if (d < best) {
          best = d;
          startIndex = i;
        }
      });
    }

    for (let i = startIndex; i < coords.length - 1; i++) {
      const a = coords[i];
      const b = coords[i + 1];

      if (haversine(a, b) >= 2) {
        return bearingBetween(a, b);
      }
    }

    for (let i = 0; i < coords.length - 1; i++) {
      const a = coords[i];
      const b = coords[i + 1];

      if (haversine(a, b) >= 2) {
        return bearingBetween(a, b);
      }
    }

    return heading ?? 0;
  }, [routeForRender, position, heading]);

  const goToMyClass = async () => {
    if (!profile?.cedula) {
      toast({
        title: "No se encontró tu cédula",
        description: "Tu perfil no tiene un número de documento registrado.",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoadingClassRoute(true);
      setClassRouteMessage(null);

      const documento = String(profile.cedula).replace(/\D/g, "");

      const { data: configData, error: configError } = await supabase
        .from("config")
        .select("api_siguiente_hora")
        .order("id", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (configError) {
        throw new Error("No se pudo cargar la configuración del sistema.");
      }

      const apiUrl = String(configData?.api_siguiente_hora ?? "").trim();

      if (!apiUrl) {
        throw new Error("No existe una URL configurada para consultar la siguiente clase.");
      }

      const res = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ documento }),
      });

      if (!res.ok) {
        throw new Error("No se pudo consultar el aula asignada.");
      }

      const data = await res.json();

      if (!data?.isSuccess) {
        throw new Error(data?.message || "No se encontró información académica.");
      }

      const aula = String(data?.aData?.aula ?? "").trim();

      if (!aula || aula.toUpperCase() === "INDETERMINADO") {
        setClassRouteMessage({
          type: "warning",
          title: "Aula no determinada",
          description:
            "El sistema académico no devolvió un aula específica para tu clase actual.",
        });
        return;
      }

      const normalize = (value: string | null | undefined) =>
        String(value ?? "")
          .trim()
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/\s+/g, " ");

      const aulaNorm = normalize(aula);

      const room = rooms.find((r) => {
        const name = normalize(r.name);
        const code = normalize(r.code);
        const keywords = Array.isArray(r.keywords)
          ? r.keywords.map((k) => normalize(String(k))).join(" ")
          : normalize(String(r.keywords ?? ""));

        return (
          name === aulaNorm ||
          code === aulaNorm ||
          name.includes(aulaNorm) ||
          aulaNorm.includes(name) ||
          code.includes(aulaNorm) ||
          keywords.includes(aulaNorm)
        );
      });

      if (!room) {
        setClassRouteMessage({
          type: "warning",
          title: "Aula no encontrada en el mapa",
          description: `El SGA devolvió "${aula}", pero no existe una room equivalente en el mapa institucional.`,
        });
        return;
      }

      setClassRouteMessage(null);
      handleSelectRoom(room);

      toast({
        title: "🎓 Ruta a tu clase",
        description: `Aula asignada: ${aula}`,
      });
    } catch (e) {
      setClassRouteMessage({
        type: "error",
        title: "No se pudo obtener tu clase",
        description: e instanceof Error ? e.message : "Ocurrió un error inesperado.",
      });
    } finally {
      setLoadingClassRoute(false);
    }
  };

  return (
    <div className="relative h-screen w-full overflow-hidden">
      <GoogleCampusMap
        buildings={visibleBuildings}
        entrances={visibleEntrances}
        campusEntrances={visibleCampusEnts}
        parkings={visibleParkings}
        paths={visiblePaths}
        landmarks={visibleLandmarks}
        user={snappedUser}
        userAccuracy={accuracy}
        userMode={mode}
        userBearing={heading}
        followUser={false}
        rotateWithHeading={false}
        isNavigating={isNavigating && !arrived}
        route={routeForRender}
        sharedPin={sharedPin}
        onBuildingClick={handleSelectBuilding}
        recenterToken={recenterToken}
        fitRouteToken={fitRouteToken}
        className="absolute inset-0"
      />

      {!hasActiveRoute && (
        <div className="absolute right-3 top-3 z-[1200] pointer-events-auto">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button
                size="icon"
                variant="default"
                className="h-14 w-14 rounded-2xl bg-primary text-primary-foreground shadow-xl"
                title="Abrir menú del mapa"
                aria-label="Abrir menú del mapa"
              >
                <Menu className="h-7 w-7" />
              </Button>
            </SheetTrigger>

            <SheetContent
              side="right"
              className="w-[310px] sm:w-[360px] pt-[calc(env(safe-area-inset-top)+1.5rem)]"
            >
              <SheetHeader>
                <SheetTitle>Mapa UNEMI</SheetTitle>
              </SheetHeader>

              <div className="mt-6 space-y-3">
                <Button variant="outline" className="w-full justify-start" onClick={shareMyLocation}>
                  <Share2 className="mr-2 h-4 w-4" />
                  Compartir ubicación
                </Button>

                {hasSession && isStudent && (
                  <Button
                    className="w-full justify-start"
                    onClick={goToMyClass}
                    disabled={loadingClassRoute || loading}
                  >
                    {loadingClassRoute ? (
                      <Search className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <School className="mr-2 h-4 w-4" />
                    )}
                    Ir a mi clase
                  </Button>
                )}

                {!isInstalledPwa && installPrompt && (
                  <Button variant="outline" className="w-full justify-start" onClick={installApp}>
                    <Download className="mr-2 h-4 w-4" />
                    Instalar aplicación
                  </Button>
                )}

                {hasSession && canAccessAdmin && (
                  <Link to="/admin">
                    <Button variant="outline" className="w-full justify-start">
                      <LayoutDashboard className="mr-2 h-4 w-4" />
                      Panel administrativo
                    </Button>
                  </Link>
                )}

                {!hasSession && (
                  <Link to="/auth">
                    <Button variant="outline" className="w-full justify-start">
                      <LogIn className="mr-2 h-4 w-4" />
                      Iniciar sesión
                    </Button>
                  </Link>
                )}

                {hasSession && !canAccessAdmin && (
                  <Button
                    variant="destructive"
                    className="w-full justify-start"
                    onClick={async () => {
                      if (window.confirm("¿Cerrar sesión?")) {
                        await supabase.auth.signOut();
                      }
                    }}
                  >
                    <LogIn className="mr-2 h-4 w-4" />
                    Cerrar sesión
                  </Button>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      )}

      {position && (
        <div className="absolute right-3 bottom-24 z-[1100] flex flex-col items-end gap-2 sm:bottom-28">
          {needsCompassPermission && (
            <button
              onClick={enableCompass}
              className="rounded-full bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground shadow-[var(--shadow-card)] transition active:scale-95"
            >
              🧭 Activar brújula
            </button>
          )}

          {accuracy != null && accuracy > 30 && (
            <div className="rounded-full border border-border/50 bg-card/95 px-3 py-1 text-[11px] font-medium shadow-[var(--shadow-card)] backdrop-blur">
              <span className={accuracy > 60 ? "text-destructive" : "text-amber-600"}>
                GPS ±{Math.round(accuracy)} m
              </span>

              {accuracy > 60 && (
                <span className="text-muted-foreground"> · sal al exterior</span>
              )}
            </div>
          )}

          <RecenterFab onClick={handleRecenter} rotated={isNavigating} />
        </div>
      )}

      {!hasActiveRoute && !menuOpen && (
        <header className="pointer-events-none absolute inset-x-0 top-0 z-[1000] p-3 sm:p-4">
          <div className="pointer-events-auto mx-auto max-w-2xl">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex items-center gap-2 rounded-full bg-card/95 px-3 py-1.5 shadow-[var(--shadow-card)] backdrop-blur">
                <TigrilloGuide size={32} />

                <div className="leading-tight">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Mapa Institucional
                  </p>
                  <p className="text-sm font-bold">UNEMI</p>
                </div>
              </div>
            </div>

            {classRouteMessage && (
              <div
                className={[
                  "mb-3 rounded-2xl border bg-card/95 p-3 shadow-[var(--shadow-card)] backdrop-blur",
                  classRouteMessage.type === "error"
                    ? "border-destructive/40 text-destructive"
                    : "border-amber-300 text-amber-800",
                ].join(" ")}
              >
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 text-lg">
                    {classRouteMessage.type === "error" ? "❌" : "⚠️"}
                  </div>

                  <div className="flex-1">
                    <p className="text-sm font-bold">{classRouteMessage.title}</p>
                    <p className="text-xs opacity-80">
                      {classRouteMessage.description}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setClassRouteMessage(null)}
                    className="rounded-full px-2 py-1 text-xs font-semibold opacity-70 hover:opacity-100"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            )}

            <SearchPanel
              rooms={rooms.filter((r) =>
                visibleBuildings.some((b) => b.id === r.building_id),
              )}
              buildings={visibleBuildings}
              landmarks={sortedVisibleLandmarks}
              parkings={visibleParkings}
              onSelectRoom={handleSelectRoom}
              onSelectBuilding={handleSelectBuilding}
              onSelectLandmark={handleSelectLandmark}
              onSelectParking={handleSelectParking}
              onSelectExit={handleSelectExit}
            />

            {(error || gpsError) && (
              <div className="mt-2 rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                {error && (
                  <p>📡 {error}. Ejecuta los SQL de /database en tu Supabase.</p>
                )}
                {gpsError && <p>📍 GPS: {gpsError}</p>}
              </div>
            )}
          </div>
        </header>
      )}

      {isPreviewing && routeForRender && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-[1000] p-2 sm:p-3">
          <div className="pointer-events-auto mx-auto max-h-[calc(100dvh-7rem)] max-w-2xl overflow-y-auto overscroll-contain rounded-3xl pb-6">
            <RoutePreview
              destinationName={activeDestinationName}
              destinationCode={previewDestinationCode}
              route={routeForRender}
              arrival={arrival}
              mode={mode}
              onChangeMode={(m) => {
                setMode(m);
                resetRoute();
              }}
              onStart={handleStartNavigation}
              onClose={handleClose}
            />
          </div>
        </div>
      )}

      {isNavigating && routeForRender && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[1000] p-3 sm:p-4">
          <div className="mx-auto max-w-xl">
            <StepFloating
              step={routeForRender.steps[stepIndex] ?? null}
              stepIndex={stepIndex}
              totalSteps={routeForRender.steps.length}
              distanceToStep={
                position && routeForRender.steps[stepIndex]
                  ? haversine(position, {
                      lat: routeForRender.steps[stepIndex].lat,
                      lng: routeForRender.steps[stepIndex].lng,
                    })
                  : null
              }
              remainingDistance={remainingDistance}
              remainingDuration={remainingDuration}
              destinationName={activeDestinationName}
              arrived={arrived}
              arrivalText={arrival?.arrivalInstruction ?? null}
              voice={voice}
              onToggleVoice={() => {
                setVoice((v) => !v);
                if (voice) stopSpeaking();
              }}
              onClose={handleClose}
              mode={mode}
              onChangeMode={(m) => {
                setMode(m);
                resetRoute();
              }}
            />
          </div>
        </div>
      )}

      {arrived && routeForRender && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1000] p-3 sm:p-4">
          <div className="pointer-events-auto mx-auto max-w-2xl">
            <NavigationPanel
              destination={
                destination ??
                (destBuilding
                  ? ({
                      id: destBuilding.id,
                      name: destBuilding.name,
                      code: destBuilding.code,
                      building_id: destBuilding.id,
                      floor_id: null,
                      room_type_id: null,
                      description: destBuilding.description,
                      directions: null,
                      image_url: destBuilding.image_url,
                      keywords: null,
                      target_audience: destBuilding.target_audience,
                    } as MapRoom)
                  : destLandmark
                    ? ({
                        id: destLandmark.id,
                        name: destLandmark.name,
                        code: null,
                        building_id: "",
                        floor_id: null,
                        room_type_id: null,
                        description: destLandmark.description,
                        directions: null,
                        image_url: null,
                        keywords: null,
                        target_audience: "public",
                      } as MapRoom)
                    : destParking
                      ? ({
                          id: destParking.id,
                          name: destParking.name ?? "Parqueadero",
                          code: null,
                          building_id: "",
                          floor_id: null,
                          room_type_id: null,
                          description: `Parqueadero ${destParking.type ?? ""}`,
                          directions: null,
                          image_url: null,
                          keywords: null,
                          target_audience: "public",
                        } as MapRoom)
                      : null)
              }
              route={routeForRender}
              arrival={arrival ?? undefined}
              mode={mode}
              onChangeMode={setMode}
              onClose={handleClose}
              arrived={arrived}
              voice={voice}
              onToggleVoice={() => {
                setVoice((v) => !v);
                if (voice) stopSpeaking();
              }}
            />
          </div>
        </div>
      )}

      {loading && (
        <div className="absolute inset-0 z-[2000] grid place-items-center bg-background/60 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <TigrilloGuide walking size={120} />
            <p className="text-sm text-muted-foreground">Cargando campus…</p>
          </div>
        </div>
      )}

      {!loading && buildings.length === 0 && (
        <div className="absolute left-1/2 top-1/2 z-[1000] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-card/95 p-6 text-center shadow-[var(--shadow-card)] backdrop-blur">
          <MapPin className="mx-auto mb-2 h-8 w-8 text-primary" />

          <h2 className="mb-1 font-bold">El campus está vacío</h2>

          <p className="mb-3 text-sm text-muted-foreground">
            Inicia sesión como administrador para dibujar edificios, calles, parqueos y aulas.
          </p>

          <Link to={hasSession ? "/admin" : "/auth"}>
            <Button>{hasSession ? "Ir al editor" : "Iniciar sesión"}</Button>
          </Link>
        </div>
      )}

      <Dialog open={showArrivalModal} onOpenChange={setShowArrivalModal}>
        <DialogContent className="max-w-xs rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-center text-xl">
              Has llegado a tu destino
            </DialogTitle>
          </DialogHeader>

          <Button className="w-full" onClick={finishRoute}>
            Finalizar
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
