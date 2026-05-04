// Helpers de snapping y line-of-sight para edición y routing.
import type { LatLng, MapPath, MapBuilding } from "@/types/map";
import { haversine } from "./geo";

export const SNAP_VERTEX_M = 8;     // tolerancia para "pegarse" a un vértice existente
export const SNAP_SEGMENT_M = 5;    // tolerancia para "pegarse" a un segmento

/** Devuelve TODOS los vértices únicos de las calles (para mostrarlos como puntos clickeables). */
export function collectPathVertices(paths: MapPath[]): LatLng[] {
  const seen = new Set<string>();
  const out: LatLng[] = [];
  for (const p of paths) {
    const cs = p.geom?.coordinates ?? [];
    for (const [lng, lat] of cs) {
      const k = `${lat.toFixed(6)},${lng.toFixed(6)}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ lat, lng });
    }
  }
  return out;
}

function projectOnSegment(p: LatLng, a: LatLng, b: LatLng) {
  const latRef = (a.lat + b.lat) / 2;
  const mLat = 111320;
  const mLng = 111320 * Math.cos((latRef * Math.PI) / 180);
  const ax = 0, ay = 0;
  const bx = (b.lng - a.lng) * mLng;
  const by = (b.lat - a.lat) * mLat;
  const px = (p.lng - a.lng) * mLng;
  const py = (p.lat - a.lat) * mLat;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? (px * dx + py * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + t * dx, qy = ay + t * dy;
  return {
    point: {
      lat: a.lat + qy / mLat,
      lng: a.lng + qx / mLng,
    } as LatLng,
    dist: Math.hypot(px - qx, py - qy),
  };
}

/**
 * Snap de un punto a la red de calles:
 *  1) Si hay un vértice dentro de SNAP_VERTEX_M → devuelve ese vértice.
 *  2) Si hay un segmento dentro de SNAP_SEGMENT_M → devuelve la proyección.
 *  3) Si no, devuelve el punto original.
 */
export function snapToPaths(
  p: LatLng,
  paths: MapPath[],
  opts?: { vertexTol?: number; segmentTol?: number }
): { point: LatLng; snapped: "vertex" | "segment" | "none" } {
  const vTol = opts?.vertexTol ?? SNAP_VERTEX_M;
  const sTol = opts?.segmentTol ?? SNAP_SEGMENT_M;

  // 1) vértice más cercano
  let bestV: { pt: LatLng; d: number } | null = null;
  for (const path of paths) {
    for (const [lng, lat] of path.geom?.coordinates ?? []) {
      const v = { lat, lng };
      const d = haversine(p, v);
      if (!bestV || d < bestV.d) bestV = { pt: v, d };
    }
  }
  if (bestV && bestV.d <= vTol) return { point: bestV.pt, snapped: "vertex" };

  // 2) segmento más cercano
  let bestS: { pt: LatLng; d: number } | null = null;
  for (const path of paths) {
    const cs = path.geom?.coordinates ?? [];
    for (let i = 0; i < cs.length - 1; i++) {
      const a = { lng: cs[i][0], lat: cs[i][1] };
      const b = { lng: cs[i + 1][0], lat: cs[i + 1][1] };
      const proj = projectOnSegment(p, a, b);
      if (!bestS || proj.dist < bestS.d) bestS = { pt: proj.point, d: proj.dist };
    }
  }
  if (bestS && bestS.d <= sTol) return { point: bestS.pt, snapped: "segment" };

  return { point: p, snapped: "none" };
}

// ---------- Line-of-sight contra polígonos de edificios ----------

function segmentsIntersect(p1: LatLng, p2: LatLng, p3: LatLng, p4: LatLng): boolean {
  const d = (p2.lng - p1.lng) * (p4.lat - p3.lat) - (p2.lat - p1.lat) * (p4.lng - p3.lng);
  if (Math.abs(d) < 1e-12) return false;
  const t = ((p3.lng - p1.lng) * (p4.lat - p3.lat) - (p3.lat - p1.lat) * (p4.lng - p3.lng)) / d;
  const u = ((p3.lng - p1.lng) * (p2.lat - p1.lat) - (p3.lat - p1.lat) * (p2.lng - p1.lng)) / d;
  return t > 0.001 && t < 0.999 && u > 0.001 && u < 0.999;
}

function pointInRing(p: LatLng, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = (yi > p.lat) !== (yj > p.lat) &&
      p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi + 1e-18) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** ¿El segmento A→B atraviesa algún polígono de edificio activo (no solo lo toca)? */
export function segmentCrossesBuilding(a: LatLng, b: LatLng, buildings: MapBuilding[]): boolean {
  for (const bld of buildings) {
    if (bld.is_active === false) continue;
    if (bld.status && bld.status !== "active") continue;
    const rings = bld.geom?.coordinates ?? [];
    if (rings.length === 0) continue;
    const ring = rings[0];
    // Si el midpoint está dentro → cruza
    const mid = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
    if (pointInRing(mid, ring)) return true;
    // O si cruza alguna arista
    for (let i = 0; i < ring.length - 1; i++) {
      const e1 = { lng: ring[i][0], lat: ring[i][1] };
      const e2 = { lng: ring[i + 1][0], lat: ring[i + 1][1] };
      if (segmentsIntersect(a, b, e1, e2)) return true;
    }
  }
  return false;
}
