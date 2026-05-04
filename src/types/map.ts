// Tipos compartidos del Mapa UNEMI
export type AccessMode = "pedestrian" | "vehicle";
export type TargetAudience = "public" | "student" | "teacher" | "staff" | "admin" | "superadmin";
export type ParkingType = "car" | "motorcycle" | "bicycle" | "bus" | "authority" | "disabled";
export type CampusEntryType = "pedestrian" | "vehicle" | "mixed";
export type CampusDirection = "entry" | "exit" | "both";
export type FeatureStatus = "active" | "maintenance" | "closed" | "temporary_closed";

export const CAMPUS_DIRECTION_LABEL: Record<CampusDirection, string> = {
  entry: "Solo entrada",
  exit: "Solo salida",
  both: "Entrada y salida",
};

export const FEATURE_STATUS_LABEL: Record<FeatureStatus, string> = {
  active: "Operativo",
  maintenance: "En mantenimiento",
  temporary_closed: "Cerrado temporalmente",
  closed: "Cerrado",
};

export const FEATURE_STATUS_COLOR: Record<FeatureStatus, string> = {
  active: "hsl(142 70% 42%)",
  maintenance: "hsl(38 95% 50%)",
  temporary_closed: "hsl(22 90% 55%)",
  closed: "hsl(0 75% 50%)",
};

export interface GeoPolygon { type: "Polygon"; coordinates: number[][][]; }
export interface GeoLineString { type: "LineString"; coordinates: number[][]; }

export interface MapBuilding {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  faculty: string | null;
  geom: GeoPolygon;
  centroid_lat: number;
  centroid_lng: number;
  floors_count: number;
  image_url: string | null;
  target_audience: TargetAudience;
  is_active: boolean;
  status: FeatureStatus;
}

export interface MapFloor {
  id: string;
  building_id: string;
  level: number;
  name: string | null;
  map_image_url: string | null;
}

export interface MapRoom {
  id: string;
  building_id: string;
  floor_id: string | null;
  room_type_id: string | null;
  code: string | null;
  name: string;
  description: string | null;
  directions: string | null;
  image_url: string | null;
  keywords: string[] | null;
  target_audience: TargetAudience;
}

export interface MapEntrance {
  id: string;
  building_id: string;
  name: string | null;
  lat: number;
  lng: number;
  is_main: boolean;
  access_modes: AccessMode[];
  status: FeatureStatus;
}

export interface MapCampusEntrance {
  id: string;
  name: string;
  entry_type: CampusEntryType;
  direction: CampusDirection;
  lat: number;
  lng: number;
  description: string | null;
  is_active: boolean;
  status: FeatureStatus;
}

export interface MapPath {
  id: string;
  name: string | null;
  geom: GeoLineString;
  access_modes: AccessMode[];
  bidirectional: boolean;
  speed_kmh: number | null;
  status: FeatureStatus;
}

export interface MapParking {
  id: string;
  name: string | null;
  type: ParkingType;
  geom: GeoPolygon;
  centroid_lat: number;
  centroid_lng: number;
  capacity: number | null;
  status: FeatureStatus;
}

export type LandmarkKind =
  | "reference" | "plaza" | "corridor" | "restroom" | "cafeteria"
  | "bar" | "atm" | "emergency" | "entrance" | "exit" | "gate" | "other";

export interface MapLandmark {
  id: string;
  name: string;
  kind: LandmarkKind;
  lat: number;
  lng: number;
  description: string | null;
  icon: string | null;
  is_active: boolean;
  status: FeatureStatus;
}

export interface LatLng { lat: number; lng: number; }

export interface RouteResult {
  distance: number;
  duration: number;
  coords: LatLng[];
  steps: { instruction: string; distance: number; lat: number; lng: number }[];
}

export interface ArrivalGuide {
  exteriorRoute: RouteResult;
  building: MapBuilding;
  floor: MapFloor | null;
  room: MapRoom | null;
  arrivalInstruction: string;
  indoorInstruction: string | null;
}
