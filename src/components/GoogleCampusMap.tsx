import { useEffect, useRef, useState } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import { supabase } from "@/integrations/supabase/client";
import type {
  AccessMode, FeatureStatus, LatLng, MapBuilding, MapCampusEntrance, MapEntrance,
  MapLandmark, MapParking, MapPath, RouteResult,
} from "@/types/map";
import { FEATURE_STATUS_COLOR, FEATURE_STATUS_LABEL } from "@/types/map";
import { UNEMI_CENTER } from "@/lib/geo";
import tigrilloWalk from "@/assets/tigrillo-walk.png";
import tigrilloCar from "@/assets/tigrillo-car.png";

interface GMapsLibs {
  Map: typeof google.maps.Map;
  AdvancedMarkerElement: typeof google.maps.marker.AdvancedMarkerElement;
  Polyline: typeof google.maps.Polyline;
  Polygon: typeof google.maps.Polygon;
  Circle: typeof google.maps.Circle;
  LatLngBounds: typeof google.maps.LatLngBounds;
}

let libsPromise: Promise<GMapsLibs> | null = null;

async function fetchApiKey(): Promise<string> {
  // 1) Build-time env (VS Code .env local). 2) Edge function (Lovable preview).
  const envKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  if (envKey) return envKey;
  const { data, error } = await supabase.functions.invoke("get-google-maps-key");
  if (error) throw new Error(error.message);
  const key = (data as { key?: string } | null)?.key;
  if (!key) throw new Error("GOOGLE_MAPS_API_KEY no configurada en el backend");
  return key;
}

function loadGoogle(): Promise<GMapsLibs> {
  if (!libsPromise) {
    libsPromise = (async () => {
      const key = await fetchApiKey();
      setOptions({ key, v: "weekly" });
      const mapsLib = (await importLibrary("maps")) as google.maps.MapsLibrary;
      const markerLib = (await importLibrary("marker")) as google.maps.MarkerLibrary;
      const coreLib = (await importLibrary("core")) as google.maps.CoreLibrary;
      return {
        Map: mapsLib.Map,
        Polyline: mapsLib.Polyline,
        Polygon: mapsLib.Polygon,
        Circle: mapsLib.Circle,
        AdvancedMarkerElement: markerLib.AdvancedMarkerElement,
        LatLngBounds: coreLib.LatLngBounds,
      };
    })().catch((e) => {
      libsPromise = null; // permitir reintento
      throw e;
    });
  }
  return libsPromise;
}

const LANDMARK_STYLE: Record<string, { bg: string; emoji: string }> = {
  reference: { bg: "#e6b800", emoji: "📍" },
  plaza:     { bg: "#3aa37a", emoji: "🌳" },
  corridor:  { bg: "#4f86b4", emoji: "🚶‍♂️" },
  restroom:  { bg: "#4a6fc7", emoji: "🚻" },
  cafeteria: { bg: "#d97a2c", emoji: "☕" },
  bar:       { bg: "#c84775", emoji: "🍔" },
  atm:       { bg: "#3aa15a", emoji: "🏧" },
  emergency: { bg: "#dc2626", emoji: "🚨" },
  other:     { bg: "#737373", emoji: "•" },
};

const CAMPUS_ENTRY_COLORS = {
  pedestrian: "#22a35a",
  vehicle: "#2c63c2",
  mixed: "#8a3eb8",
};
const CAMPUS_ENTRY_SYMBOL = { pedestrian: "🚶", vehicle: "🚗", mixed: "⛩" };

function divHtmlEl(html: string): HTMLElement {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el.firstElementChild as HTMLElement;
}

