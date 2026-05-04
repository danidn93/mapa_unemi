import { useCallback, useEffect, useRef, useState } from "react";
import type { LatLng } from "@/types/map";
import { bearing as calcBearing, haversine } from "@/lib/geo";

// iOS Safari suele entregar las primeras lecturas con accuracy ~65 m antes de
// estabilizarse en 5–10 m. Si filtramos demasiado fuerte el usuario queda sin
// posición varios segundos. Subimos el umbral y usamos un fallback más corto.
const MAX_ACCEPTABLE_ACCURACY_M = 80;
const FALLBACK_AFTER_MS = 4000;
// Suavizado más ligero para que el avatar no se sienta "atrasado" al caminar.
const SMOOTHING_ALPHA = 0.7;

function smooth(prev: LatLng | null, next: LatLng, alpha = SMOOTHING_ALPHA): LatLng {
  if (!prev) return next;
  if (haversine(prev, next) > 50) return next;
  return {
    lat: prev.lat * (1 - alpha) + next.lat * alpha,
    lng: prev.lng * (1 - alpha) + next.lng * alpha,
  };
}

interface IOSDeviceOrientationEvent extends DeviceOrientationEvent {
  webkitCompassHeading?: number;
}
interface IOSDeviceOrientationEventCtor {
  requestPermission?: () => Promise<"granted" | "denied">;
}

export function useGeolocation() {
  const [position, setPosition] = useState<LatLng | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [watching, setWatching] = useState(false);
  const [compassEnabled, setCompassEnabled] = useState(false);
  const [needsCompassPermission, setNeedsCompassPermission] = useState(false);
  const lastRawRef = useRef<LatLng | null>(null);
  const lastSmoothedRef = useRef<LatLng | null>(null);
  const lastAcceptedAtRef = useRef<number>(0);
  const compassHeadingRef = useRef<number | null>(null);

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setError("Geolocalización no soportada");
      return;
    }
    setWatching(true);

    const handle = (pos: GeolocationPosition) => {
      const acc = pos.coords.accuracy ?? 9999;
      const raw: LatLng = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      const now = Date.now();

      const tooInaccurate = acc > MAX_ACCEPTABLE_ACCURACY_M;
      const waitedTooLong = now - lastAcceptedAtRef.current > FALLBACK_AFTER_MS;
      if (tooInaccurate && !waitedTooLong && lastSmoothedRef.current) {
        setAccuracy(acc);
        return;
      }

      const smoothed = smooth(lastSmoothedRef.current, raw);
      lastSmoothedRef.current = smoothed;
      lastAcceptedAtRef.current = now;

      setPosition(smoothed);
      setAccuracy(acc);

      // Prioridad para heading: brújula nativa (iOS/Android) > heading GPS > calculado por desplazamiento.
      if (compassHeadingRef.current != null) {
        setHeading(compassHeadingRef.current);
      } else {
        const nativeHeading = pos.coords.heading;
        const speed = pos.coords.speed ?? 0;
        if (nativeHeading != null && !Number.isNaN(nativeHeading) && speed > 0.5) {
          setHeading(nativeHeading);
        } else if (lastRawRef.current && haversine(lastRawRef.current, raw) > 3) {
          setHeading(calcBearing(lastRawRef.current, raw));
        }
      }

      lastRawRef.current = raw;
      setError(null);
    };

    const onError = (err: GeolocationPositionError) => setError(err.message);

    navigator.geolocation.getCurrentPosition(handle, onError, {
      enableHighAccuracy: true, maximumAge: 0, timeout: 10000,
    });
    const id = navigator.geolocation.watchPosition(handle, onError, {
      enableHighAccuracy: true, maximumAge: 1000, timeout: 20000,
    });

    // Detección iOS: si DeviceOrientationEvent.requestPermission existe, hace
    // falta gesto del usuario para activar la brújula.
    const Ctor = (window as unknown as { DeviceOrientationEvent?: IOSDeviceOrientationEventCtor }).DeviceOrientationEvent;
    if (Ctor && typeof Ctor.requestPermission === "function") {
      setNeedsCompassPermission(true);
    } else if (typeof window !== "undefined" && "DeviceOrientationEvent" in window) {
      // Android / navegadores sin permiso explícito: nos suscribimos directo.
      attachOrientation();
    }

    return () => {
      navigator.geolocation.clearWatch(id);
      detachOrientation();
      setWatching(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onOrientation = useRef((e: IOSDeviceOrientationEvent) => {
    let h: number | null = null;
    if (typeof e.webkitCompassHeading === "number") {
      h = e.webkitCompassHeading; // iOS: 0 = norte, sentido horario.
    } else if (e.alpha != null) {
      // Android: alpha 0 = norte cuando absolute=true; invertimos sentido.
      h = (360 - e.alpha) % 360;
    }
    if (h != null && !Number.isNaN(h)) {
      compassHeadingRef.current = h;
      setHeading(h);
    }
  }).current;

  const attachOrientation = useCallback(() => {
    window.addEventListener("deviceorientationabsolute", onOrientation as EventListener, true);
    window.addEventListener("deviceorientation", onOrientation as EventListener, true);
    setCompassEnabled(true);
  }, [onOrientation]);

  const detachOrientation = useCallback(() => {
    window.removeEventListener("deviceorientationabsolute", onOrientation as EventListener, true);
    window.removeEventListener("deviceorientation", onOrientation as EventListener, true);
  }, [onOrientation]);

  /** En iOS hay que llamar a esto desde un gesto del usuario (tap). */
  const enableCompass = useCallback(async () => {
    const Ctor = (window as unknown as { DeviceOrientationEvent?: IOSDeviceOrientationEventCtor }).DeviceOrientationEvent;
    try {
      if (Ctor && typeof Ctor.requestPermission === "function") {
        const res = await Ctor.requestPermission();
        if (res !== "granted") return false;
      }
      attachOrientation();
      setNeedsCompassPermission(false);
      return true;
    } catch {
      return false;
    }
  }, [attachOrientation]);

  return { position, accuracy, heading, error, watching, compassEnabled, needsCompassPermission, enableCompass };
}
