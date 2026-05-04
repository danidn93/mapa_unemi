// Routing multimodal con Dijkstra. Las calles se "cortan" automáticamente:
// vértices cercanos (≤ SNAP_TOL_M) comparten el mismo nodo del grafo.
// Origen y destino se PROYECTAN al segmento de calle más cercano para evitar
// que el recorrido termine en el final de una calle.
import type { LatLng, MapPath, AccessMode, RouteResult, MapBuilding } from "@/types/map";
import { haversine, bearing, bearingToDirection, formatDistance } from "./geo";

const SNAP_TOL_M = 6;
const PRECISION = 5;
const SNAP_RADIUS_M = 80;

const rawKey = (p: LatLng) => `${p.lat.toFixed(PRECISION)},${p.lng.toFixed(PRECISION)}`;
const fromKey = (k: string): LatLng => {
  const [lat, lng] = k.split(",").map(Number);
  return { lat, lng };
};

interface Graph {
  adj: Map<string, Map<string, number>>;
  nodes: { key: string; pos: LatLng }[];
  nodePositions: Map<string, LatLng>;
  // segmentos para proyección punto→calle
  segments: { a: LatLng; b: LatLng; aKey: string; bKey: string }[];
}

interface BaseSegment {
  a: LatLng;
  b: LatLng;
  bidirectional: boolean;
}

function snapKey(p: LatLng, registry: { key: string; pos: LatLng }[]): string {
  for (const n of registry) {
    if (haversine(p, n.pos) <= SNAP_TOL_M) return n.key;
  }
  const k = rawKey(p);
  registry.push({ key: k, pos: p });
  return k;
}

function segmentIntersection(a: LatLng, b: LatLng, c: LatLng, d: LatLng): { point: LatLng; t: number } | null {
  const rx = b.lng - a.lng;
  const ry = b.lat - a.lat;
  const sx = d.lng - c.lng;
  const sy = d.lat - c.lat;
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-12) return null;
  const qpx = c.lng - a.lng;
  const qpy = c.lat - a.lat;
  const t = (qpx * sy - qpy * sx) / denom;
  const u = (qpx * ry - qpy * rx) / denom;
  if (t <= 1e-6 || t >= 1 - 1e-6 || u <= 1e-6 || u >= 1 - 1e-6) return null;
  return {
    point: { lat: a.lat + t * (b.lat - a.lat), lng: a.lng + t * (b.lng - a.lng) },
    t,
  };
}

function addSplitPoint(bucket: { point: LatLng; t: number }[], point: LatLng, t: number) {
  if (t <= 1e-6 || t >= 1 - 1e-6) return;
  if (bucket.some((x) => haversine(x.point, point) < 0.75)) return;
  bucket.push({ point, t });
}

function buildGraph(paths: MapPath[], mode: AccessMode): Graph {
  const adj = new Map<string, Map<string, number>>();
  const nodes: { key: string; pos: LatLng }[] = [];
  const segments: Graph["segments"] = [];
  const baseSegments: BaseSegment[] = [];
  const vertices: LatLng[] = [];
  const add = (a: string, b: string, w: number) => {
    if (!adj.has(a)) adj.set(a, new Map());
    const m = adj.get(a)!;
    if (!m.has(b) || m.get(b)! > w) m.set(b, w);
  };

  for (const p of paths) {
    if (!p.access_modes?.includes(mode)) continue;
    const coords = p.geom?.coordinates ?? [];
    for (let i = 0; i < coords.length; i++) {
      const v: LatLng = { lng: coords[i][0], lat: coords[i][1] };
      vertices.push(v);
      if (i > 0) {
        const a: LatLng = { lng: coords[i - 1][0], lat: coords[i - 1][1] };
        if (haversine(a, v) > 0.5) baseSegments.push({ a, b: v, bidirectional: p.bidirectional !== false });
      }
    }
  }

  const splitBuckets = baseSegments.map((s) => ([
    { point: s.a, t: 0 },
    { point: s.b, t: 1 },
  ]));

  // Si una calle termina sobre la línea de otra calle, cortamos esa línea en un nodo real.
  for (let i = 0; i < baseSegments.length; i++) {
    const s = baseSegments[i];
    for (const v of vertices) {
      const proj = projectOnSegment(v, s.a, s.b);
      if (proj.dist <= SNAP_TOL_M) addSplitPoint(splitBuckets[i], proj.point, proj.t);
    }
  }

  // Si dos calles se cruzan visualmente, también comparten nodo aunque nadie haya marcado el punto.
  for (let i = 0; i < baseSegments.length; i++) {
    for (let j = i + 1; j < baseSegments.length; j++) {
      const hit = segmentIntersection(baseSegments[i].a, baseSegments[i].b, baseSegments[j].a, baseSegments[j].b);
      if (!hit) continue;
      addSplitPoint(splitBuckets[i], hit.point, hit.t);
      const onJ = projectOnSegment(hit.point, baseSegments[j].a, baseSegments[j].b);
      addSplitPoint(splitBuckets[j], onJ.point, onJ.t);
    }
  }

  for (let i = 0; i < baseSegments.length; i++) {
    const s = baseSegments[i];
    const points = splitBuckets[i].sort((a, b) => a.t - b.t);
    for (let j = 0; j < points.length - 1; j++) {
      const a = points[j].point;
      const b = points[j + 1].point;
      if (haversine(a, b) <= 0.5) continue;
      const aKey = snapKey(a, nodes);
      const bKey = snapKey(b, nodes);
      if (aKey === bKey) continue;
      const w = haversine(a, b);
      add(aKey, bKey, w);
      if (s.bidirectional) add(bKey, aKey, w);
      segments.push({ a, b, aKey, bKey });
    }
  }

  return { adj, nodes, nodePositions: new Map(nodes.map((n) => [n.key, n.pos])), segments };
}

