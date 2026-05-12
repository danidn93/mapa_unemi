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
import { routeToRoomDestination, pickBestEntrance, resolveOriginFromBuildingExit } from "@/lib/arrival";
import { isOutsideCampus, routeViaCampusEntry, pickBestCampusEntry } from "@/lib/campusGate";
import { useStreetApproach } from "@/hooks/useStreetApproach";
import { haversine, UNEMI_CENTER } from "@/lib/geo";
import { speak, stopSpeaking, primeSpeech } from "@/lib/voice";
import type { AccessMode, ArrivalGuide, LatLng, MapBuilding, MapRoom, RouteResult } from "@/types/map";
import { LogIn, MapPin, LayoutDashboard, Share2, Download, Search, School } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const ARRIVAL_THRESHOLD_M = 25;

export default function Index() {
  const { buildings, floors, rooms, entrances, campusEntrances, paths, parkings, landmarks, loading, error } = useMapData();
  const { position, accuracy, heading, error: gpsError, needsCompassPermission, enableCompass } = useGeolocation();

  const [destination, setDestination] = useState<MapRoom | null>(null);
  const [destBuilding, setDestBuilding] = useState<MapBuilding | null>(null);
  const [destLandmark, setDestLandmark] = useState<import("@/types/map").MapLandmark | null>(null);
  const [mode, setMode] = useState<AccessMode>("pedestrian");
  const [voice, setVoice] = useState(true);
  const [arrived, setArrived] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [hasSession, setHasSession] = useState(false);
  const [sharedPin, setSharedPin] = useState<LatLng | null>(null);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  // "preview" muestra ruta+pasos+ETA, sin seguir GPS ni rotar el mapa.
  // "navigating" inicia el recorrido (sigue al usuario y rota el mapa).
  const [navMode, setNavMode] = useState<"preview" | "navigating">("preview");
  const [recenterToken, setRecenterToken] = useState(0);
  const [fitRouteToken, setFitRouteToken] = useState(0);

  // PWA: capturar evento de instalación
  useEffect(() => {
    const onPrompt = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  // Lee ?share=lat,lng
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const s = sp.get("share");
    if (s) {
      const [lat, lng] = s.split(",").map(Number);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        setSharedPin({ lat, lng });
        toast({ title: "📍 Ubicación compartida", description: `${lat.toFixed(5)}, ${lng.toFixed(5)}` });
      }
    }
  }, []);

  // Lee ?focus=building:<id> | room:<id> | landmark:<id>  (usado por notificaciones push)
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
        setDestination(null); setDestBuilding(b); setDestLandmark(null);
        toast({ title: "📌 " + b.name, description: "Trazando ruta desde la notificación" });
      }
    } else if (kind === "room") {
      const r = rooms.find((x) => String(x.id) === id);
      if (r) {
        setDestination(r); setDestBuilding(null); setDestLandmark(null);
        toast({ title: "📌 " + r.name, description: "Trazando ruta desde la notificación" });
      }
    } else if (kind === "landmark") {
      const l = landmarks.find((x) => String(x.id) === id);
      if (l) {
        setDestination(null); setDestBuilding(null); setDestLandmark(l);
        toast({ title: "📌 " + l.name, description: "Trazando ruta desde la notificación" });
      }
    }
    // Limpia el query param para no re-disparar al cambiar de destino
    const url = new URL(window.location.href);
    url.searchParams.delete("focus");
    window.history.replaceState({}, "", url.toString());
  }, [loading, buildings, rooms, landmarks]);

  const [role, setRole] = useState<string>("public");

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

  const loadUserProfile = async (userId: string | undefined) => {
    if (!userId) {
      setRole("public");
      setProfile(null);
      return;
    }

    try {
      const { data: roleData } = await (supabase as any).rpc("get_user_effective_role", {
        _user_id: userId,
      });

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

  // Para el público, ocultamos lo no operativo (cerrado / mantenimiento) tanto en mapa como en routing.
  const isOp = (s?: string | null) => !s || s === "active";
  const visibleBuildings = useMemo(
    () => buildings.filter((b) => b.is_active !== false && isOp(b.status)),
    [buildings],
  );
  const visibleParkings   = useMemo(() => parkings.filter((p) => isOp(p.status)), [parkings]);
  const visibleLandmarks  = useMemo(() => landmarks.filter((l) => l.is_active !== false && isOp(l.status)), [landmarks]);
  
  const visibleEntrances  = useMemo(() => entrances.filter((e) => isOp(e.status)), [entrances]);
  const visibleCampusEnts = useMemo(() => campusEntrances.filter((c) => c.is_active !== false && isOp(c.status)), [campusEntrances]);
  // Calles cerradas no se muestran al público y no se usan para calcular rutas.
  const visiblePaths = useMemo(
    () => paths.filter((p) => p.status !== "closed" && p.status !== "temporary_closed"),
    [paths],
  );

  const gpsOrigin = position ?? UNEMI_CENTER;
  const routeOriginInfo = useMemo(
    () => resolveOriginFromBuildingExit({
      origin: gpsOrigin,
      buildings: visibleBuildings,
      entrances: visibleEntrances,
      mode,
    }),
    [gpsOrigin, visibleBuildings, visibleEntrances, mode],
  );
  const origin = routeOriginInfo.origin;

  const sortedVisibleLandmarks = useMemo(() => {
    return [...visibleLandmarks].sort((a, b) => {
      const da = haversine(origin, { lat: a.lat, lng: a.lng });
      const db = haversine(origin, { lat: b.lat, lng: b.lng });
      return da - db;
    });
  }, [visibleLandmarks, origin]);
  // Si el usuario está fuera del campus, ruteamos primero hasta la entrada
  // peatonal o vehicular más cercana (ignorando salidas) y desde ahí al destino.
  const outside = useMemo(
    () => isOutsideCampus(origin, visibleBuildings),
    [origin, visibleBuildings],
  );

  // Entrada al campus seleccionada (si estamos fuera) — sirve para pedir
  // el tramo de calles públicas a OSRM.
  const bestCampusEntry = useMemo(
    () => (outside ? pickBestCampusEntry({ origin, campusEntrances: visibleCampusEnts, mode }) : null),
    [outside, origin, visibleCampusEnts, mode],
  );
  const streetApproach = useStreetApproach(
    outside,
    outside ? origin : null,
    bestCampusEntry ? { lat: bestCampusEntry.lat, lng: bestCampusEntry.lng } : null,
    mode,
  );

  const arrival = useMemo<ArrivalGuide | null>(() => {
    if (!destination) return null;
    const b = visibleBuildings.find((bb) => bb.id === destination.building_id);
    if (!b) return null;
    const guide = routeToRoomDestination({
      origin, room: destination, building: b, floors,
      entrances: visibleEntrances, paths: visiblePaths, mode,
      buildings: visibleBuildings,
    });
    if (outside) {
      const best = pickBestEntrance({ origin, building: b, entrances: visibleEntrances, mode });
      const target = best
        ? { lat: best.lat, lng: best.lng }
        : { lat: b.centroid_lat, lng: b.centroid_lng };
      const via = routeViaCampusEntry({
        origin, destination: target,
        campusEntrances: visibleCampusEnts,
        paths: visiblePaths, mode,
        obstacles: visibleBuildings.filter((x) => x.id !== b.id),
        streetApproach,
      });
      if (via) return { ...guide, exteriorRoute: via.route };
    }
    return guide;
  }, [destination, visibleBuildings, floors, visibleEntrances, visiblePaths, visibleCampusEnts, origin, mode, outside, streetApproach]);

  const buildingRoute = useMemo<RouteResult | null>(() => {
    if (destination) return arrival?.exteriorRoute ?? null;
    if (destBuilding) {
      const best = pickBestEntrance({ origin, building: destBuilding, entrances: visibleEntrances, mode });
      const target = best
        ? { lat: best.lat, lng: best.lng }
        : { lat: destBuilding.centroid_lat, lng: destBuilding.centroid_lng };
      const obstacles = visibleBuildings.filter((b) => b.id !== destBuilding.id);
      if (outside) {
        const via = routeViaCampusEntry({
          origin, destination: target,
          campusEntrances: visibleCampusEnts,
          paths: visiblePaths, mode, obstacles,
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
          origin, destination: target,
          campusEntrances: visibleCampusEnts,
          paths: visiblePaths, mode, obstacles: visibleBuildings,
          streetApproach,
        });
        if (via) return via.route;
      }
      return computeRoute(visiblePaths, origin, target, mode, visibleBuildings);
    }
    return null;
  }, [destination, destBuilding, destLandmark, visiblePaths, visibleEntrances, visibleBuildings, visibleCampusEnts, origin, mode, arrival, outside, streetApproach]);

  useEffect(() => {
    if (!arrival || !position) return;
    const last = arrival.exteriorRoute.coords[arrival.exteriorRoute.coords.length - 1];
    if (haversine(position, last) < ARRIVAL_THRESHOLD_M) {
      if (!arrived) {
        setArrived(true);
        if (voice) {
          speak(`${arrival.arrivalInstruction} ${arrival.indoorInstruction ?? ""}`, { force: true });
        }
      }
    }
  }, [position, arrival, arrived, voice]);

  // Anuncio inicial al fijar una ruta (solo cuando se inicia la navegación)
  useEffect(() => {
    if (!voice || arrived || !buildingRoute || navMode !== "navigating") return;
    if (!destination && !destBuilding && !destLandmark) return;
    const target = destination?.name ?? destBuilding?.name ?? destLandmark?.name ?? "tu destino";
    const dist = Math.round(buildingRoute.distance);
    const first = buildingRoute.steps[0]?.instruction ?? "Comienza tu recorrido.";
    speak(`Iniciando ruta hacia ${target}. Distancia ${dist} metros. ${first}`, { force: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navMode]);

  // Avance automático del paso actual según proximidad GPS (solo navegando)
  useEffect(() => {
    if (arrived || !buildingRoute || !position || navMode !== "navigating") return;
    const steps = buildingRoute.steps;
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
  }, [position, buildingRoute, voice, arrived, stepIndex, navMode]);

  // Encuadrar ruta automáticamente al entrar a preview
  useEffect(() => {
    if (!buildingRoute || navMode !== "preview") return;
    setFitRouteToken((t) => t + 1);
  }, [buildingRoute, navMode]);

  const announceSelection = (name: string) => {
    if (!voice) return;
    primeSpeech();
    speak(`Calculando ruta hacia ${name}.`, { force: true });
  };
  const resetRoute = () => { setArrived(false); setStepIndex(0); setNavMode("preview"); };
  const handleSelectRoom = (r: MapRoom) => {
    setDestination(r); setDestBuilding(null); setDestLandmark(null); resetRoute();
    announceSelection(r.name);
  };
  const handleSelectBuilding = (b: MapBuilding) => {
    setDestination(null); setDestBuilding(b); setDestLandmark(null); resetRoute();
    announceSelection(b.name);
  };
  const handleSelectLandmark = (l: import("@/types/map").MapLandmark) => {
    setDestination(null); setDestBuilding(null); setDestLandmark(l); resetRoute();
    announceSelection(l.name);
  };
  const handleClose = () => {
    setDestination(null); setDestBuilding(null); setDestLandmark(null);
    resetRoute(); stopSpeaking();
  };
  const handleStartNavigation = () => {
    setNavMode("navigating");
    setRecenterToken((t) => t + 1);
  };
  const handleRecenter = () => setRecenterToken((t) => t + 1);

  const shareMyLocation = async () => {
    const p = position;
    if (!p) {
      toast({ title: "Sin ubicación GPS", description: "Activa el GPS para compartir tu ubicación.", variant: "destructive" });
      return;
    }
    const url = `${window.location.origin}/?share=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
    const shareData = { title: "Mi ubicación en UNEMI", text: "Estoy aquí en el campus", url };
    try {
      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(url);
        toast({ title: "🔗 Enlace copiado", description: url });
      }
    } catch { /* user cancelled */ }
  };

  const installApp = async () => {
    if (!installPrompt) {
      toast({
        title: "Instalación no disponible",
        description: "En iOS: usa Compartir → Agregar a pantalla de inicio. En desktop: ícono de instalación de la barra de direcciones.",
      });
      return;
    }
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") toast({ title: "✅ App instalada" });
    setInstallPrompt(null);
  };

  const hasActiveRoute = !!(destination || destBuilding || destLandmark);
  const activeDestinationName =
    destination?.name ?? destBuilding?.name ?? destLandmark?.name ?? "tu destino";
  const remainingDistance = useMemo(() => {
    if (!buildingRoute || !position) return buildingRoute?.distance ?? 0;
    const coords = buildingRoute.coords;
    let total = 0;
    let nearestIdx = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < coords.length; i++) {
      const d = haversine(position, coords[i]);
      if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
    }
    total += nearestDist;
    for (let i = nearestIdx; i < coords.length - 1; i++) {
      total += haversine(coords[i], coords[i + 1]);
    }
    return total;
  }, [buildingRoute, position]);

  const remainingDuration = useMemo(() => {
    if (!buildingRoute) return 0;
    const speed = mode === "vehicle" ? 8 : 1.4; // m/s aproximados
    if (!buildingRoute.distance) return buildingRoute.duration ?? 0;
    return remainingDistance / speed;
  }, [remainingDistance, buildingRoute, mode]);

  const isNavigating = hasActiveRoute && navMode === "navigating";
  const isPreviewing = hasActiveRoute && navMode === "preview";
  const previewDestinationCode =
    destination?.code ?? destBuilding?.code ?? null;

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

      const res = await fetch("https://sga.unemi.edu.ec/api/1.0/services/emergency_button/", {
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
          description: "El sistema académico no devolvió un aula específica para tu clase actual.",
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
        user={position}
        userAccuracy={accuracy}
        userMode={mode}
        userBearing={heading}
        followUser={isNavigating && !arrived}
        rotateWithHeading={isNavigating && !arrived}
        route={buildingRoute}
        sharedPin={sharedPin}
        onBuildingClick={handleSelectBuilding}
        recenterToken={recenterToken}
        fitRouteToken={fitRouteToken}
        className="absolute inset-0"
      />

      {/* Botón flotante para volver a centrar el mapa en el usuario */}
      {position && (
        <div className="absolute right-3 bottom-24 sm:bottom-28 z-[1100] flex flex-col items-end gap-2">
          {needsCompassPermission && (
            <button
              onClick={enableCompass}
              className="rounded-full bg-primary text-primary-foreground px-3 py-1.5 text-[11px] font-semibold shadow-[var(--shadow-card)] active:scale-95 transition"
            >
              🧭 Activar brújula
            </button>
          )}
          {accuracy != null && accuracy > 30 && (
            <div className="rounded-full bg-card/95 backdrop-blur px-3 py-1 text-[11px] font-medium shadow-[var(--shadow-card)] border border-border/50">
              <span className={accuracy > 60 ? "text-destructive" : "text-amber-600"}>
                GPS ±{Math.round(accuracy)} m
              </span>
              {accuracy > 60 && <span className="text-muted-foreground"> · sal al exterior</span>}
            </div>
          )}
          <RecenterFab onClick={handleRecenter} rotated={isNavigating} />
        </div>
      )}

      {/* Cabecera + buscador (se ocultan cuando hay ruta activa) */}
      {!hasActiveRoute && (
        <header className="absolute top-0 inset-x-0 z-[1000] p-3 sm:p-4 pointer-events-none">
          <div className="max-w-2xl mx-auto pointer-events-auto">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <div className="flex items-center gap-2 rounded-full bg-card/95 backdrop-blur px-3 py-1.5 shadow-[var(--shadow-card)]">
                <TigrilloGuide size={32} />
                <div className="leading-tight">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Mapa Institucional</p>
                  <p className="text-sm font-bold">UNEMI</p>
                </div>
              </div>
              <div className="flex-1" />
              <Button variant="secondary" size="sm" className="rounded-full shadow-[var(--shadow-card)] gap-1"
                onClick={shareMyLocation} title="Compartir mi ubicación">
                <Share2 className="h-4 w-4" /> Compartir
              </Button>

              {hasSession && isStudent && (
                <Button
                  variant="default"
                  size="sm"
                  className="rounded-full shadow-[var(--shadow-card)] gap-1"
                  onClick={goToMyClass}
                  disabled={loadingClassRoute || loading}
                  title="Ir a mi clase"
                >
                  {loadingClassRoute ? (
                    <>
                      <Search className="h-4 w-4 animate-spin" />
                      Buscando aula
                    </>
                  ) : (
                    <>
                      <School className="h-4 w-4" />
                      Ir a mi clase
                    </>
                  )}
                </Button>
              )}

              {installPrompt && (
                <Button variant="default" size="sm" className="rounded-full shadow-[var(--shadow-card)] gap-1"
                  onClick={installApp}>
                  <Download className="h-4 w-4" /> Instalar
                </Button>
              )}
              {hasSession && canAccessAdmin && (
                <Link to="/admin">
                  <Button variant="secondary" size="sm" className="rounded-full shadow-[var(--shadow-card)] gap-1">
                    <LayoutDashboard className="h-4 w-4" /> Panel
                  </Button>
                </Link>
              )}
              {!hasSession && (
                <Link to="/auth">
                  <Button variant="secondary" size="sm" className="rounded-full shadow-[var(--shadow-card)] gap-1">
                    <LogIn className="h-4 w-4" /> Iniciar sesión
                  </Button>
                </Link>
              )}
              {hasSession && !canAccessAdmin && (
                <Button variant="ghost" size="sm" className="rounded-full shadow-[var(--shadow-card)] gap-1"
                  onClick={async () => {
                    if (window.confirm("¿Cerrar sesión?")) await supabase.auth.signOut();
                  }}>
                  <LogIn className="h-4 w-4" /> Salir
                </Button>
              )}
            </div>

            {classRouteMessage && (
              <div
                className={[
                  "mb-3 rounded-2xl border p-3 shadow-[var(--shadow-card)] backdrop-blur bg-card/95",
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
                    <p className="text-xs opacity-80">{classRouteMessage.description}</p>
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
              rooms={rooms.filter((r) => visibleBuildings.some((b) => b.id === r.building_id))}
              buildings={visibleBuildings}
              landmarks={sortedVisibleLandmarks}
              onSelectRoom={handleSelectRoom}
              onSelectBuilding={handleSelectBuilding}
              onSelectLandmark={handleSelectLandmark}
            />

            {(error || gpsError) && (
              <div className="mt-2 rounded-lg bg-destructive/10 border border-destructive/30 p-2 text-xs text-destructive">
                {error && <p>📡 {error}. Ejecuta los SQL de /database en tu Supabase.</p>}
                {gpsError && <p>📍 GPS: {gpsError}</p>}
              </div>
            )}
          </div>
        </header>
      )}

      {/* Vista previa (estilo Google Maps): ruta + ETA + indicaciones + botón Iniciar */}
      {isPreviewing && buildingRoute && (
        <div className="absolute bottom-0 inset-x-0 z-[1000] p-3 sm:p-4 pointer-events-none">
          <div className="max-w-2xl mx-auto max-h-[55vh] overflow-y-auto overscroll-contain pointer-events-auto rounded-3xl">
            <RoutePreview
              destinationName={activeDestinationName}
              destinationCode={previewDestinationCode}
              route={buildingRoute}
              arrival={arrival}
              mode={mode}
              onChangeMode={(m) => { setMode(m); resetRoute(); }}
              onStart={handleStartNavigation}
              onClose={handleClose}
            />
          </div>
        </div>
      )}

      {/* Indicación flotante paso a paso (modo navegación activa) */}
      {isNavigating && buildingRoute && (
        <div className="absolute top-0 inset-x-0 z-[1000] p-3 sm:p-4 pointer-events-none">
          <div className="max-w-xl mx-auto">
            <StepFloating
              step={buildingRoute.steps[stepIndex] ?? null}
              stepIndex={stepIndex}
              totalSteps={buildingRoute.steps.length}
              distanceToStep={
                position && buildingRoute.steps[stepIndex]
                  ? haversine(position, {
                      lat: buildingRoute.steps[stepIndex].lat,
                      lng: buildingRoute.steps[stepIndex].lng,
                    })
                  : null
              }
              remainingDistance={remainingDistance}
              remainingDuration={remainingDuration}
              destinationName={activeDestinationName}
              arrived={arrived}
              arrivalText={arrival?.arrivalInstruction ?? null}
              voice={voice}
              onToggleVoice={() => { setVoice((v) => !v); if (voice) stopSpeaking(); }}
              onClose={handleClose}
              mode={mode}
              onChangeMode={(m) => { setMode(m); resetRoute(); }}
            />
          </div>
        </div>
      )}

      {/* Detalle de llegada (solo cuando ya llegó al destino) */}
      {arrived && arrival && (
        <div className="absolute bottom-0 inset-x-0 z-[1000] p-3 sm:p-4 pointer-events-none">
          <div className="max-w-2xl mx-auto pointer-events-auto">
            <NavigationPanel
              destination={destination ?? (destBuilding ? ({
                id: destBuilding.id, name: destBuilding.name, code: destBuilding.code,
                building_id: destBuilding.id, floor_id: null, room_type_id: null,
                description: destBuilding.description, directions: null, image_url: destBuilding.image_url,
                keywords: null, target_audience: destBuilding.target_audience,
              } as MapRoom) : destLandmark ? ({
                id: destLandmark.id, name: destLandmark.name, code: null,
                building_id: "", floor_id: null, room_type_id: null,
                description: destLandmark.description, directions: null, image_url: null,
                keywords: null, target_audience: "public",
              } as MapRoom) : null)}
              route={buildingRoute}
              arrival={arrival}
              mode={mode}
              onChangeMode={setMode}
              onClose={handleClose}
              arrived={arrived}
              voice={voice}
              onToggleVoice={() => { setVoice((v) => !v); if (voice) stopSpeaking(); }}
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
        <div className="absolute z-[1000] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 max-w-md text-center bg-card/95 backdrop-blur p-6 rounded-2xl shadow-[var(--shadow-card)] border">
          <MapPin className="mx-auto h-8 w-8 text-primary mb-2" />
          <h2 className="font-bold mb-1">El campus está vacío</h2>
          <p className="text-sm text-muted-foreground mb-3">
            Inicia sesión como administrador para dibujar edificios, calles, parqueos y aulas.
          </p>
          <Link to={hasSession ? "/admin" : "/auth"}>
            <Button>{hasSession ? "Ir al editor" : "Iniciar sesión"}</Button>
          </Link>
        </div>
      )}
    </div>
  );
}