function buildingMarkerEl(label: string): HTMLElement {
  return divHtmlEl(
    `<div style="background:rgba(255,255,255,.94);color:#1f3d6b;padding:4px 10px;border-radius:8px;font-size:12px;font-weight:700;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,.25);border:1px solid rgba(31,61,107,.3);transform:translate(-50%,-50%)">${label}</div>`,
  );
}
function parkingMarkerEl(): HTMLElement {
  return divHtmlEl(
    `<div style="width:26px;height:26px;border-radius:6px;background:#1f4d8a;color:white;display:grid;place-items:center;font-weight:700;border:2px solid white;transform:translate(-50%,-50%)">P</div>`,
  );
}
function campusEntryMarkerEl(type: "pedestrian" | "vehicle" | "mixed"): HTMLElement {
  return divHtmlEl(
    `<div style="width:32px;height:32px;border-radius:50%;background:${CAMPUS_ENTRY_COLORS[type]};border:3px solid white;display:grid;place-items:center;font-size:16px;box-shadow:0 4px 10px rgba(0,0,0,.3);transform:translate(-50%,-50%)">${CAMPUS_ENTRY_SYMBOL[type]}</div>`,
  );
}
function entranceMarkerEl(): HTMLElement {
  return divHtmlEl(
    `<div style="width:14px;height:14px;border-radius:50%;background:#22a35a;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,.3);transform:translate(-50%,-50%)"></div>`,
  );
}
function landmarkMarkerEl(kind: string): HTMLElement {
  const s = LANDMARK_STYLE[kind] ?? LANDMARK_STYLE.other;
  return divHtmlEl(
    `<div style="width:28px;height:28px;border-radius:50%;background:${s.bg};border:2px solid white;display:grid;place-items:center;font-size:14px;box-shadow:0 3px 8px rgba(0,0,0,.3);transform:translate(-50%,-50%)">${s.emoji}</div>`,
  );
}
function userMarkerEl(mode: AccessMode): HTMLElement {
  const img = mode === "vehicle" ? tigrilloCar : tigrilloWalk;
  const size = mode === "vehicle" ? 64 : 56;
  // El centrado real lo hace AdvancedMarkerElement con anchorTop/anchorLeft.
  // No usamos transform aquí para evitar doble desplazamiento visual.
  return divHtmlEl(
    `<div style="width:${size}px;height:${size}px;display:grid;place-items:center;filter:drop-shadow(0 4px 6px rgba(0,0,0,.35));position:relative">
      <div style="position:absolute;inset:0;margin:auto;width:18px;height:18px;border-radius:50%;background:rgba(255,120,40,.35);box-shadow:0 0 0 6px rgba(255,120,40,.15)"></div>
      <img src="${img}" alt="tú" style="width:100%;height:100%;object-fit:contain;pointer-events:none;position:relative" />
    </div>`,
  );
}
function sharedPinEl(): HTMLElement {
  return divHtmlEl(
    `<div style="width:28px;height:28px;border-radius:50% 50% 50% 0;background:#dc3636;border:3px solid white;transform:translate(-50%,-100%) rotate(-45deg);box-shadow:0 4px 12px rgba(0,0,0,.4)"></div>`,
  );
}

type UserLocationOverlay = google.maps.OverlayView & {
  setPosition: (position: LatLng) => void;
  setMode: (mode: AccessMode) => void;
};

type RotatableMap = google.maps.Map & {
  setHeading?: (heading: number) => void;
  setTilt?: (tilt: number) => void;
};

function setMapHeading(map: google.maps.Map, heading: number) {
  try {
    const normalized = ((heading % 360) + 360) % 360;
    const m = map as RotatableMap;
    m.setTilt?.(0);
    m.setHeading?.(normalized);
  } catch {
    // ignore
  }
}

