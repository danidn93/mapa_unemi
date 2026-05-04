import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/integrations/supabase/db";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useMapData } from "@/hooks/useMapData";
import { CampusMap } from "@/components/CampusMap";
import { TigrilloGuide } from "@/components/TigrilloGuide";
import { toast } from "@/hooks/use-toast";
import type {
  AccessMode, CampusDirection, CampusEntryType, FeatureStatus, LandmarkKind, MapBuilding, MapCampusEntrance, MapEntrance,
  MapLandmark, MapParking, MapPath, ParkingType,
} from "@/types/map";
import { CAMPUS_DIRECTION_LABEL, FEATURE_STATUS_LABEL } from "@/types/map";
import { snapToPaths, collectPathVertices } from "@/lib/snap";
import { PasteCoordInput } from "@/components/PasteCoordInput";
import { ArrowLeft, LogOut, Pencil, Trash2, MapPin, Save, X, Bell, GripVertical, ArrowUp, ArrowDown } from "lucide-react";

type DrawTool =
  | "none"
  | "building"        // 1 clic = punto GPS del bloque
  | "parking"         // 1 clic = punto GPS del parqueo
  | "entrance"        // 1 clic = entrada de edificio (requiere edificio sel.)
  | "campus-entry"    // 1 clic = entrada al campus
  | "landmark"        // 1 clic = punto de referencia (plazoleta, baño, bar…)
  | "path-ped"        // 2+ clics = línea peatonal (A→B…)
  | "path-veh";       // 2+ clics = línea vehicular

type EditTarget =
  | { kind: "building"; data: MapBuilding }
  | { kind: "parking"; data: MapParking }
  | { kind: "entrance"; data: MapEntrance }
  | { kind: "campus-entry"; data: MapCampusEntrance }
  | { kind: "landmark"; data: MapLandmark }
  | { kind: "path"; data: MapPath }
  | null;

// Polígono mínimo (~1 m²) alrededor de un punto, para cumplir geom NOT NULL
function pointBox(lat: number, lng: number, sizeM = 1) {
  const dLat = sizeM / 111320;
  const dLng = sizeM / (111320 * Math.cos((lat * Math.PI) / 180));
  return {
    type: "Polygon" as const,
    coordinates: [[
      [lng - dLng, lat - dLat],
      [lng + dLng, lat - dLat],
      [lng + dLng, lat + dLat],
      [lng - dLng, lat + dLat],
      [lng - dLng, lat - dLat],
    ]],
  };
}

const PARKING_LABELS: Record<ParkingType, string> = {
  car: "Auto", motorcycle: "Moto", bicycle: "Bicicleta",
  bus: "Bus", authority: "Autoridad", disabled: "Discapacitados",
};