// Proyección de un punto sobre un segmento (en grados, equirect. local)
function projectOnSegment(p: LatLng, a: LatLng, b: LatLng): { point: LatLng; t: number; dist: number } {
  const latRef = (a.lat + b.lat) / 2;
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos((latRef * Math.PI) / 180);
  const ax = 0, ay = 0;
  const bx = (b.lng - a.lng) * mPerDegLng;
  const by = (b.lat - a.lat) * mPerDegLat;
  const px = (p.lng - a.lng) * mPerDegLng;
  const py = (p.lat - a.lat) * mPerDegLat;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? (px * dx + py * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + t * dx, qy = ay + t * dy;
  const point: LatLng = {
    lat: a.lat + (qy / mPerDegLat),
    lng: a.lng + (qx / mPerDegLng),
  };
  const dist = Math.hypot(px - qx, py - qy);
  return { point, t, dist };
}

function nearestProjection(graph: Graph, p: LatLng) {
  let best: { seg: Graph["segments"][0]; proj: ReturnType<typeof projectOnSegment> } | null = null;
  for (const s of graph.segments) {
    const proj = projectOnSegment(p, s.a, s.b);
    if (!best || proj.dist < best.proj.dist) best = { seg: s, proj };
  }
  return best;
}

function dijkstra(graph: Graph, start: string, goal: string, extraEdges?: Map<string, Map<string, number>>): string[] | null {
  const dist = new Map<string, number>();
  const prev = new Map<string, string>();
  const visited = new Set<string>();
  dist.set(start, 0);
  const getNbrs = (u: string) => {
    const a = graph.adj.get(u);
    const b = extraEdges?.get(u);
    if (!a && !b) return null;
    const m = new Map<string, number>(a ?? []);
    if (b) for (const [k, v] of b) if (!m.has(k) || m.get(k)! > v) m.set(k, v);
    return m;
  };

  while (true) {
    let u: string | null = null;
    let min = Infinity;
    for (const [n, d] of dist) {
      if (!visited.has(n) && d < min) { min = d; u = n; }
    }
    if (u === null) return null;
    if (u === goal) break;
    visited.add(u);
    const nbrs = getNbrs(u);
    if (!nbrs) continue;
    for (const [v, w] of nbrs) {
      if (visited.has(v)) continue;
      const alt = (dist.get(u) ?? Infinity) + w;
      if (alt < (dist.get(v) ?? Infinity)) {
        dist.set(v, alt);
        prev.set(v, u);
      }
    }
  }
  const path: string[] = [];
  let cur: string | undefined = goal;
  while (cur) { path.unshift(cur); cur = prev.get(cur); }
  if (path[0] !== start) return null;
  return path;
}

export function computeRoute(
  paths: MapPath[],
  origin: LatLng,
  destination: LatLng,
  mode: AccessMode,
  buildings: MapBuilding[] = [],
): RouteResult {
  // Excluir calles no transitables (cerradas o cerradas temporalmente).
  const usable = paths.filter((p) => p.status !== "closed" && p.status !== "temporary_closed");
  const graph = buildGraph(usable, mode);

  if (graph.segments.length === 0) {
    return unavailableStreetRoute(origin, mode);
  }

  const oProj = nearestProjection(graph, origin);
  const dProj = nearestProjection(graph, destination);
  if (!oProj || !dProj || oProj.proj.dist > 500 || dProj.proj.dist > 500) {
    return unavailableStreetRoute(origin, mode);
  }

  // Insertamos nodos virtuales para origen y destino conectados a ambos extremos del segmento proyectado
  const O_KEY = "__origin__";
  const D_KEY = "__dest__";
  const extra = new Map<string, Map<string, number>>();
  const link = (k: string, neigh: string, w: number) => {
    if (!extra.has(k)) extra.set(k, new Map());
    extra.get(k)!.set(neigh, w);
    if (!extra.has(neigh)) extra.set(neigh, new Map());
    extra.get(neigh)!.set(k, w);
  };
  // Origen
  link(O_KEY, oProj.seg.aKey, haversine(oProj.proj.point, oProj.seg.a) + oProj.proj.dist);
  link(O_KEY, oProj.seg.bKey, haversine(oProj.proj.point, oProj.seg.b) + oProj.proj.dist);
  // Destino (mismo segmento que origen → atajo directo)
  if (oProj.seg === dProj.seg) {
    const directOnSeg = haversine(oProj.proj.point, dProj.proj.point) + oProj.proj.dist + dProj.proj.dist;
    link(O_KEY, D_KEY, directOnSeg);
  }
  link(D_KEY, dProj.seg.aKey, haversine(dProj.proj.point, dProj.seg.a) + dProj.proj.dist);
  link(D_KEY, dProj.seg.bKey, haversine(dProj.proj.point, dProj.seg.b) + dProj.proj.dist);

  const nodePath = dijkstra(graph, O_KEY, D_KEY, extra);
  if (!nodePath) return unavailableStreetRoute(origin, mode);

  const coords: LatLng[] = nodePath.map((k) => {
    if (k === O_KEY) return oProj.proj.point;
    if (k === D_KEY) return dProj.proj.point;
    return graph.nodePositions.get(k) ?? fromKey(k);
  });
  // Anteponemos la posición real del usuario y agregamos el destino real al final
  const full: LatLng[] = [origin, ...coords, destination];
  // Deduplicar puntos consecutivos muy cercanos
  const dedup: LatLng[] = [];
  for (const c of full) {
    const last = dedup[dedup.length - 1];
    if (!last || haversine(last, c) > 1) dedup.push(c);
  }
  // No aplicamos atajos ni smoothing: la ruta debe seguir exactamente las calles dibujadas.
  return buildResult(dedup, mode);
}

function unavailableStreetRoute(origin: LatLng, mode: AccessMode): RouteResult {
  const speed = mode === "vehicle" ? 8 : 1.4;
  return {
    distance: 0,
    duration: 0 / speed,
    coords: [],
    steps: [{
      instruction: "No hay una conexión por calles dibujadas hasta este destino",
      distance: 0,
      lat: origin.lat,
      lng: origin.lng,
    }],
  };
}

function buildResult(coords: LatLng[], mode: AccessMode): RouteResult {
  let distance = 0;
  const steps: RouteResult["steps"] = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const seg = haversine(coords[i], coords[i + 1]);
    distance += seg;
    if (i === 0 || seg > 25) {
      const dir = bearingToDirection(bearing(coords[i], coords[i + 1]));
      steps.push({
        instruction: i === 0
          ? `Avanza hacia el ${dir} por ${formatDistance(seg)}`
          : `Continúa hacia el ${dir} por ${formatDistance(seg)}`,
        distance: seg,
        lat: coords[i + 1].lat,
        lng: coords[i + 1].lng,
      });
    }
  }
  steps.push({
    instruction: "Has llegado a tu destino",
    distance: 0,
    lat: coords[coords.length - 1].lat,
    lng: coords[coords.length - 1].lng,
  });
  const speed = mode === "vehicle" ? 8 : 1.4;
  return { distance, duration: distance / speed, coords, steps };
}

export { SNAP_RADIUS_M, SNAP_TOL_M };