function createUserLocationOverlay(position: LatLng, mode: AccessMode): UserLocationOverlay {
  class UserLocationOverlayImpl extends google.maps.OverlayView {
    private positionValue = position;
    private modeValue = mode;
    private div: HTMLDivElement | null = null;

    onAdd() {
      this.div = document.createElement("div");
      this.div.style.position = "absolute";
      this.div.style.transform = "translate(-50%, -50%)";
      this.div.style.pointerEvents = "none";
      this.div.style.zIndex = "1000";
      this.renderMarker();
      this.getPanes()?.overlayMouseTarget.appendChild(this.div);
    }

    draw() {
      if (!this.div) return;
      const projection = this.getProjection();
      if (!projection) return;
      const px = projection.fromLatLngToDivPixel(
        new google.maps.LatLng(this.positionValue.lat, this.positionValue.lng),
      );
      if (!px) return;
      this.div.style.left = `${px.x}px`;
      this.div.style.top = `${px.y}px`;
    }

    onRemove() {
      this.div?.remove();
      this.div = null;
    }

    setPosition(next: LatLng) {
      this.positionValue = next;
      this.draw();
    }

    setMode(next: AccessMode) {
      if (next === this.modeValue) return;
      this.modeValue = next;
      this.renderMarker();
      this.draw();
    }

    private renderMarker() {
      if (!this.div) return;
      this.div.replaceChildren(userMarkerEl(this.modeValue));
    }
  }

  return new UserLocationOverlayImpl() as UserLocationOverlay;
}

interface Props {
  buildings: MapBuilding[];
  entrances: MapEntrance[];
  campusEntrances?: MapCampusEntrance[];
  parkings: MapParking[];
  paths: MapPath[];
  landmarks?: MapLandmark[];
  user?: LatLng | null;
  userAccuracy?: number | null;
  userMode?: AccessMode;
  userBearing?: number | null;
  followUser?: boolean;
  /** Cuando true, el mapa rota para mantener "arriba = adelante" (modo navegación activa). */
  rotateWithHeading?: boolean;
  route?: RouteResult | null;
  isNavigating?: boolean;
  sharedPin?: LatLng | null;
  onBuildingClick?: (b: MapBuilding) => void;
  /** Disparado cuando el usuario interactúa con el mapa (drag/zoom). */
  onUserInteract?: () => void;
  /** Cambia cuando el padre pide re-centrar (incrementa para forzar). */
  recenterToken?: number;
  /** Cambia cuando el padre pide encuadrar la ruta completa. */
  fitRouteToken?: number;
  className?: string;
}

