import { useEffect, useState } from "react";
import { db } from "@/integrations/supabase/db";
import type { MapBuilding, MapFloor, MapRoom, MapEntrance, MapPath, MapParking, MapCampusEntrance, MapLandmark } from "@/types/map";

export function useMapData() {
  const [buildings, setBuildings] = useState<MapBuilding[]>([]);
  const [floors, setFloors] = useState<MapFloor[]>([]);
  const [rooms, setRooms] = useState<MapRoom[]>([]);
  const [entrances, setEntrances] = useState<MapEntrance[]>([]);
  const [campusEntrances, setCampusEntrances] = useState<MapCampusEntrance[]>([]);
  const [paths, setPaths] = useState<MapPath[]>([]);
  const [parkings, setParkings] = useState<MapParking[]>([]);
  const [landmarks, setLandmarks] = useState<MapLandmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const [b, f, r, e, ce, p, pk, lm] = await Promise.all([
        db.from("map_buildings").select("*"),
        db.from("map_floors").select("*"),
        db.from("map_rooms").select("*"),
        db.from("map_entrances").select("*"),
        db.from("map_campus_entrances").select("*"),
        db.from("map_paths").select("*"),
        db.from("map_parkings").select("*"),
        db.from("map_landmarks").select("*"),
      ]);
      setBuildings((b.data as any) ?? []);
      setFloors((f.data as any) ?? []);
      setRooms((r.data as any) ?? []);
      setEntrances((e.data as any) ?? []);
      setCampusEntrances((ce.data as any) ?? []);
      setPaths((p.data as any) ?? []);
      setParkings((pk.data as any) ?? []);
      setLandmarks((lm.data as any) ?? []);
      const firstErr = [b, f, r, e, p, pk, lm].find((x) => x.error);
      setError(firstErr?.error?.message ?? null);
    } catch (err: any) {
      setError(err.message ?? "Error cargando mapa");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  return { buildings, floors, rooms, entrances, campusEntrances, paths, parkings, landmarks, loading, error, reload };
}
