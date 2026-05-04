// Parsea coordenadas en distintos formatos, especialmente las que se copian
// desde Google Maps (clic derecho → primera opción). También soporta URLs
// como https://www.google.com/maps/@-2.1509,-79.6011,18z y "lat,lng".
//
// Retorna null si no es posible interpretar la entrada.

export interface ParsedCoord { lat: number; lng: number }

export function parseGoogleMapsCoord(raw: string): ParsedCoord | null {
  if (!raw) return null;
  const text = raw.trim();

  // 1) URL de Google Maps con @lat,lng,zoom
  const urlMatch = text.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  if (urlMatch) {
    const lat = Number(urlMatch[1]);
    const lng = Number(urlMatch[2]);
    if (isValid(lat, lng)) return { lat, lng };
  }

  // 2) URL "?q=lat,lng" o "?ll=lat,lng"
  const qMatch = text.match(/[?&](?:q|ll|destination|center)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  if (qMatch) {
    const lat = Number(qMatch[1]);
    const lng = Number(qMatch[2]);
    if (isValid(lat, lng)) return { lat, lng };
  }

  // 3) Formato simple "lat,lng" o "lat lng" (con o sin espacios)
  const pair = text.match(/(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)/);
  if (pair) {
    const lat = Number(pair[1]);
    const lng = Number(pair[2]);
    if (isValid(lat, lng)) return { lat, lng };
  }

  return null;
}

function isValid(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) && Number.isFinite(lng) &&
    Math.abs(lat) <= 90 && Math.abs(lng) <= 180
  );
}