export default function Admin() {
  const nav = useNavigate();
  const [session, setSession] = useState<any>(null);
  const [role, setRole] = useState<string>("public");
  const data = useMapData();

  const [tool, setTool] = useState<DrawTool>("none");
  const [drawing, setDrawing] = useState<{ lat: number; lng: number }[]>([]);

  // edificio seleccionado (para entradas / aulas)
  const [editingBuilding, setEditingBuilding] = useState<MapBuilding | null>(null);

  // form de creación de edificio (1 clic)
  const [bForm, setBForm] = useState({ name: "", code: "", description: "", floors_count: 1 });

  // parqueo
  const [parkingType, setParkingType] = useState<ParkingType>("car");
  const [parkingName, setParkingName] = useState("");
  const [parkingCapacity, setParkingCapacity] = useState<number | "">("");

  // calle
  const [pathName, setPathName] = useState("");

  // entrada de edificio
  const [bldEntryMode, setBldEntryMode] = useState<AccessMode | "both">("pedestrian");
  const [bldEntryMain, setBldEntryMain] = useState(false);
  const [bldEntryName, setBldEntryName] = useState("");

  // entrada universidad
  const [campusEntryType, setCampusEntryType] = useState<CampusEntryType>("mixed");
  const [campusEntryDirection, setCampusEntryDirection] = useState<CampusDirection>("both");
  const [campusEntryName, setCampusEntryName] = useState("");

  // landmark
  const [lmName, setLmName] = useState("");
  const [lmKind, setLmKind] = useState<LandmarkKind>("reference");
  const [lmDescription, setLmDescription] = useState("");

  // edición
  const [editTarget, setEditTarget] = useState<EditTarget>(null);
  const [originalStatus, setOriginalStatus] = useState<FeatureStatus | null>(null);
  const [editReason, setEditReason] = useState<string>("");

  // filtros del mapa admin (calles)
  const [pathFilter, setPathFilter] = useState<"all" | "pedestrian" | "vehicle">("all");

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: s }) => {
      if (!s.session) { nav("/auth"); return; }
      setSession(s.session);
      const { data: r } = await db.rpc("get_user_effective_role", { _user_id: s.session.user.id });
      const eff = (r as string) ?? "public";
      setRole(eff);
      // Solo admin/operator/superadmin pueden estar aquí
      if (!["admin", "operator", "superadmin"].includes(eff)) {
        toast({ title: "Acceso restringido", description: "Tu cuenta no tiene permisos de administración." });
        nav("/");
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { if (!s) nav("/auth"); });
    return () => sub.subscription.unsubscribe();
  }, [nav]);

  const isAdmin = role === "admin" || role === "superadmin";

  // ====== Click en mapa ======
  const onMapClick = async (p: { lat: number; lng: number }) => {
    if (tool === "none") return;
    if (tool === "building") return saveBuilding(p);
    if (tool === "parking") return saveParking(p);
    if (tool === "entrance") return saveBuildingEntrance(p);
    if (tool === "campus-entry") return saveCampusEntry(p);
    if (tool === "landmark") return saveLandmark(p);
    // calles: snap al vértice o segmento de calles existentes para que se conecten bien
    const snapped = snapToPaths(p, data.paths);
    if (snapped.snapped !== "none") {
      toast({
        title: snapped.snapped === "vertex" ? "🔗 Conectado a esquina" : "🔗 Pegado a calle",
        description: "El vértice se unirá a la red existente.",
      });
    }
    setDrawing((d) => [...d, snapped.point]);
  };

  // ====== Guardado puntual (1 clic) ======
  const saveBuilding = async (p: { lat: number; lng: number }) => {
    if (!bForm.name.trim()) {
      toast({ title: "Falta el nombre", description: "Escribe el nombre del bloque antes de marcarlo.", variant: "destructive" });
      return;
    }
    const { error } = await db.from("map_buildings").insert({
      name: bForm.name.trim(),
      code: bForm.code.trim() || null,
      description: bForm.description.trim() || null,
      floors_count: bForm.floors_count || 1,
      geom: pointBox(p.lat, p.lng),
      centroid_lat: p.lat, centroid_lng: p.lng,
    });
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    toast({ title: "Bloque creado", description: `${bForm.name} ubicado correctamente.` });
    setBForm({ name: "", code: "", description: "", floors_count: 1 });
    setTool("none");
    data.reload();
  };

  const saveParking = async (p: { lat: number; lng: number }) => {
    const { error } = await db.from("map_parkings").insert({
      name: parkingName.trim() || `Parqueo ${PARKING_LABELS[parkingType]}`,
      type: parkingType,
      capacity: parkingCapacity === "" ? null : Number(parkingCapacity),
      geom: pointBox(p.lat, p.lng),
      centroid_lat: p.lat, centroid_lng: p.lng,
    });
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    toast({ title: "Parqueo creado" });
    setParkingName(""); setParkingCapacity("");
    setTool("none");
    data.reload();
  };

  const saveBuildingEntrance = async (p: { lat: number; lng: number }) => {
    if (!editingBuilding) {
      toast({ title: "Selecciona un bloque", description: "Primero elige el bloque al que pertenece la entrada.", variant: "destructive" });
      return;
    }
    const modes: AccessMode[] = bldEntryMode === "both" ? ["pedestrian", "vehicle"] : [bldEntryMode];
    const { error } = await db.from("map_entrances").insert({
      building_id: editingBuilding.id,
      lat: p.lat, lng: p.lng,
      name: bldEntryName.trim() || (bldEntryMain ? "Entrada principal" : "Entrada"),
      is_main: bldEntryMain,
      access_modes: modes,
    });
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    toast({ title: "Entrada agregada", description: `En ${editingBuilding.name}` });
    setBldEntryName(""); setBldEntryMain(false);
    setTool("none");                 // ✅ cerrar herramienta para no crear varias por error
    data.reload();
  };

  const saveCampusEntry = async (p: { lat: number; lng: number }) => {
    if (!campusEntryName.trim()) {
      toast({ title: "Falta el nombre", description: "Ej: Garita norte, Entrada principal…", variant: "destructive" });
      return;
    }
    const { error } = await db.from("map_campus_entrances").insert({
      name: campusEntryName.trim(),
      entry_type: campusEntryType,
      direction: campusEntryDirection,
      lat: p.lat, lng: p.lng,
    });
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    toast({ title: campusEntryDirection === "exit" ? "Salida del campus creada" : "Entrada al campus creada" });
    setCampusEntryName("");
    setTool("none");                 // ✅ cerrar herramienta
    data.reload();
  };

  const saveLandmark = async (p: { lat: number; lng: number }) => {
    if (!lmName.trim()) {
      toast({ title: "Falta el nombre", description: "Ej: 'Plazoleta central', 'Baños bloque B'…", variant: "destructive" });
      return;
    }
    const { error } = await db.from("map_landmarks").insert({
      name: lmName.trim(),
      kind: lmKind,
      description: lmDescription.trim() || null,
      lat: p.lat, lng: p.lng,
    });
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    toast({ title: "Punto de referencia creado" });
    setLmName(""); setLmDescription("");
    setTool("none");
    data.reload();
  };

  // ====== Calles (line) ======
  const finishPath = async () => {
    if (drawing.length < 2) {
      toast({ title: "Necesitas al menos 2 puntos", description: "Marca el punto A y el punto B de la calle.", variant: "destructive" });
      return;
    }
    const modes: AccessMode[] = tool === "path-veh" ? ["vehicle"] : ["pedestrian"];
    const { error } = await db.from("map_paths").insert({
      name: pathName.trim() || null,
      access_modes: modes,
      bidirectional: true,
      geom: { type: "LineString", coordinates: drawing.map((p) => [p.lng, p.lat]) },
    });
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    toast({ title: "Calle creada", description: `${drawing.length} puntos · ${modes[0]}` });
    setDrawing([]); setPathName(""); setTool("none");
    data.reload();
  };

  // ====== Borrar ======
  const remove = async (table: string, id: string, label: string) => {
    if (!confirm(`¿Eliminar ${label}? Esta acción no se puede deshacer.`)) return;
    const { error } = await db.from(table).delete().eq("id", id);
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    toast({ title: "Eliminado" });
    if (editingBuilding?.id === id) setEditingBuilding(null);
    setEditTarget(null);
    data.reload();
  };

  // ====== Abrir editor (capturando estado original para detectar cambios) ======
  const openEdit = (t: NonNullable<EditTarget>) => {
    setEditTarget(t);
    setOriginalStatus(((t.data as any).status ?? "active") as FeatureStatus);
    setEditReason("");
  };

  // ====== Guardar edición ======
  const saveEdit = async () => {
    if (!editTarget) return;
    const t = editTarget;
    let table = "", patch: any = {};
    if (t.kind === "building") {
      table = "map_buildings";
      patch = {
        name: t.data.name, code: t.data.code, description: t.data.description,
        floors_count: t.data.floors_count, status: (t.data as any).status,
        centroid_lat: t.data.centroid_lat, centroid_lng: t.data.centroid_lng,
        geom: pointBox(t.data.centroid_lat, t.data.centroid_lng),
      };
    } else if (t.kind === "parking") {
      table = "map_parkings";
      patch = {
        name: t.data.name, type: t.data.type, capacity: t.data.capacity,
        status: (t.data as any).status,
        centroid_lat: t.data.centroid_lat, centroid_lng: t.data.centroid_lng,
        geom: pointBox(t.data.centroid_lat, t.data.centroid_lng),
      };
    } else if (t.kind === "entrance") {
      table = "map_entrances";
      patch = {
        name: t.data.name, is_main: t.data.is_main, access_modes: t.data.access_modes,
        status: (t.data as any).status,
        lat: t.data.lat, lng: t.data.lng,
      };
    } else if (t.kind === "campus-entry") {
      table = "map_campus_entrances";
      patch = {
        name: t.data.name, entry_type: t.data.entry_type,
        direction: (t.data as any).direction ?? "both",
        status: (t.data as any).status, lat: t.data.lat, lng: t.data.lng,
      };
    } else if (t.kind === "path") {
      table = "map_paths";
      patch = {
        name: t.data.name, access_modes: t.data.access_modes, bidirectional: t.data.bidirectional,
        status: (t.data as any).status,
        geom: (t.data as any).geom,
      };
    } else if (t.kind === "landmark") {
      table = "map_landmarks";
      patch = {
        name: t.data.name, kind: t.data.kind, description: t.data.description,
        status: (t.data as any).status,
        lat: t.data.lat, lng: t.data.lng,
      };
    }
    const { error } = await db.from(table).update(patch).eq("id", (t.data as any).id);
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });

    // Notificar SOLO si cambió el estado (no se notifica al crear)
    const newStatus = (t.data as any).status as FeatureStatus | undefined;
    if (newStatus && originalStatus && newStatus !== originalStatus) {
      const lat = (t.data as any).centroid_lat ?? (t.data as any).lat;
      const lng = (t.data as any).centroid_lng ?? (t.data as any).lng;
      await notifyStatusChange(
        t.kind,
        (t.data as any).name ?? labelOf(t.kind),
        originalStatus,
        newStatus,
        editReason.trim(),
        { id: (t.data as any).id, lat, lng },
      );
    }

    toast({ title: "Cambios guardados" });
    setEditTarget(null);
    setOriginalStatus(null);
    setEditReason("");
    data.reload();
  };

  // ====== Cambio rápido de estado de una calle (desde el mapa admin) ======
  const quickPathStatus = async (path: MapPath, newStatus: FeatureStatus) => {
    const prev = (path.status ?? "active") as FeatureStatus;
    if (prev === newStatus) return;
    const reason = window.prompt(
      `Motivo del cambio de estado de "${path.name ?? "calle s/n"}" a "${FEATURE_STATUS_LABEL[newStatus]}":\n\n(Se incluirá en la notificación push y en el correo a los administradores)`,
      "",
    );
    if (reason === null) return; // canceló
    const { error } = await db.from("map_paths").update({ status: newStatus }).eq("id", path.id);
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    // Centroide aproximado de la calle (primer vértice si no hay centroide)
    const coords = (path as any).geom?.coordinates as [number, number][] | undefined;
    let lat: number | undefined; let lng: number | undefined;
    if (coords && coords.length) {
      const mid = coords[Math.floor(coords.length / 2)];
      lng = mid?.[0]; lat = mid?.[1];
    }
    await notifyStatusChange("path", path.name ?? "", prev, newStatus, reason.trim(), { id: path.id, lat, lng });
    toast({ title: "Estado actualizado", description: `Calle: ${FEATURE_STATUS_LABEL[newStatus]}` });
    data.reload();
  };

  // ====== Push + email cuando cambia un estado (con motivo) ======
  // Para calles, edificios, landmarks y entradas: a TODOS los usuarios (audience='public')
  // y se incluye URL para abrir el mapa centrado en el elemento.
  const notifyStatusChange = async (
    kind: string,
    name: string,
    prev: FeatureStatus,
    next: FeatureStatus,
    reason: string,
    target?: { id?: string; lat?: number; lng?: number },
  ) => {
    const kindLabel = labelOf(kind as any);
    const hasName = !!(name && name.trim());
    const displayName = hasName ? name : kindLabel;
    const title = `Mapa UNEMI · ${kindLabel} actualizado`;
    const statusLine = `${FEATURE_STATUS_LABEL[prev]} → ${FEATURE_STATUS_LABEL[next]}`;
    const body = reason
      ? `${displayName}: ${statusLine}\nMotivo: ${reason}`
      : `${displayName}: ${statusLine}`;

    // Construye URL profunda para abrir el item en el mapa.
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    let url = `${origin}/`;
    if (target?.id && (kind === "building" || kind === "room" || kind === "landmark")) {
      url = `${origin}/?focus=${kind}:${target.id}`;
    } else if (target?.lat != null && target?.lng != null) {
      url = `${origin}/?share=${target.lat},${target.lng}`;
    }

    // Push a TODOS los usuarios suscritos (audience='public')
    try {
      await supabase.functions.invoke("send-push-notification", {
        body: {
          title, body, audience: "public", url,
          data: { kind, name: displayName, prev, next, reason, url },
        },
      });
    } catch (e) {
      console.warn("Push notification failed (non-blocking):", e);
    }

    // Correo a TODOS los usuarios con el motivo. Si no tiene nombre, se envía vacío
    // para que el template no muestre "Calle s/n".
    try {
      await supabase.functions.invoke("send-status-change-email", {
        body: {
          kind: kindLabel,
          name: hasName ? name : "",
          prev_status: FEATURE_STATUS_LABEL[prev],
          next_status: FEATURE_STATUS_LABEL[next],
          reason,
          audience: "public",
          url,
        },
      });
    } catch (e) {
      console.warn("Status email failed (non-blocking):", e);
    }
  };

  const exportGeoJSON = () => {
    const fc = {
      type: "FeatureCollection",
      features: [
        ...data.buildings.map((b) => ({ type: "Feature", properties: { kind: "building", ...b }, geometry: b.geom })),
        ...data.paths.map((pa) => ({ type: "Feature", properties: { kind: "path", ...pa }, geometry: pa.geom })),
        ...data.parkings.map((pk) => ({ type: "Feature", properties: { kind: "parking", ...pk }, geometry: pk.geom })),
      ],
    };
    const blob = new Blob([JSON.stringify(fc, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "mapa-unemi.geojson"; a.click();
    URL.revokeObjectURL(url);
  };

  const signOut = async () => { await supabase.auth.signOut(); nav("/auth"); };

  if (!session) return null;

  const drawingMode =
    tool === "path-ped" || tool === "path-veh" ? "line" :
    tool === "building" || tool === "parking" || tool === "entrance" || tool === "campus-entry" || tool === "landmark" ? "point" :
    null;

  // El mapa debe ignorar clicks sobre features si estamos en cualquier herramienta
  // EXCEPTO 'none', y permitir click directo en features cuando NO estamos editando
  // (para abrir popup de editar/eliminar).
  const editingMap = tool !== "none";

  return (
    <div className="h-screen flex flex-col">
      <header className="flex items-center gap-3 border-b px-4 py-2 bg-card">
        <Link to="/"><Button size="icon" variant="ghost"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <TigrilloGuide size={36} />
        <div className="flex-1">
          <p className="text-xs text-muted-foreground leading-none">Panel administrativo</p>
          <h1 className="font-bold">Mapa UNEMI · {role}</h1>
        </div>
        <Button variant="ghost" size="sm" onClick={signOut}><LogOut className="h-4 w-4 mr-1" /> Salir</Button>
      </header>

      {!isAdmin ? (
        <div className="flex-1 grid place-items-center p-6">
          <Card className="p-6 max-w-md text-center">
            <h2 className="font-bold mb-2">Acceso restringido</h2>
            <p className="text-sm text-muted-foreground">
              Tu rol actual es <b>{role}</b>. Pide a un superadmin asignarte rol <b>operator</b> o <b>admin</b>.
            </p>
          </Card>
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[400px_1fr] overflow-hidden">
          <aside className="border-r overflow-auto p-3 space-y-3 bg-muted/20">
            <Tabs defaultValue="create">
              <TabsList className="w-full grid grid-cols-4">
                <TabsTrigger value="create">Crear</TabsTrigger>
                <TabsTrigger value="manage">Gestionar</TabsTrigger>
                <TabsTrigger value="rooms">Aulas</TabsTrigger>
                <TabsTrigger value="users">Usuarios</TabsTrigger>
              </TabsList>

              {/* ============ CREAR ============ */}
              <TabsContent value="create" className="space-y-3">
                <Card className="p-3 space-y-3">
                  <div>
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">Paso 1 — ¿Qué quieres crear?</Label>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <ToolBtn active={tool === "building"} onClick={() => { setTool("building"); setDrawing([]); }}>🏛 Bloque</ToolBtn>
                      <ToolBtn active={tool === "parking"} onClick={() => { setTool("parking"); setDrawing([]); }}>🅿️ Parqueo</ToolBtn>
                      <ToolBtn active={tool === "entrance"} onClick={() => { setTool("entrance"); setDrawing([]); }}>🚪 Entrada bloque</ToolBtn>
                      <ToolBtn active={tool === "campus-entry"} onClick={() => { setTool("campus-entry"); setDrawing([]); }}>⛩ Entrada/Salida campus</ToolBtn>
                      <ToolBtn active={tool === "landmark"} onClick={() => { setTool("landmark"); setDrawing([]); }}>📍 Punto referencia</ToolBtn>
                      <ToolBtn active={tool === "path-ped"} onClick={() => { setTool("path-ped"); setDrawing([]); }}>🚶 Calle peatonal</ToolBtn>
                      <ToolBtn active={tool === "path-veh"} onClick={() => { setTool("path-veh"); setDrawing([]); }}>🚗 Calle vehicular</ToolBtn>
                    </div>
                    {tool !== "none" && (
                      <Button size="sm" variant="ghost" className="w-full mt-2"
                        onClick={() => { setTool("none"); setDrawing([]); }}>
                        <X className="h-3 w-3 mr-1" /> Cancelar herramienta
                      </Button>
                    )}
                  </div>
                </Card>

                {/* Formulario contextual según herramienta */}
                {tool === "building" && (
                  <Card className="p-3 space-y-3">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">Paso 2 — Datos del bloque</Label>
                    <Field label="Nombre del bloque *" hint="Cómo lo conocen las personas. Ej: 'Bloque A', 'Edificio de Sistemas'.">
                      <Input value={bForm.name} onChange={(e) => setBForm({ ...bForm, name: e.target.value })} placeholder="Bloque A" />
                    </Field>
                    <Field label="Código corto" hint="Código institucional opcional. Ej: 'A', 'CIS-1'.">
                      <Input value={bForm.code} onChange={(e) => setBForm({ ...bForm, code: e.target.value })} placeholder="A" />
                    </Field>
                    <Field label="Número de pisos" hint="Cantidad total de plantas, incluyendo planta baja.">
                      <Input type="number" min={1} value={bForm.floors_count}
                        onChange={(e) => setBForm({ ...bForm, floors_count: +e.target.value || 1 })} />
                    </Field>
                    <Field label="Descripción" hint="Breve descripción de qué hay en el bloque (carreras, oficinas…).">
                      <Textarea rows={2} value={bForm.description}
                        onChange={(e) => setBForm({ ...bForm, description: e.target.value })}
                        placeholder="Aulas de Sistemas, laboratorios de cómputo…" />
                    </Field>
                    <p className="text-xs text-primary font-medium">📍 Paso 3 — Haz clic en el mapa <i>o</i> pega las coordenadas exactas.</p>
                    <PasteCoordInput buttonLabel="Guardar bloque aquí" onAdd={(lat, lng) => saveBuilding({ lat, lng })} />
                  </Card>
                )}

                {tool === "parking" && (
                  <Card className="p-3 space-y-3">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">Paso 2 — Datos del parqueo</Label>
                    <Field label="Nombre" hint="Opcional. Si lo dejas vacío se usa el tipo. Ej: 'Parqueo norte'.">
                      <Input value={parkingName} onChange={(e) => setParkingName(e.target.value)} placeholder="Parqueo norte" />
                    </Field>
                    <Field label="Tipo de parqueo *" hint="Para qué vehículo está destinado.">
                      <select value={parkingType} onChange={(e) => setParkingType(e.target.value as ParkingType)}
                        className="w-full border rounded-md p-2 text-sm bg-background">
                        {(Object.keys(PARKING_LABELS) as ParkingType[]).map((t) => (
                          <option key={t} value={t}>{PARKING_LABELS[t]}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Capacidad" hint="Cantidad aproximada de espacios. Opcional.">
                      <Input type="number" min={0} value={parkingCapacity}
                        onChange={(e) => setParkingCapacity(e.target.value === "" ? "" : +e.target.value)}
                        placeholder="Ej: 30" />
                    </Field>
                    <p className="text-xs text-primary font-medium">📍 Paso 3 — Haz clic en el mapa <i>o</i> pega las coordenadas.</p>
                    <PasteCoordInput buttonLabel="Guardar parqueo aquí" onAdd={(lat, lng) => saveParking({ lat, lng })} />
                  </Card>
                )}

                {tool === "entrance" && (
                  <Card className="p-3 space-y-3">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">Paso 2 — Entrada de bloque</Label>
                    <Field label="Bloque al que pertenece *" hint="La entrada quedará vinculada a este bloque.">
                      <select className="w-full border rounded-md p-2 text-sm bg-background"
                        value={editingBuilding?.id ?? ""} onChange={(e) => {
                          const b = data.buildings.find((bb) => bb.id === e.target.value);
                          setEditingBuilding(b ?? null);
                        }}>
                        <option value="">— elige un bloque —</option>
                        {data.buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </Field>
                    <Field label="Nombre de la entrada" hint="Opcional. Ej: 'Puerta lateral', 'Acceso parqueo'.">
                      <Input value={bldEntryName} onChange={(e) => setBldEntryName(e.target.value)} placeholder="Puerta lateral" />
                    </Field>
                    <Field label="Modo de acceso *" hint="Por dónde se puede entrar.">
                      <select value={bldEntryMode} onChange={(e) => setBldEntryMode(e.target.value as any)}
                        className="w-full border rounded-md p-2 text-sm bg-background">
                        <option value="pedestrian">Solo peatonal</option>
                        <option value="vehicle">Solo vehicular</option>
                        <option value="both">Mixta (ambos)</option>
                      </select>
                    </Field>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={bldEntryMain} onChange={(e) => setBldEntryMain(e.target.checked)} />
                      Es la entrada <b>principal</b> del bloque
                    </label>
                    <p className="text-xs text-primary font-medium">📍 Paso 3 — Haz clic en el mapa <i>o</i> pega las coordenadas de la puerta.</p>
                    <PasteCoordInput buttonLabel="Guardar entrada aquí" onAdd={(lat, lng) => saveBuildingEntrance({ lat, lng })} />
                  </Card>
                )}

                {tool === "campus-entry" && (
                  <Card className="p-3 space-y-3">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">Paso 2 — Acceso al campus UNEMI</Label>
                    <Field label="Nombre *" hint="Ej: 'Garita norte', 'Salida vehicular Av. Universitaria'.">
                      <Input value={campusEntryName} onChange={(e) => setCampusEntryName(e.target.value)} placeholder="Garita norte" />
                    </Field>
                    <Field label="Sentido *" hint="Si por aquí solo se entra, solo se sale, o ambos.">
                      <select value={campusEntryDirection}
                        onChange={(e) => setCampusEntryDirection(e.target.value as CampusDirection)}
                        className="w-full border rounded-md p-2 text-sm bg-background">
                        <option value="entry">⬇️ Solo entrada</option>
                        <option value="exit">⬆️ Solo salida</option>
                        <option value="both">↕️ Entrada y salida</option>
                      </select>
                    </Field>
                    <Field label="Tipo de acceso *" hint="Quién puede pasar por aquí.">
                      <select value={campusEntryType} onChange={(e) => setCampusEntryType(e.target.value as CampusEntryType)}
                        className="w-full border rounded-md p-2 text-sm bg-background">
                        <option value="pedestrian">Solo peatonal</option>
                        <option value="vehicle">Solo vehicular</option>
                        <option value="mixed">Mixta</option>
                      </select>
                    </Field>
                    <p className="text-xs text-primary font-medium">📍 Paso 3 — Haz clic en el mapa <i>o</i> pega las coordenadas de la garita.</p>
                    <PasteCoordInput
                      buttonLabel={campusEntryDirection === "exit" ? "Guardar salida aquí" : "Guardar acceso aquí"}
                      onAdd={(lat, lng) => saveCampusEntry({ lat, lng })}
                    />
                  </Card>
                )}

                {tool === "landmark" && (
                  <Card className="p-3 space-y-3">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">Paso 2 — Punto de referencia</Label>
                    <Field label="Nombre *" hint="Ej: 'Plazoleta central', 'Baños bloque B', 'Bar La Fuente', 'Corredor norte'.">
                      <Input value={lmName} onChange={(e) => setLmName(e.target.value)} placeholder="Plazoleta central" />
                    </Field>
                    <Field label="Tipo *" hint="Categoría visible en el ícono del mapa.">
                      <select value={lmKind} onChange={(e) => setLmKind(e.target.value as LandmarkKind)}
                        className="w-full border rounded-md p-2 text-sm bg-background">
                        <option value="reference">📍 Referencia genérica</option>
                        <option value="plaza">🌳 Plazoleta</option>
                        <option value="corridor">🚶‍♂️ Corredor</option>
                        <option value="restroom">🚻 Baños</option>
                        <option value="cafeteria">☕ Cafetería</option>
                        <option value="bar">🍔 Bar / Comida</option>
                        <option value="atm">🏧 Cajero</option>
                        <option value="emergency">🚨 Emergencia</option>
                        <option value="other">• Otro</option>
                      </select>
                    </Field>
                    <Field label="Descripción" hint="Opcional. Detalles que ayuden al usuario a identificarlo.">
                      <Textarea rows={2} value={lmDescription}
                        onChange={(e) => setLmDescription(e.target.value)}
                        placeholder="Punto de encuentro frente al bloque A…" />
                    </Field>
                    <p className="text-xs text-primary font-medium">📍 Paso 3 — Haz clic en el mapa <i>o</i> pega las coordenadas exactas.</p>
                    <PasteCoordInput buttonLabel="Guardar punto aquí" onAdd={(lat, lng) => saveLandmark({ lat, lng })} />
                  </Card>
                )}

                {(tool === "path-ped" || tool === "path-veh") && (
                  <Card className="p-3 space-y-3">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      Paso 2 — Calle {tool === "path-veh" ? "vehicular 🚗" : "peatonal 🚶"}
                    </Label>
                    <Field label="Nombre interno" hint="Opcional. Solo para que tú la identifiques en la lista.">
                      <Input value={pathName} onChange={(e) => setPathName(e.target.value)} placeholder="(opcional)" />
                    </Field>
                    <p className="text-xs text-primary font-medium">
                      📍 Paso 3 — Haz clic punto A, luego punto B (puedes añadir más vértices).
                      Las calles que se acercan ≤ 6 m se conectan automáticamente.
                    </p>
                    <p className="text-xs text-muted-foreground">Vértices marcados: <b>{drawing.length}</b></p>

                    <div className="space-y-1">
                      <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        O pega coordenadas de Google Maps
                      </Label>
                      <PasteCoordInput
                        buttonLabel="Añadir vértice"
                        onAdd={(lat, lng) => setDrawing((prev) => [...prev, { lat, lng }])}
                      />
                      <p className="text-[10px] text-muted-foreground leading-tight">
                        En Google Maps: clic derecho sobre el punto → primera opción copia <code>lat, lng</code>.
                      </p>
                    </div>

                    {drawing.length > 0 && (
                      <div className="space-y-2">
                        <ul className="text-[11px] space-y-0.5 max-h-32 overflow-auto rounded border bg-muted/30 p-1.5">
                          {drawing.map((p, i) => (
                            <li key={i} className="flex items-center justify-between gap-1">
                              <span className="font-mono">{i + 1}. {p.lat.toFixed(6)}, {p.lng.toFixed(6)}</span>
                              <button
                                type="button"
                                className="text-destructive hover:underline"
                                onClick={() => setDrawing((prev) => prev.filter((_, j) => j !== i))}
                                title="Quitar vértice"
                              >
                                ✕
                              </button>
                            </li>
                          ))}
                        </ul>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={finishPath} className="flex-1" disabled={drawing.length < 2}>
                            <Save className="h-3 w-3 mr-1" /> Guardar calle
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setDrawing([])}>Limpiar</Button>
                        </div>
                      </div>
                    )}
                  </Card>
                )}

                {tool === "none" && (
                  <Card className="p-3">
                    <p className="text-sm text-muted-foreground">
                      👆 Elige qué crear en el <b>Paso 1</b>. Bloques, parqueos, entradas y puntos de referencia se ubican con <b>un solo clic</b> en el mapa.
                      Las calles necesitan <b>2 o más clics</b> (punto A → punto B…).
                    </p>
                  </Card>
                )}
              </TabsContent>

              {/* ============ GESTIONAR ============ */}
              <TabsContent value="manage" className="space-y-3">
                {editTarget && <EditPanel target={editTarget} setTarget={setEditTarget} onSave={saveEdit}
                  onDelete={(table, id, label) => remove(table, id, label)}
                  originalStatus={originalStatus}
                  reason={editReason} setReason={setEditReason} />}

                <ItemList title={`🏛 Bloques (${data.buildings.length})`} items={data.buildings} render={(b) => b.name}
                  onEdit={(b) => openEdit({ kind: "building", data: { ...b } })}
                  onDelete={(b) => remove("map_buildings", b.id, b.name)} />

                <ItemList title={`🅿️ Parqueos (${data.parkings.length})`} items={data.parkings}
                  render={(p) => `${p.name ?? "Parqueo"} (${PARKING_LABELS[p.type]})`}
                  onEdit={(p) => openEdit({ kind: "parking", data: { ...p } })}
                  onDelete={(p) => remove("map_parkings", p.id, p.name ?? "Parqueo")} />

                <ItemList title={`🚪 Entradas de bloque (${data.entrances.length})`} items={data.entrances}
                  render={(e) => {
                    const b = data.buildings.find((bb) => bb.id === e.building_id);
                    return `${e.name ?? "Entrada"}${e.is_main ? " ⭐" : ""} · ${b?.name ?? "?"}`;
                  }}
                  onEdit={(e) => openEdit({ kind: "entrance", data: { ...e } })}
                  onDelete={(e) => remove("map_entrances", e.id, e.name ?? "entrada")} />

                <ItemList title={`⛩ Accesos al campus (${data.campusEntrances.length})`} items={data.campusEntrances}
                  render={(c) => {
                    const dirIcon = c.direction === "exit" ? "⬆️ salida" : c.direction === "entry" ? "⬇️ entrada" : "↕️ ambas";
                    return `${c.name} · ${dirIcon} · ${c.entry_type}`;
                  }}
                  onEdit={(c) => openEdit({ kind: "campus-entry", data: { ...c } })}
                  onDelete={(c) => remove("map_campus_entrances", c.id, c.name)} />

                <ItemList title={`🛣 Calles (${data.paths.length})`} items={data.paths}
                  render={(p) => `${p.name ?? "Calle s/n"} · ${p.access_modes?.join("+")} · ${p.geom?.coordinates?.length ?? 0} pts`}
                  onEdit={(p) => openEdit({ kind: "path", data: { ...p } })}
                  onDelete={(p) => remove("map_paths", p.id, p.name ?? "calle")} />

                <ItemList title={`📍 Puntos de referencia (${data.landmarks.length})`} items={data.landmarks}
                  render={(l) => `${l.name} · ${l.kind}`}
                  onEdit={(l) => openEdit({ kind: "landmark", data: { ...l } })}
                  onDelete={(l) => remove("map_landmarks", l.id, l.name)} />

                <Card className="p-3">
                  <Button onClick={exportGeoJSON} variant="outline" size="sm" className="w-full">
                    Exportar todo como GeoJSON
                  </Button>
                </Card>
              </TabsContent>

              {/* ============ AULAS ============ */}
              <TabsContent value="rooms">
                <Card className="p-3 mb-3">
                  <Label>Bloque para gestionar aulas</Label>
                  <select className="w-full border rounded-md p-2 text-sm mt-1 bg-background"
                    value={editingBuilding?.id ?? ""} onChange={(e) => {
                      const b = data.buildings.find((bb) => bb.id === e.target.value);
                      setEditingBuilding(b ?? null);
                    }}>
                    <option value="">— elige un bloque —</option>
                    {data.buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </Card>
                <RoomsManager buildingId={editingBuilding?.id ?? null}
                  floors={data.floors.filter((f) => f.building_id === editingBuilding?.id)}
                  rooms={data.rooms.filter((r) => r.building_id === editingBuilding?.id)}
                  onChanged={data.reload} />
              </TabsContent>

              {/* ============ USUARIOS ============ */}
              <TabsContent value="users">
                <UsersManager currentRole={role} />
              </TabsContent>
            </Tabs>
          </aside>

          <main className="relative">
            <CampusMap
              buildings={data.buildings}
              entrances={data.entrances}
              campusEntrances={data.campusEntrances}
              parkings={data.parkings}
              paths={data.paths.filter((p) => {
                if (pathFilter === "all") return true;
                return p.access_modes?.includes(pathFilter);
              })}
              landmarks={data.landmarks}
              onMapClick={onMapClick}
              editing={editingMap}
              drawingPoints={drawing}
              drawingMode={drawingMode}
              onFeatureEdit={(target) => openEdit(target as EditTarget)}
              onFeatureDelete={(table, id, label) => remove(table, id, label)}
              onPathQuickStatus={quickPathStatus}
              showQuickStatus={pathFilter !== "all"}
              snapVertices={drawingMode === "line" ? collectPathVertices(data.paths) : undefined}
              className="absolute inset-0"
            />

            {/* Filtro flotante de calles + leyenda de estado */}
            <div className="absolute top-3 left-3 z-[1000] bg-card/95 backdrop-blur border rounded-lg shadow-lg p-2 text-xs space-y-2 max-w-[260px]">
              <div className="font-semibold flex items-center gap-1">
                <Bell className="h-3 w-3" /> Filtro de calles
              </div>
              <div className="grid grid-cols-3 gap-1">
                <Button size="sm" variant={pathFilter === "all" ? "default" : "outline"}
                  className="h-7 text-[11px]" onClick={() => setPathFilter("all")}>Todas</Button>
                <Button size="sm" variant={pathFilter === "pedestrian" ? "default" : "outline"}
                  className="h-7 text-[11px]" onClick={() => setPathFilter("pedestrian")}>🚶 Peat.</Button>
                <Button size="sm" variant={pathFilter === "vehicle" ? "default" : "outline"}
                  className="h-7 text-[11px]" onClick={() => setPathFilter("vehicle")}>🚗 Veh.</Button>
              </div>
              {pathFilter !== "all" && (
                <p className="text-[10px] text-muted-foreground leading-tight">
                  💡 Clic en una calle para cambiar su <b>estado</b>. Se notificará vía push solo si el estado cambia.
                </p>
              )}
            </div>

            {tool !== "none" && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-primary text-primary-foreground px-4 py-1.5 rounded-full shadow-lg text-sm font-medium">
                ✏️ {toolLabel(tool)} · haz clic en el mapa
              </div>
            )}
          </main>
        </div>
      )}
    </div>
  );
}

function toolLabel(t: DrawTool) {
  return ({
    "building": "Crear bloque (1 clic)",
    "parking": "Crear parqueo (1 clic)",
    "entrance": "Crear entrada de bloque (1 clic)",
    "campus-entry": "Crear acceso al campus (1 clic)",
    "landmark": "Crear punto de referencia (1 clic)",
    "path-ped": "Calle peatonal (clic A → B…)",
    "path-veh": "Calle vehicular (clic A → B…)",
    "none": "",
  } as Record<DrawTool, string>)[t];
}

function ToolBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button size="sm" variant={active ? "default" : "outline"} onClick={onClick} className="h-auto py-2 text-xs whitespace-normal">
      {children}
    </Button>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-sm">{label}</Label>
      {hint && <p className="text-[11px] text-muted-foreground leading-snug">{hint}</p>}
      {children}
    </div>
  );
}

function ItemList<T extends { id: string }>({ title, items, render, onEdit, onDelete }: {
  title: string; items: T[]; render: (i: T) => string;
  onEdit: (i: T) => void; onDelete: (i: T) => void;
}) {
  return (
    <Card className="p-3">
      <Label>{title}</Label>
      <ul className="mt-2 space-y-1 max-h-48 overflow-auto">
        {items.length === 0 && <li className="text-xs text-muted-foreground">— vacío —</li>}
        {items.map((it) => (
          <li key={it.id} className="text-sm flex items-center justify-between gap-2 border-b py-1">
            <span className="truncate flex-1">{render(it)}</span>
            <Button size="icon" variant="ghost" onClick={() => onEdit(it)} className="h-7 w-7"><Pencil className="h-3 w-3" /></Button>
            <Button size="icon" variant="ghost" onClick={() => onDelete(it)} className="h-7 w-7 text-destructive"><Trash2 className="h-3 w-3" /></Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function EditPanel({ target, setTarget, onSave, onDelete, originalStatus, reason, setReason }: {
  target: NonNullable<EditTarget>;
  setTarget: (t: EditTarget) => void;
  onSave: () => void;
  onDelete: (table: string, id: string, label: string) => void;
  originalStatus: FeatureStatus | null;
  reason: string;
  setReason: (s: string) => void;
}) {
  const t = target;
  const update = (patch: any) => setTarget({ ...t, data: { ...(t.data as any), ...patch } } as any);
  const currentStatus = ((t.data as any).status ?? "active") as FeatureStatus;
  const statusChanged = originalStatus !== null && currentStatus !== originalStatus;
  return (
    <Card className="p-3 space-y-2 border-primary border-2">
      <div className="flex items-center justify-between">
        <Label className="text-primary">✏️ Editando {labelOf(t.kind)}</Label>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setTarget(null)}><X className="h-3 w-3" /></Button>
      </div>

      <Field label="Estado del elemento" hint="Si cambias el estado y guardas, se enviará una notificación push y un correo a los administradores con el motivo.">
        <select className="w-full border rounded-md p-2 text-sm bg-background"
          value={currentStatus}
          onChange={(e) => update({ status: e.target.value as FeatureStatus })}>
          {(Object.keys(FEATURE_STATUS_LABEL) as FeatureStatus[]).map((s) => (
            <option key={s} value={s}>{FEATURE_STATUS_LABEL[s]}</option>
          ))}
        </select>
      </Field>

      {statusChanged && (
        <Field
          label="Motivo del cambio *"
          hint={`Explica por qué cambiaste el estado de "${FEATURE_STATUS_LABEL[originalStatus!]}" a "${FEATURE_STATUS_LABEL[currentStatus]}". Se enviará en la notificación push y en el correo a los administradores.`}
        >
          <Textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej: Mantenimiento programado del techo. Reapertura prevista el lunes."
          />
        </Field>
      )}

      {t.kind === "building" && (
        <>
          <Field label="Nombre"><Input value={(t.data as MapBuilding).name} onChange={(e) => update({ name: e.target.value })} /></Field>
          <Field label="Código"><Input value={(t.data as MapBuilding).code ?? ""} onChange={(e) => update({ code: e.target.value })} /></Field>
          <Field label="Pisos"><Input type="number" min={1} value={(t.data as MapBuilding).floors_count}
            onChange={(e) => update({ floors_count: +e.target.value || 1 })} /></Field>
          <Field label="Descripción"><Textarea rows={2} value={(t.data as MapBuilding).description ?? ""}
            onChange={(e) => update({ description: e.target.value })} /></Field>
          <CoordFields lat={(t.data as MapBuilding).centroid_lat} lng={(t.data as MapBuilding).centroid_lng}
            onChange={(lat, lng) => update({ centroid_lat: lat, centroid_lng: lng })} />
        </>
      )}

      {t.kind === "parking" && (
        <>
          <Field label="Nombre"><Input value={(t.data as MapParking).name ?? ""} onChange={(e) => update({ name: e.target.value })} /></Field>
          <Field label="Tipo">
            <select className="w-full border rounded-md p-2 text-sm bg-background"
              value={(t.data as MapParking).type} onChange={(e) => update({ type: e.target.value })}>
              {(Object.keys(PARKING_LABELS) as ParkingType[]).map((k) => <option key={k} value={k}>{PARKING_LABELS[k]}</option>)}
            </select>
          </Field>
          <Field label="Capacidad"><Input type="number" value={(t.data as MapParking).capacity ?? ""}
            onChange={(e) => update({ capacity: e.target.value === "" ? null : +e.target.value })} /></Field>
          <CoordFields lat={(t.data as MapParking).centroid_lat} lng={(t.data as MapParking).centroid_lng}
            onChange={(lat, lng) => update({ centroid_lat: lat, centroid_lng: lng })} />
        </>
      )}

      {t.kind === "entrance" && (
        <>
          <Field label="Nombre"><Input value={(t.data as MapEntrance).name ?? ""} onChange={(e) => update({ name: e.target.value })} /></Field>
          <Field label="Modo de acceso">
            <select className="w-full border rounded-md p-2 text-sm bg-background"
              value={(t.data as MapEntrance).access_modes?.length === 2 ? "both" : (t.data as MapEntrance).access_modes?.[0] ?? "pedestrian"}
              onChange={(e) => {
                const v = e.target.value;
                update({ access_modes: v === "both" ? ["pedestrian", "vehicle"] : [v] });
              }}>
              <option value="pedestrian">Peatonal</option>
              <option value="vehicle">Vehicular</option>
              <option value="both">Mixta</option>
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={(t.data as MapEntrance).is_main}
              onChange={(e) => update({ is_main: e.target.checked })} />
            Entrada principal
          </label>
          <CoordFields lat={(t.data as MapEntrance).lat} lng={(t.data as MapEntrance).lng}
            onChange={(lat, lng) => update({ lat, lng })} />
        </>
      )}

      {t.kind === "campus-entry" && (
        <>
          <Field label="Nombre"><Input value={(t.data as MapCampusEntrance).name} onChange={(e) => update({ name: e.target.value })} /></Field>
          <Field label="Sentido" hint="Si por aquí solo se entra, solo se sale, o ambos.">
            <select className="w-full border rounded-md p-2 text-sm bg-background"
              value={(t.data as MapCampusEntrance).direction ?? "both"}
              onChange={(e) => update({ direction: e.target.value as CampusDirection })}>
              {(Object.keys(CAMPUS_DIRECTION_LABEL) as CampusDirection[]).map((d) => (
                <option key={d} value={d}>{CAMPUS_DIRECTION_LABEL[d]}</option>
              ))}
            </select>
          </Field>
          <Field label="Tipo de acceso">
            <select className="w-full border rounded-md p-2 text-sm bg-background"
              value={(t.data as MapCampusEntrance).entry_type} onChange={(e) => update({ entry_type: e.target.value })}>
              <option value="pedestrian">Peatonal</option>
              <option value="vehicle">Vehicular</option>
              <option value="mixed">Mixta</option>
            </select>
          </Field>
          <CoordFields lat={(t.data as MapCampusEntrance).lat} lng={(t.data as MapCampusEntrance).lng}
            onChange={(lat, lng) => update({ lat, lng })} />
        </>
      )}

      {t.kind === "landmark" && (
        <>
          <Field label="Nombre"><Input value={(t.data as MapLandmark).name} onChange={(e) => update({ name: e.target.value })} /></Field>
          <Field label="Tipo">
            <select className="w-full border rounded-md p-2 text-sm bg-background"
              value={(t.data as MapLandmark).kind} onChange={(e) => update({ kind: e.target.value })}>
              <option value="reference">Referencia</option>
              <option value="plaza">Plazoleta</option>
              <option value="corridor">Corredor</option>
              <option value="restroom">Baños</option>
              <option value="cafeteria">Cafetería</option>
              <option value="bar">Bar</option>
              <option value="atm">Cajero</option>
              <option value="emergency">Emergencia</option>
              <option value="other">Otro</option>
            </select>
          </Field>
          <Field label="Descripción">
            <Textarea rows={2} value={(t.data as MapLandmark).description ?? ""}
              onChange={(e) => update({ description: e.target.value })} />
          </Field>
          <CoordFields lat={(t.data as MapLandmark).lat} lng={(t.data as MapLandmark).lng}
            onChange={(lat, lng) => update({ lat, lng })} />
        </>
      )}

      {t.kind === "path" && (() => {
        const path = t.data as MapPath;
        const verts = (path.geom?.coordinates ?? []).map(([lng, lat]) => ({ lat, lng }));
        const setVerts = (next: { lat: number; lng: number }[]) => {
          update({
            geom: { type: "LineString", coordinates: next.map((p) => [p.lng, p.lat]) },
          });
        };
        const move = (i: number, dir: -1 | 1) => {
          const j = i + dir;
          if (j < 0 || j >= verts.length) return;
          const next = verts.slice();
          [next[i], next[j]] = [next[j], next[i]];
          setVerts(next);
        };
        const removeVert = (i: number) => {
          if (verts.length <= 2) {
            toast({ title: "Una calle necesita al menos 2 vértices", variant: "destructive" });
            return;
          }
          setVerts(verts.filter((_, k) => k !== i));
        };
        const updateVert = (i: number, lat: number, lng: number) => {
          const next = verts.slice();
          next[i] = { lat, lng };
          setVerts(next);
        };
        const addVert = (lat: number, lng: number) => setVerts([...verts, { lat, lng }]);

        return (
          <>
            <Field label="Nombre interno"><Input value={path.name ?? ""} onChange={(e) => update({ name: e.target.value })} /></Field>
            <Field label="Modo">
              <select className="w-full border rounded-md p-2 text-sm bg-background"
                value={path.access_modes?.[0] ?? "pedestrian"}
                onChange={(e) => update({ access_modes: [e.target.value] })}>
                <option value="pedestrian">Peatonal</option>
                <option value="vehicle">Vehicular</option>
              </select>
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={path.bidirectional}
                onChange={(e) => update({ bidirectional: e.target.checked })} />
              Bidireccional
            </label>

            <div className="space-y-2 pt-2 border-t">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Vértices ({verts.length})
              </Label>
              <ul className="space-y-1 max-h-72 overflow-auto rounded border bg-muted/30 p-1.5">
                {verts.map((v, i) => (
                  <li key={i} className="bg-background border rounded p-1.5 space-y-1">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <GripVertical className="h-3 w-3" /> Vértice {i + 1}
                      </span>
                      <div className="flex gap-0.5">
                        <button type="button" className="px-1 hover:bg-muted rounded" onClick={() => move(i, -1)} disabled={i === 0} title="Subir">
                          <ArrowUp className="h-3 w-3" />
                        </button>
                        <button type="button" className="px-1 hover:bg-muted rounded" onClick={() => move(i, 1)} disabled={i === verts.length - 1} title="Bajar">
                          <ArrowDown className="h-3 w-3" />
                        </button>
                        <button type="button" className="px-1 text-destructive hover:bg-destructive/10 rounded" onClick={() => removeVert(i)} title="Eliminar">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      <Input type="number" step="0.000001" value={v.lat}
                        onChange={(e) => updateVert(i, +e.target.value, v.lng)}
                        className="h-7 text-[11px] font-mono" />
                      <Input type="number" step="0.000001" value={v.lng}
                        onChange={(e) => updateVert(i, v.lat, +e.target.value)}
                        className="h-7 text-[11px] font-mono" />
                    </div>
                    <PasteCoordInput
                      buttonLabel="Pegar"
                      onAdd={(la, ln) => updateVert(i, la, ln)}
                    />
                  </li>
                ))}
              </ul>
              <div className="space-y-1">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Añadir vértice al final (Google Maps)
                </Label>
                <PasteCoordInput buttonLabel="Añadir" onAdd={addVert} />
              </div>
            </div>
          </>
        );
      })()}

      <div className="flex gap-2 pt-2">
        <Button size="sm" onClick={onSave} className="flex-1"><Save className="h-3 w-3 mr-1" /> Guardar</Button>
        <Button size="sm" variant="destructive" onClick={() => onDelete(tableOf(t.kind), (t.data as any).id, labelOf(t.kind))}>
          <Trash2 className="h-3 w-3 mr-1" /> Eliminar
        </Button>
      </div>
    </Card>
  );
}

function CoordFields({ lat, lng, onChange }: { lat: number; lng: number; onChange: (lat: number, lng: number) => void }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Latitud" hint="Decimal (ej: -2.150900)">
          <Input type="number" step="0.000001" value={lat} onChange={(e) => onChange(+e.target.value, lng)} />
        </Field>
        <Field label="Longitud" hint="Decimal (ej: -79.601100)">
          <Input type="number" step="0.000001" value={lng} onChange={(e) => onChange(lat, +e.target.value)} />
        </Field>
      </div>
      <div className="space-y-1">
        <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
          O pega coordenadas de Google Maps
        </Label>
        <PasteCoordInput
          buttonLabel="Reemplazar"
          onAdd={(la, ln) => onChange(la, ln)}
        />
      </div>
    </div>
  );
}

function labelOf(k: NonNullable<EditTarget>["kind"]) {
  return { building: "bloque", parking: "parqueo", entrance: "entrada de bloque", "campus-entry": "acceso al campus", landmark: "punto de referencia", path: "calle" }[k];
}
function tableOf(k: NonNullable<EditTarget>["kind"]) {
  return { building: "map_buildings", parking: "map_parkings", entrance: "map_entrances", "campus-entry": "map_campus_entrances", landmark: "map_landmarks", path: "map_paths" }[k];
}
function audienceLabel(a?: string) {
  return ({ public: "🌐 público", student: "🎓 estudiante", teacher: "👨‍🏫 docente", staff: "🏢 administrativo", admin: "admin", superadmin: "superadmin" } as Record<string, string>)[a ?? "public"] ?? a ?? "público";
}

// ============================================================
// Aulas
// ============================================================
function RoomsManager({ buildingId, floors, rooms, onChanged }: {
  buildingId: string | null; floors: any[]; rooms: any[]; onChanged: () => void;
}) {
  const [name, setName] = useState(""); const [code, setCode] = useState("");
  const [floorId, setFloorId] = useState(""); const [directions, setDirections] = useState("");
  const [audience, setAudience] = useState<"public" | "student" | "teacher" | "staff">("public");
  const [floorLevel, setFloorLevel] = useState(0); const [floorName, setFloorName] = useState("");
  const [editing, setEditing] = useState<any | null>(null);

  if (!buildingId) return <Card className="p-3"><p className="text-sm text-muted-foreground">Selecciona un bloque arriba.</p></Card>;

  const addFloor = async () => {
    const { error } = await db.from("map_floors").insert({
      building_id: buildingId, level: floorLevel, name: floorName || `Piso ${floorLevel}`,
    });
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { setFloorName(""); onChanged(); }
  };
  const notifyRoom = async (action: "creada" | "actualizada", roomId: string, roomName: string, roomCode: string | null, aud: string) => {
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const url = `${origin}/?focus=room:${roomId}`;
      const title = `Mapa UNEMI · Aula ${action}`;
      const body = `${roomName}${roomCode ? ` (${roomCode})` : ""}`;
      // Solo push: las aulas NO envían correo.
      await supabase.functions.invoke("send-push-notification", {
        body: { title, body, audience: aud, url, data: { kind: "room", id: roomId, name: roomName, code: roomCode, url } },
      });
    } catch (e) {
      console.warn("notifyRoom failed:", e);
    }
  };

  const addRoom = async () => {
    const { data: created, error } = await db.from("map_rooms").insert({
      building_id: buildingId, floor_id: floorId || null,
      name, code: code || null, directions: directions || null,
      target_audience: audience,
    }).select("id").single();
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else {
      const aud = audience; const nm = name; const cd = code;
      const newId = (created as any)?.id as string | undefined;
      setName(""); setCode(""); setDirections(""); setAudience("public");
      toast({ title: "Aula creada" });
      onChanged();
      if (newId) notifyRoom("creada", newId, nm, cd || null, aud);
    }
  };
  const saveRoom = async () => {
    if (!editing) return;
    const { error } = await db.from("map_rooms").update({
      name: editing.name, code: editing.code || null,
      floor_id: editing.floor_id || null,
      directions: editing.directions || null,
      target_audience: editing.target_audience ?? "public",
    }).eq("id", editing.id);
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    toast({ title: "Aula actualizada" });
    const snap = { id: editing.id as string, name: editing.name as string, code: (editing.code || null) as string | null, audience: (editing.target_audience ?? "public") as string };
    setEditing(null);
    onChanged();
    notifyRoom("actualizada", snap.id, snap.name, snap.code, snap.audience);
  };
  const delRoom = async (id: string) => {
    if (!confirm("¿Eliminar aula?")) return;
    await db.from("map_rooms").delete().eq("id", id); onChanged();
  };

  return (
    <div className="space-y-3">
      <Card className="p-3 space-y-2">
        <Label>Nuevo piso</Label>
        <Field label="Nivel" hint="0 = planta baja, 1 = primer piso, etc.">
          <Input type="number" value={floorLevel} onChange={(e) => setFloorLevel(+e.target.value)} className="w-24" />
        </Field>
        <Field label="Nombre del piso" hint="Opcional. Ej: 'Planta baja', 'Primer piso'.">
          <Input value={floorName} onChange={(e) => setFloorName(e.target.value)} placeholder="Planta baja" />
        </Field>
        <Button size="sm" onClick={addFloor}>Agregar piso</Button>
        <div className="text-xs text-muted-foreground">{floors.length} piso(s) creados</div>
      </Card>

      {/* Edición inline */}
      {editing && (
        <Card className="p-3 space-y-2 border-primary border-2">
          <div className="flex items-center justify-between">
            <Label className="text-primary">✏️ Editando aula</Label>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditing(null)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
          <Field label="Nombre *">
            <Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          </Field>
          <Field label="Código">
            <Input value={editing.code ?? ""} onChange={(e) => setEditing({ ...editing, code: e.target.value })} />
          </Field>
          <Field label="Piso">
            <select className="w-full border rounded-md p-2 text-sm bg-background"
              value={editing.floor_id ?? ""} onChange={(e) => setEditing({ ...editing, floor_id: e.target.value })}>
              <option value="">— sin piso —</option>
              {floors.map((f) => <option key={f.id} value={f.id}>{f.name ?? `Piso ${f.level}`}</option>)}
            </select>
          </Field>
          <Field label="¿Quién puede ver esta aula? *"
            hint="Define la audiencia. Cada nivel también ve los inferiores (docente ve público y estudiante, etc.).">
            <select className="w-full border rounded-md p-2 text-sm bg-background"
              value={editing.target_audience ?? "public"}
              onChange={(e) => setEditing({ ...editing, target_audience: e.target.value })}>
              <option value="public">🌐 Público (todos)</option>
              <option value="student">🎓 Estudiantes</option>
              <option value="teacher">👨‍🏫 Docentes</option>
              <option value="staff">🏢 Administrativos</option>
            </select>
          </Field>
          <Field label="Indicaciones internas">
            <Textarea rows={2} value={editing.directions ?? ""}
              onChange={(e) => setEditing({ ...editing, directions: e.target.value })} />
          </Field>
          <div className="flex gap-2">
            <Button size="sm" onClick={saveRoom} className="flex-1">
              <Save className="h-3 w-3 mr-1" /> Guardar
            </Button>
            <Button size="sm" variant="destructive" onClick={() => { delRoom(editing.id); setEditing(null); }}>
              <Trash2 className="h-3 w-3 mr-1" /> Eliminar
            </Button>
          </div>
        </Card>
      )}

      <Card className="p-3 space-y-2">
        <Label>Nueva aula / oficina</Label>
        <Field label="Nombre *" hint="Ej: 'Aula 203', 'Laboratorio de Redes', 'Decanato'.">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Aula 203" />
        </Field>
        <Field label="Código" hint="Opcional. Ej: 'A-203'.">
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="A-203" />
        </Field>
        <Field label="Piso" hint="A qué piso pertenece dentro del bloque.">
          <select className="w-full border rounded-md p-2 text-sm bg-background" value={floorId} onChange={(e) => setFloorId(e.target.value)}>
            <option value="">— sin piso —</option>
            {floors.map((f) => <option key={f.id} value={f.id}>{f.name ?? `Piso ${f.level}`}</option>)}
          </select>
        </Field>
        <Field label="¿Quién puede ver esta aula? *"
          hint="Público = visible para todos. Estudiante / Docente / Administrativo = solo ese rol y superiores la verán al buscar.">
          <select className="w-full border rounded-md p-2 text-sm bg-background"
            value={audience} onChange={(e) => setAudience(e.target.value as any)}>
            <option value="public">🌐 Público (todos los usuarios)</option>
            <option value="student">🎓 Solo estudiantes (y superiores)</option>
            <option value="teacher">👨‍🏫 Solo docentes (y superiores)</option>
            <option value="staff">🏢 Solo administrativos (y superiores)</option>
          </select>
        </Field>
        <Field label="Indicaciones internas" hint="Cómo llegar desde la entrada del bloque. Ej: 'Sube las escaleras y gira a la derecha'.">
          <Textarea rows={2} value={directions} onChange={(e) => setDirections(e.target.value)}
            placeholder="Sube las escaleras y gira a la derecha…" />
        </Field>
        <Button size="sm" onClick={addRoom} disabled={!name}>Agregar aula</Button>
      </Card>

      <Card className="p-3">
        <Label>Aulas existentes ({rooms.length})</Label>
        <ul className="mt-2 space-y-1 max-h-60 overflow-auto">
          {rooms.map((r) => (
            <li key={r.id} className="text-sm flex items-center justify-between gap-2 border-b py-1">
              <span className="truncate flex-1">
                {r.code ? `${r.code} · ` : ""}{r.name}
                <span className="ml-1 text-[10px] text-muted-foreground">({audienceLabel(r.target_audience)})</span>
              </span>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing({ ...r })}>
                <Pencil className="h-3 w-3" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => delRoom(r.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </li>
          ))}
          {rooms.length === 0 && <li className="text-xs text-muted-foreground">Sin aulas aún</li>}
        </ul>
      </Card>
    </div>
  );
}

// ============================================================
// Usuarios admin
// ============================================================
function UsersManager({ currentRole }: { currentRole: string }) {
  const isSuper = currentRole === "superadmin";
  const [list, setList] = useState<any[]>([]);
  const [form, setForm] = useState({
    email: "", password: "", first_name: "", last_name: "",
    role: "operator" as "admin" | "operator",
    user_type: "administrativo" as "estudiante" | "docente" | "administrativo",
  });
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    const { data } = await db.rpc("get_admin_users");
    setList(data ?? []);
  };
  useEffect(() => { reload(); }, []);

  if (!isSuper) {
    return (
      <Card className="p-3">
        <p className="text-sm text-muted-foreground">
          Solo un <b>superadmin</b> puede gestionar usuarios.
        </p>
      </Card>
    );
  }

  const create = async () => {
    if (!form.email || !form.password) {
      toast({ title: "Email y contraseña requeridos", variant: "destructive" });
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("admin-create-user", { body: form });
    setBusy(false);
    if (error || (data as any)?.error) {
      toast({ title: "Error", description: error?.message ?? (data as any)?.error, variant: "destructive" });
      return;
    }
    toast({ title: "Usuario creado", description: `${form.email} · ${form.role}` });
    setForm({ ...form, email: "", password: "", first_name: "", last_name: "" });
    reload();
  };

  return (
    <div className="space-y-3">
      <Card className="p-3 space-y-2">
        <Label>Crear administrador / operador</Label>
        <Field label="Correo *" hint="Será su usuario para iniciar sesión.">
          <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="usuario@unemi.edu.ec" />
        </Field>
        <Field label="Contraseña *" hint="Mínimo 6 caracteres. Compártela con el usuario.">
          <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Nombre"><Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></Field>
          <Field label="Apellido"><Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></Field>
        </div>
        <Field label="Rol" hint="operator: edita el mapa. admin: edita y crea usuarios.">
          <select className="w-full border rounded-md p-2 text-sm bg-background" value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as any })}>
            <option value="operator">operator (edita mapa)</option>
            <option value="admin">admin (gestiona todo)</option>
          </select>
        </Field>
        <Field label="Tipo de usuario">
          <select className="w-full border rounded-md p-2 text-sm bg-background" value={form.user_type}
            onChange={(e) => setForm({ ...form, user_type: e.target.value as any })}>
            <option value="administrativo">administrativo</option>
            <option value="docente">docente</option>
            <option value="estudiante">estudiante</option>
          </select>
        </Field>
        <Button size="sm" onClick={create} disabled={busy} className="w-full">
          {busy ? "Creando…" : "Crear usuario"}
        </Button>
      </Card>

      <Card className="p-3">
        <Label>Administradores existentes</Label>
        <ul className="mt-2 space-y-1 max-h-72 overflow-auto">
          {list.map((u) => (
            <li key={u.user_id} className="text-sm flex justify-between border-b py-1">
              <span>{u.first_name ?? ""} {u.last_name ?? ""} · <span className="text-muted-foreground">{u.email}</span></span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-muted">{u.role}</span>
            </li>
          ))}
          {list.length === 0 && <li className="text-xs text-muted-foreground">Sin administradores</li>}
        </ul>
      </Card>
    </div>
  );
}
