import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type {
  AccessMode, FeatureStatus, LatLng, MapBuilding, MapCampusEntrance, MapEntrance,
  MapLandmark, MapParking, MapPath, RouteResult,
} from "@/types/map";
import { FEATURE_STATUS_COLOR, FEATURE_STATUS_LABEL } from "@/types/map";
import { UNEMI_CENTER } from "@/lib/geo";
import tigrilloWalk from "@/assets/tigrillo-walk.png";
import tigrilloCar from "@/assets/tigrillo-car.png";

// Estilos para rotación tipo Google Maps. Rotamos los panes "tile" y "overlay"
// y contra-rotamos los marcadores para que iconos y textos queden derechos.
const ROTATE_STYLE_ID = "leaflet-rotate-style";
function ensureRotateStyle() {
  if (typeof document === "undefined") return;
  if (document.getElementById(ROTATE_STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = ROTATE_STYLE_ID;
  s.textContent = `
    .leaflet-rotate-pane { transform-origin: 50% 50%; transition: transform .25s linear; }
    .leaflet-marker-icon.leaflet-counter-rotate { transition: transform .25s linear; }
  `;
  document.head.appendChild(s);
}

// Fix iconos por defecto Leaflet en Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const userIcon = (mode: AccessMode = "pedestrian") => {
  const img = mode === "vehicle" ? tigrilloCar : tigrilloWalk;
  const size = mode === "vehicle" ? 64 : 56;
  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;display:grid;place-items:center;filter:drop-shadow(0 4px 6px rgba(0,0,0,.35))">
      <div style="position:absolute;width:18px;height:18px;border-radius:50%;background:hsl(22 100% 55% / .35);box-shadow:0 0 0 6px hsl(22 100% 55% / .15);bottom:0"></div>
      <img src="${img}" alt="tú" style="width:100%;height:100%;object-fit:contain;pointer-events:none" />
    </div>`,
    iconSize: [size, size], iconAnchor: [size / 2, size - 6],
  });
};


const buildingIcon = (label: string) => L.divIcon({
  className: "",
  html: `<div style="background:hsl(0 0% 100% / .92);color:hsl(215 85% 25%);padding:4px 10px;border-radius:8px;font-size:12px;font-weight:700;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,.25);border:1px solid hsl(215 85% 25% / .3)">${label}</div>`,
  iconSize: [10, 10], iconAnchor: [0, 0],
});

const parkingIcon = L.divIcon({
  className: "",
  html: `<div style="width:26px;height:26px;border-radius:6px;background:hsl(215 70% 30%);color:white;display:grid;place-items:center;font-weight:700;border:2px solid white">P</div>`,
  iconSize: [26, 26], iconAnchor: [13, 13],
});

const campusEntryIcon = (type: "pedestrian" | "vehicle" | "mixed") => {
  const colors = {
    pedestrian: "hsl(142 70% 42%)",
    vehicle: "hsl(215 80% 45%)",
    mixed: "hsl(280 65% 50%)",
  };
  const symbols = { pedestrian: "🚶", vehicle: "🚗", mixed: "⛩" };
  return L.divIcon({
    className: "",
    html: `<div style="width:32px;height:32px;border-radius:50%;background:${colors[type]};border:3px solid white;display:grid;place-items:center;font-size:16px;box-shadow:0 4px 10px rgba(0,0,0,.3)">${symbols[type]}</div>`,
    iconSize: [32, 32], iconAnchor: [16, 16],
  });
};

const sharedPinIcon = L.divIcon({
  className: "",
  html: `<div style="width:28px;height:28px;border-radius:50% 50% 50% 0;background:hsl(0 80% 55%);border:3px solid white;transform:rotate(-45deg);box-shadow:0 4px 12px rgba(0,0,0,.4)"></div>`,
  iconSize: [28, 28], iconAnchor: [14, 28],
});

const LANDMARK_STYLE: Record<string, { bg: string; emoji: string }> = {
  reference: { bg: "hsl(45 90% 50%)", emoji: "📍" },
  plaza:     { bg: "hsl(160 60% 45%)", emoji: "🌳" },
  corridor:  { bg: "hsl(200 50% 50%)", emoji: "🚶‍♂️" },
  restroom:  { bg: "hsl(220 60% 55%)", emoji: "🚻" },
  cafeteria: { bg: "hsl(25 80% 50%)",  emoji: "☕" },
  bar:       { bg: "hsl(340 70% 55%)", emoji: "🍔" },
  atm:       { bg: "hsl(140 60% 40%)", emoji: "🏧" },
  emergency: { bg: "hsl(0 80% 50%)",   emoji: "🚨" },
  other:     { bg: "hsl(0 0% 45%)",    emoji: "•" },
};
const landmarkIcon = (kind: string) => {
  const s = LANDMARK_STYLE[kind] ?? LANDMARK_STYLE.other;
  return L.divIcon({
    className: "",
    html: `<div style="width:28px;height:28px;border-radius:50%;background:${s.bg};border:2px solid white;display:grid;place-items:center;font-size:14px;box-shadow:0 3px 8px rgba(0,0,0,.3)">${s.emoji}</div>`,
    iconSize: [28, 28], iconAnchor: [14, 14],
  });
};

type FeatureKind = "building" | "parking" | "entrance" | "campus-entry" | "path" | "landmark";
type FeatureEditTarget =
  | { kind: "building"; data: MapBuilding }
  | { kind: "parking"; data: MapParking }
  | { kind: "entrance"; data: MapEntrance }
  | { kind: "campus-entry"; data: MapCampusEntrance }
  | { kind: "path"; data: MapPath }
  | { kind: "landmark"; data: MapLandmark };

interface Props {
  buildings: MapBuilding[];
  entrances: MapEntrance[];
  campusEntrances?: MapCampusEntrance[];
  parkings: MapParking[];
  paths: MapPath[];
  landmarks?: MapLandmark[];
  user?: LatLng | null;
  userMode?: AccessMode;
  /** Rumbo del usuario en grados (0=N). Si se provee y followUser=true, el mapa rota. */
  userBearing?: number | null;
  /** Si true, el mapa centra al usuario y rota según userBearing (modo Google Maps). */
  followUser?: boolean;
  route?: RouteResult | null;
  drawingPoints?: LatLng[];
  drawingMode?: "polygon" | "line" | "point" | null;
  sharedPin?: LatLng | null;
  /** Cuando hay drawingMode activo, los polígonos/markers NO interceptan clic. */
  editing?: boolean;
  onBuildingClick?: (b: MapBuilding) => void;
  onMapClick?: (p: LatLng) => void;
  /** Permite abrir editor desde popup del mapa (modo admin). */
  onFeatureEdit?: (target: FeatureEditTarget) => void;
  onFeatureDelete?: (table: string, id: string, label: string) => void;
  /** Cambio rápido de estado de una calle (cuando hay filtro activo). */
  onPathQuickStatus?: (path: MapPath, status: FeatureStatus) => void;
  showQuickStatus?: boolean;
  /** Vértices de calles existentes a destacar como puntos clickeables (modo dibujo de calles). */
  snapVertices?: LatLng[];
  className?: string;
}

export function CampusMap({
  buildings, entrances, campusEntrances = [], parkings, paths, landmarks = [], user, userMode = "pedestrian",
  userBearing = null, followUser = false, route,
  drawingPoints, drawingMode, sharedPin, editing,
  onBuildingClick, onMapClick, onFeatureEdit, onFeatureDelete,
  onPathQuickStatus, showQuickStatus, snapVertices, className,
}: Props) {
  const quickStatusRef = useRef<typeof onPathQuickStatus>();
  quickStatusRef.current = onPathQuickStatus;
  const showQuickStatusRef = useRef<boolean>(false);
  showQuickStatusRef.current = !!showQuickStatus;
  const mapRef = useRef<HTMLDivElement>(null);
  const lmap = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const drawLayer = useRef<L.LayerGroup | null>(null);
  const userMarker = useRef<L.Marker | null>(null);
  const routeLine = useRef<L.Polyline | null>(null);
  const sharedMarker = useRef<L.Marker | null>(null);
  const clickHandler = useRef<((p: LatLng) => void) | null>(null);
  const didCenterUser = useRef<boolean>(false);
  const currentRotation = useRef<number>(0);

  // Mantener handler actualizado sin re-init
  clickHandler.current = onMapClick ?? null;

  // init
  useEffect(() => {
    ensureRotateStyle();
    if (!mapRef.current || lmap.current) return;
    const m = L.map(mapRef.current, {
      zoomControl: true, attributionControl: true,
      maxZoom: 19, minZoom: 3,
    }).setView([UNEMI_CENTER.lat, UNEMI_CENTER.lng], 18);
    // Mapa estándar OpenStreetMap. OSM solo sirve hasta z=19; pedir z=20 da 400.
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, maxNativeZoom: 19, minZoom: 3,
      attribution: "© OpenStreetMap",
      errorTileUrl: "data:image/gif;base64,R0lGODlhAQABAIAAAO7u7v///yH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==",
    }).addTo(m);
    // Marcamos los panes que rotan (solo tiles y overlays vectoriales).
    // markerPane se mantiene SIN rotar para que iconos y tooltips queden derechos.
    m.getPane("tilePane")?.classList.add("leaflet-rotate-pane");
    m.getPane("overlayPane")?.classList.add("leaflet-rotate-pane");

    layerRef.current = L.layerGroup().addTo(m);
    drawLayer.current = L.layerGroup().addTo(m);
    lmap.current = m;
    m.on("click", (e) => {
      clickHandler.current?.({ lat: e.latlng.lat, lng: e.latlng.lng });
    });
    return () => { m.remove(); lmap.current = null; };
  }, []);

  // Auto-centrado: la primera vez que llega la ubicación, centramos en el usuario.
  useEffect(() => {
    if (!lmap.current || !user || didCenterUser.current) return;
    lmap.current.setView([user.lat, user.lng], 19, { animate: true });
    didCenterUser.current = true;
  }, [user]);

  // Modo "seguir al usuario": centrar continuamente y rotar mapa según rumbo.
  useEffect(() => {
    if (!lmap.current) return;
    const panes = ["tilePane", "overlayPane"]
      .map((n) => lmap.current!.getPane(n))
      .filter(Boolean) as HTMLElement[];

    if (followUser && user) {
      lmap.current.panTo([user.lat, user.lng], { animate: true });
      const deg = userBearing ?? 0;
      currentRotation.current = deg;
      const rot = `rotate(${-deg}deg)`;
      panes.forEach((p) => { p.style.transform = rot; });
    } else {
      currentRotation.current = 0;
      panes.forEach((p) => { p.style.transform = ""; });
    }
  }, [followUser, user, userBearing]);


  // popup helper para edición admin
  const adminPopup = (kind: FeatureKind, data: any, label: string, table: string) => {
    if (!onFeatureEdit && !onFeatureDelete) return null;
    const id = `pop-${kind}-${data.id}`;
    const html = `
      <div style="min-width:180px;font-family:inherit">
        <div style="font-weight:600;margin-bottom:6px">${label}</div>
        <div style="display:flex;gap:6px">
          <button id="${id}-edit" style="flex:1;padding:6px 8px;border-radius:6px;border:1px solid #ddd;background:#fff;cursor:pointer;font-size:12px">✏️ Editar</button>
          <button id="${id}-del" style="flex:1;padding:6px 8px;border-radius:6px;border:1px solid #fca5a5;background:#fee2e2;color:#b91c1c;cursor:pointer;font-size:12px">🗑 Eliminar</button>
        </div>
      </div>`;
    setTimeout(() => {
      document.getElementById(`${id}-edit`)?.addEventListener("click", () => {
        onFeatureEdit?.({ kind, data } as FeatureEditTarget);
        lmap.current?.closePopup();
      });
      document.getElementById(`${id}-del`)?.addEventListener("click", () => {
        onFeatureDelete?.(table, data.id, label);
        lmap.current?.closePopup();
      });
    }, 0);
    return html;
  };

  const bindAdmin = (layer: L.Layer, kind: FeatureKind, data: any, label: string, table: string) => {
    if (!onFeatureEdit && !onFeatureDelete) return;
    layer.on("click", (ev: any) => {
      L.DomEvent.stopPropagation(ev);
      const html = adminPopup(kind, data, label, table);
      if (!html) return;
      const latlng = ev.latlng ?? (data.lat != null ? L.latLng(data.lat, data.lng) :
                                  L.latLng(data.centroid_lat, data.centroid_lng));
      L.popup({ closeButton: true }).setLatLng(latlng).setContent(html).openOn(lmap.current!);
    });
  };

  // capas estáticas
  useEffect(() => {
    if (!layerRef.current) return;
    layerRef.current.clearLayers();

    // edificios
    for (const b of buildings) {
      const m = L.marker([b.centroid_lat, b.centroid_lng], {
        icon: buildingIcon(b.code ? `Bloque ${b.code}` : b.name),
        interactive: !editing,
      });
      m.addTo(layerRef.current!);
      if (!editing) {
        if (onFeatureEdit || onFeatureDelete) {
          bindAdmin(m, "building", b, b.name, "map_buildings");
        } else {
          m.on("click", () => onBuildingClick?.(b));
        }
      }
    }

    // entradas de edificio
    for (const e of entrances) {
      const cm = L.circleMarker([e.lat, e.lng], {
        radius: 7, color: "white", weight: 2, fillColor: "hsl(142 70% 42%)", fillOpacity: 1,
        interactive: !editing,
      }).bindTooltip(e.name ?? "Entrada").addTo(layerRef.current!);
      if (!editing) bindAdmin(cm, "entrance", e, e.name ?? "Entrada", "map_entrances");
    }

    // entradas de la universidad
    for (const ce of campusEntrances) {
      const cm = L.marker([ce.lat, ce.lng], {
        icon: campusEntryIcon(ce.entry_type),
        interactive: !editing,
      }).bindTooltip(`${ce.name} (${ce.entry_type})`).addTo(layerRef.current!);
      if (!editing) bindAdmin(cm, "campus-entry", ce, ce.name, "map_campus_entrances");
    }

    // parqueos
    for (const p of parkings) {
      const cm = L.marker([p.centroid_lat, p.centroid_lng], {
        icon: parkingIcon, interactive: !editing,
      }).bindTooltip(`${p.name ?? "Parqueo"} (${p.type})`).addTo(layerRef.current!);
      if (!editing) bindAdmin(cm, "parking", p, p.name ?? "Parqueo", "map_parkings");
    }

    // paths
    for (const pa of paths) {
      try {
        const ll = pa.geom.coordinates.map(([lng, lat]) => [lat, lng]) as [number, number][];
        const isVehicle = pa.access_modes?.includes("vehicle");
        const status = (pa.status ?? "active") as FeatureStatus;
        const baseColor = isVehicle ? "hsl(215 70% 30%)" : "hsl(22 100% 55%)";
        const color = status === "active" ? baseColor : FEATURE_STATUS_COLOR[status];
        const line = L.polyline(ll, {
          color, weight: isVehicle ? 5 : 4,
          opacity: status === "active" ? 0.7 : 0.9,
          dashArray: status !== "active" ? "10 6" : (isVehicle ? undefined : "6 6"),
          interactive: !editing,
        }).addTo(layerRef.current!);
        const label = `${pa.name ?? `Calle ${isVehicle ? "vehicular" : "peatonal"}`} · ${FEATURE_STATUS_LABEL[status]}`;
        line.bindTooltip(label);
        if (!editing) {
          if (showQuickStatusRef.current && quickStatusRef.current) {
            line.on("click", (ev: any) => {
              L.DomEvent.stopPropagation(ev);
              const id = `qs-${pa.id}`;
              const opts: FeatureStatus[] = ["active", "maintenance", "temporary_closed", "closed"];
              const html = `
                <div style="min-width:200px;font-family:inherit">
                  <div style="font-weight:600;margin-bottom:4px">${pa.name ?? (isVehicle ? "Calle vehicular" : "Calle peatonal")}</div>
                  <div style="font-size:11px;color:#666;margin-bottom:6px">Estado actual: <b>${FEATURE_STATUS_LABEL[status]}</b></div>
                  <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">
                    ${opts.map((o) => `<button id="${id}-${o}" style="padding:5px;border-radius:5px;border:1px solid #ddd;background:${o === status ? "#eef" : "#fff"};cursor:pointer;font-size:11px">${FEATURE_STATUS_LABEL[o]}</button>`).join("")}
                  </div>
                </div>`;
              setTimeout(() => {
                opts.forEach((o) => {
                  document.getElementById(`${id}-${o}`)?.addEventListener("click", () => {
                    quickStatusRef.current?.(pa, o);
                    lmap.current?.closePopup();
                  });
                });
              }, 0);
              L.popup({ closeButton: true }).setLatLng(ev.latlng).setContent(html).openOn(lmap.current!);
            });
          } else {
            bindAdmin(line, "path", pa, pa.name ?? `Calle ${isVehicle ? "vehicular" : "peatonal"}`, "map_paths");
          }
        }
      } catch { /* ignore */ }
    }

    // landmarks (puntos de referencia)
    for (const lm of landmarks) {
      const cm = L.marker([lm.lat, lm.lng], {
        icon: landmarkIcon(lm.kind),
        interactive: !editing,
      }).bindTooltip(`${lm.name} · ${lm.kind}`).addTo(layerRef.current!);
      if (!editing) bindAdmin(cm, "landmark", lm, lm.name, "map_landmarks");
    }
  }, [buildings, entrances, campusEntrances, parkings, paths, landmarks, editing, onBuildingClick, onFeatureEdit, onFeatureDelete]);

  // capa de dibujo en progreso (incluye vértices "snap" cuando dibujamos calles)
  useEffect(() => {
    if (!drawLayer.current) return;
    drawLayer.current.clearLayers();

    // Vértices clickeables de la red existente (modo calle)
    if (drawingMode === "line" && snapVertices && snapVertices.length > 0) {
      for (const v of snapVertices) {
        const cm = L.circleMarker([v.lat, v.lng], {
          radius: 8, color: "hsl(22 100% 55%)", weight: 3,
          fillColor: "white", fillOpacity: 1, interactive: true,
        }).bindTooltip("🔗 Clic para conectar aquí", { direction: "top" })
          .addTo(drawLayer.current!);
        cm.on("click", (ev: any) => {
          L.DomEvent.stopPropagation(ev);
          clickHandler.current?.({ lat: v.lat, lng: v.lng });
        });
      }
    }
    // Aristas "hot zone" — capa transparente ancha sobre cada calle para que
    // el clic se pegue a la línea aunque el usuario falle por unos píxeles.
    if (drawingMode === "line" && paths && paths.length > 0) {
      for (const pa of paths) {
        try {
          const ll = pa.geom.coordinates.map(([lng, lat]) => [lat, lng]) as [number, number][];
          const hl = L.polyline(ll, {
            color: "hsl(22 100% 55%)", weight: 14, opacity: 0.001, interactive: true,
          }).addTo(drawLayer.current!);
          hl.on("click", (ev: any) => {
            L.DomEvent.stopPropagation(ev);
            clickHandler.current?.({ lat: ev.latlng.lat, lng: ev.latlng.lng });
          });
        } catch { /* ignore */ }
      }
    }

    if (!drawingPoints || drawingPoints.length === 0) return;
    const ll = drawingPoints.map((p) => [p.lat, p.lng]) as [number, number][];
    if (drawingMode === "polygon" && ll.length >= 2) {
      L.polygon([...ll, ll[0]], {
        color: "hsl(22 100% 55%)", weight: 2, dashArray: "4 4", fillOpacity: 0.15, interactive: false,
      }).addTo(drawLayer.current);
    } else if (drawingMode === "line" && ll.length >= 2) {
      L.polyline(ll, {
        color: "hsl(22 100% 55%)", weight: 4, dashArray: "6 6", interactive: false,
      }).addTo(drawLayer.current);
    }
    drawingPoints.forEach((p, i) => {
      L.circleMarker([p.lat, p.lng], {
        radius: 7, color: "white", weight: 2, fillColor: "hsl(22 100% 55%)", fillOpacity: 1,
        interactive: false,
      }).bindTooltip(`${i + 1}`, { permanent: true, direction: "top", className: "draw-pt-label" })
        .addTo(drawLayer.current!);
    });
  }, [drawingPoints, drawingMode, snapVertices, paths]);

  // user
  useEffect(() => {
    if (!lmap.current) return;
    if (!user) {
      userMarker.current?.remove();
      userMarker.current = null;
      return;
    }
    const icon = userIcon(userMode);
    if (!userMarker.current) {
      userMarker.current = L.marker([user.lat, user.lng], { icon, interactive: false, zIndexOffset: 1000 })
        .addTo(lmap.current);
    } else {
      userMarker.current.setLatLng([user.lat, user.lng]);
      userMarker.current.setIcon(icon);
    }
  }, [user, userMode]);

  // shared pin (?share=lat,lng)
  useEffect(() => {
    if (!lmap.current) return;
    sharedMarker.current?.remove();
    sharedMarker.current = null;
    if (!sharedPin) return;
    sharedMarker.current = L.marker([sharedPin.lat, sharedPin.lng], { icon: sharedPinIcon })
      .bindTooltip("Ubicación compartida", { permanent: true, direction: "top" })
      .addTo(lmap.current);
    lmap.current.setView([sharedPin.lat, sharedPin.lng], 19);
  }, [sharedPin]);

  // route
  useEffect(() => {
    if (!lmap.current) return;
    routeLine.current?.remove();
    routeLine.current = null;
    if (!route?.coords?.length) return;
    const ll = route.coords.map((c) => [c.lat, c.lng] as [number, number]);
    routeLine.current = L.polyline(ll, {
      color: "hsl(22 100% 55%)", weight: 6, opacity: 0.9, interactive: false,
    }).addTo(lmap.current);
    lmap.current.fitBounds(routeLine.current.getBounds(), { padding: [60, 60], maxZoom: 19 });
  }, [route]);

  return <div ref={mapRef} className={className} style={{ width: "100%", height: "100%" }} />;
}