export function GoogleCampusMap({
  buildings, entrances, campusEntrances = [], parkings, paths, landmarks = [],
  user, userAccuracy = null, userMode = "pedestrian", userBearing = null, followUser = false,
  rotateWithHeading = false,
  route, isNavigating = false, sharedPin, onBuildingClick, onUserInteract, recenterToken, fitRouteToken,
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const overlaysRef = useRef<{
    markers: google.maps.marker.AdvancedMarkerElement[];
    polylines: google.maps.Polyline[];
    polygons: google.maps.Polygon[];
  }>({ markers: [], polylines: [], polygons: [] });
  const userMarkerRef = useRef<UserLocationOverlay | null>(null);
  const accuracyCircleRef = useRef<google.maps.Circle | null>(null);
  const sharedMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const routePolyRef = useRef<google.maps.Polyline | null>(null);
  const buildingClickRef = useRef<typeof onBuildingClick>();
  buildingClickRef.current = onBuildingClick;
  const interactRef = useRef<typeof onUserInteract>();
  interactRef.current = onUserInteract;
  const didCenterUserRef = useRef(false);
  const errorRef = useRef<string | null>(null);
  // Si el usuario movió el mapa manualmente, no auto-paneamos hasta que pulse "Centrar".
  const userMovedRef = useRef(false);

  const libsRef = useRef<GMapsLibs | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    loadGoogle()
      .then((libs) => {
        if (cancelled || !containerRef.current) return;
        libsRef.current = libs;
        const map = new libs.Map(containerRef.current, {
          center: { lat: UNEMI_CENTER.lat, lng: UNEMI_CENTER.lng },
          zoom: 18,
          mapTypeId: "roadmap",
          mapId: "DEMO_MAP_ID",
          renderingType: google.maps.RenderingType.VECTOR,
          disableDefaultUI: false,
          zoomControl: true,
          streetViewControl: false,
          fullscreenControl: false,
          mapTypeControl: false,
          rotateControl: false,
          tilt: 0,
          gestureHandling: "greedy",
          clickableIcons: false,
        });
        mapRef.current = map;

        // Detectar interacción manual del usuario para suspender el auto-pan.
        const markUser = () => {
          userMovedRef.current = true;
          interactRef.current?.();
        };
        map.addListener("dragstart", markUser);
        const el = containerRef.current;
        el.addEventListener("wheel", markUser, { passive: true });
        el.addEventListener("touchstart", markUser, { passive: true });

        setReady(true);
      })
      .catch((e) => {
        errorRef.current = e?.message ?? "Error cargando Google Maps";
        if (containerRef.current) {
          containerRef.current.innerHTML = `<div style="position:absolute;inset:0;display:grid;place-items:center;background:#f3f4f6;color:#374151;font-family:system-ui;padding:24px;text-align:center">
            <div>
              <div style="font-size:20px;font-weight:700;margin-bottom:8px">⚠️ Mapa no disponible</div>
              <div style="font-size:13px;max-width:460px;line-height:1.5">${errorRef.current}<br/><br/>
              Asegúrate de tener <b>Maps JavaScript API</b> habilitada en Google Cloud y la key configurada como <code>GOOGLE_MAPS_API_KEY</code> (backend) o <code>VITE_GOOGLE_MAPS_API_KEY</code> en tu <code>.env</code> local.</div>
            </div>
          </div>`;
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Auto center user on first fix (solo si el usuario no ha movido aún el mapa)
  useEffect(() => {
    if (!mapRef.current || !user || didCenterUserRef.current) return;
    if (userMovedRef.current) { didCenterUserRef.current = true; return; }
    mapRef.current.setCenter({ lat: user.lat, lng: user.lng });
    mapRef.current.setZoom(19);
    didCenterUserRef.current = true;
  }, [ready, user]);

  // Re-centrar cuando el padre incrementa recenterToken
  useEffect(() => {
    if (!mapRef.current || !user || recenterToken === undefined) return;
    userMovedRef.current = false;
    mapRef.current.panTo({ lat: user.lat, lng: user.lng });
    mapRef.current.setZoom(19);
    if (rotateWithHeading) {
      const deg = userBearing ?? 0;
      setMapHeading(mapRef.current, deg);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterToken]);

  // Encuadrar la ruta completa cuando el padre lo pide
  useEffect(() => {
    const map = mapRef.current;
    const libs = libsRef.current;
    if (!map || !libs || fitRouteToken === undefined) return;
    if (!route?.coords?.length) return;
    userMovedRef.current = false;
    const bounds = new libs.LatLngBounds();
    route.coords.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
    if (user) bounds.extend({ lat: user.lat, lng: user.lng });
    map.fitBounds(bounds, 80);

    if (!rotateWithHeading) {
      setMapHeading(map, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitRouteToken, rotateWithHeading]);

  // Rotar SIEMPRE el mapa cuando el padre active rotateWithHeading.
  // Esto no depende de followUser ni de si el usuario movió el mapa.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!rotateWithHeading) {
      setMapHeading(map, 0);
      return;
    }

    const deg = Number(userBearing ?? 0);

    if (Number.isFinite(deg)) {
      setMapHeading(map, deg);
    }
  }, [ready, rotateWithHeading, userBearing]);

  // Follow user: solo centra al usuario.
  // La rotación se maneja en otro useEffect para que no dependa del pan.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (followUser && user && !userMovedRef.current) {
      map.panTo({ lat: user.lat, lng: user.lng });
    }
  }, [ready, followUser, user]);

  // Static layers
  useEffect(() => {
    const map = mapRef.current;
    const libs = libsRef.current;
    if (!map || !libs) return;

    overlaysRef.current.markers.forEach((m) => (m.map = null));
    overlaysRef.current.polylines.forEach((p) => p.setMap(null));
    overlaysRef.current.polygons.forEach((p) => p.setMap(null));
    overlaysRef.current = { markers: [], polylines: [], polygons: [] };

    for (const b of buildings) {
      try {
        const ring = b.geom.coordinates[0].map(([lng, lat]) => ({ lat, lng }));
        const poly = new libs.Polygon({
          paths: ring,
          strokeColor: "#1f3d6b", strokeOpacity: 0.6, strokeWeight: 1,
          fillColor: "#1f3d6b", fillOpacity: 0.08,
          clickable: true, map,
        });
        poly.addListener("click", () => buildingClickRef.current?.(b));
        overlaysRef.current.polygons.push(poly);
      } catch { /* ignore */ }

      const m = new libs.AdvancedMarkerElement({
        map,
        position: { lat: b.centroid_lat, lng: b.centroid_lng },
        content: buildingMarkerEl(b.code ? `${b.code}` : b.name),
        title: b.name,
      });
      m.addListener("click", () => buildingClickRef.current?.(b));
      overlaysRef.current.markers.push(m);
    }

    for (const p of parkings) {
      try {
        const ring = p.geom.coordinates[0].map(([lng, lat]) => ({ lat, lng }));
        const poly = new libs.Polygon({
          paths: ring,
          strokeColor: "#1f4d8a", strokeOpacity: 0.7, strokeWeight: 1,
          fillColor: "#1f4d8a", fillOpacity: 0.15,
          clickable: false, map,
        });
        overlaysRef.current.polygons.push(poly);
      } catch { /* ignore */ }
      const m = new libs.AdvancedMarkerElement({
        map,
        position: { lat: p.centroid_lat, lng: p.centroid_lng },
        content: parkingMarkerEl(),
        title: `${p.name ?? "Parqueo"} (${p.type})`,
      });
      overlaysRef.current.markers.push(m);
    }

    for (const pa of paths) {
      try {
        const path = pa.geom.coordinates.map(([lng, lat]) => ({ lat, lng }));
        const isVehicle = pa.access_modes?.includes("vehicle");
        const status = (pa.status ?? "active") as FeatureStatus;
        const baseColor = isVehicle ? "#1f4d8a" : "#ff7a1a";
        const color = status === "active" ? baseColor : FEATURE_STATUS_COLOR[status];
        const opts: google.maps.PolylineOptions = {
          path,
          strokeColor: color,
          strokeOpacity: status === "active" ? 0.7 : 0.9,
          strokeWeight: isVehicle ? 5 : 4,
          map, clickable: false,
        };
        if (status !== "active" || !isVehicle) {
          opts.strokeOpacity = 0;
          opts.icons = [{
            icon: { path: "M 0,-1 0,1", strokeOpacity: 1, strokeColor: color, scale: isVehicle ? 3 : 2 },
            offset: "0",
            repeat: status !== "active" ? "16px" : "10px",
          }];
        }
        const line = new libs.Polyline(opts);
        overlaysRef.current.polylines.push(line);
      } catch { /* ignore */ }
    }

    for (const e of entrances) {
      const m = new libs.AdvancedMarkerElement({
        map,
        position: { lat: e.lat, lng: e.lng },
        content: entranceMarkerEl(),
        title: e.name ?? "Entrada",
      });
      overlaysRef.current.markers.push(m);
    }

    for (const ce of campusEntrances) {
      const m = new libs.AdvancedMarkerElement({
        map,
        position: { lat: ce.lat, lng: ce.lng },
        content: campusEntryMarkerEl(ce.entry_type),
        title: `${ce.name} (${ce.entry_type})`,
      });
      overlaysRef.current.markers.push(m);
    }

    for (const lm of landmarks) {
      const m = new libs.AdvancedMarkerElement({
        map,
        position: { lat: lm.lat, lng: lm.lng },
        content: landmarkMarkerEl(lm.kind),
        title: `${lm.name} · ${lm.kind}`,
      });
      overlaysRef.current.markers.push(m);
    }
  }, [ready, buildings, entrances, campusEntrances, parkings, paths, landmarks]);

  // User marker + accuracy circle
  useEffect(() => {
    const map = mapRef.current;
    const libs = libsRef.current;
    if (!map || !libs) return;
    if (!user) {
      if (userMarkerRef.current) { userMarkerRef.current.setMap(null); userMarkerRef.current = null; }
      if (accuracyCircleRef.current) { accuracyCircleRef.current.setMap(null); accuracyCircleRef.current = null; }
      return;
    }
    // Durante una ruta activa, el punto visual del usuario debe coincidir con
    // el primer punto REAL que se está dibujando en la polilínea. Así el
    // tigrillo, el orbe y el inicio de la ruta no se separan visualmente.
    const visualUser = user;
    if (!userMarkerRef.current) {
      userMarkerRef.current = createUserLocationOverlay(visualUser, userMode);
      userMarkerRef.current.setMap(map);
    } else {
      userMarkerRef.current.setPosition(visualUser);
      userMarkerRef.current.setMode(userMode);
    }

    // Círculo de precisión (estilo Google Maps): muestra al usuario el rango
    // real en el que el GPS lo está ubicando. Si el círculo es enorme, sabe
    // que su posición está mal y puede salir al exterior / esperar fix.
    const acc = userAccuracy && userAccuracy > 0 ? Math.min(userAccuracy, 200) : null;
    if (acc && acc > 8) {
      if (!accuracyCircleRef.current) {
        accuracyCircleRef.current = new libs.Circle({
          map,
          center: { lat: visualUser.lat, lng: visualUser.lng },
          radius: acc,
          strokeColor: "#1a73e8",
          strokeOpacity: 0.4,
          strokeWeight: 1,
          fillColor: "#1a73e8",
          fillOpacity: 0.12,
          clickable: false,
          zIndex: 5,
        });
      } else {
        accuracyCircleRef.current.setCenter({ lat: visualUser.lat, lng: visualUser.lng });
        accuracyCircleRef.current.setRadius(acc);
        accuracyCircleRef.current.setMap(map);
      }
    } else if (accuracyCircleRef.current) {
      accuracyCircleRef.current.setMap(null);
    }
  }, [ready, user, userMode, userAccuracy]);

  // Shared pin
  useEffect(() => {
    const map = mapRef.current;
    const libs = libsRef.current;
    if (!map || !libs) return;
    if (sharedMarkerRef.current) { sharedMarkerRef.current.map = null; sharedMarkerRef.current = null; }
    if (!sharedPin) return;
    sharedMarkerRef.current = new libs.AdvancedMarkerElement({
      map,
      position: { lat: sharedPin.lat, lng: sharedPin.lng },
      content: sharedPinEl(),
      title: "Ubicación compartida",
    });
    map.panTo({ lat: sharedPin.lat, lng: sharedPin.lng });
    map.setZoom(19);
  }, [ready, sharedPin]);

  // Route
  useEffect(() => {
    const map = mapRef.current;
    const libs = libsRef.current;
    if (!map || !libs) return;
    if (routePolyRef.current) { routePolyRef.current.setMap(null); routePolyRef.current = null; }
    if (!route?.coords?.length) return;
    const path = route.coords.map((c) => ({ lat: c.lat, lng: c.lng }));
    routePolyRef.current = new libs.Polyline({
      path,
      strokeColor: "#ff7a1a", strokeOpacity: 0.95, strokeWeight: 6,
      map, clickable: false,
    });
    // Solo encuadramos automáticamente la primera vez que aparece la ruta
    // (y el usuario aún no ha movido el mapa). Posteriores re-encuadres se
    // disparan desde el padre vía fitRouteToken.
    if (!isNavigating && !userMovedRef.current) {
      const bounds = new libs.LatLngBounds();
      path.forEach((p) => bounds.extend(p));
      map.fitBounds(bounds, 60);
    }
  }, [ready, route, isNavigating]);

  return <div ref={containerRef} className={className} style={{ width: "100%", height: "100%", position: "relative" }} />;
}

