// ==============================================================================
// ParentConnect — Geospatial & Neighborhood Models (geo-service)
// ==============================================================================

export interface GeoCoordinates {
  lng: number;
  lat: number;
}

export interface GeoPoint {
  type: 'Point';
  coordinates: [number, number]; // [lng, lat]
}

export interface GeoPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

export interface UserLocation {
  user_id: string;
  location?: GeoPoint;
  neighborhood_id?: string;
  neighborhood_name?: string;
  precision_m: number;
  verified: boolean;
  updated_at: string | Date;
}

export interface NearbyParent {
  user_id: string;
  displayName?: string;
  distance_m: number; // Anti-triangulation: rounded to nearest 100m
  verified?: boolean;
  trustLevel?: 'close' | 'neighborhood' | 'all' | 'none';
  childrenCount?: number;
  neighborhood?: string;
  avatar?: string;
}

export interface ProximityResult {
  target_user_id: string;
  distance_m: number;
}

export interface Neighborhood {
  id: string;
  name: string;
  city: string;
  boundary?: GeoPolygon;
  center: GeoPoint;
  created_at?: string | Date;
  parentsCount?: number;
  description?: string;
}

export type MeetingPointType = 'park' | 'daycare' | 'town_hall';

export interface MeetingPoint {
  id: string;
  neighborhood_id: string;
  neighborhood_name?: string;
  name: string;
  type: MeetingPointType;
  location: GeoPoint;
  address?: string;
  description?: string;
  safetyFeatures?: string[];
}

export type CircleLevel = 'close' | 'neighborhood' | 'all';

export interface TrustCircle {
  id: string;
  owner_id: string;
  level: CircleLevel;
  members: string[];
  updated_at: string | Date;
}

export type VerificationMethod = 'postal_code' | 'document' | 'neighbor_validation';
export type VerificationStatus = 'pending' | 'verified' | 'rejected';

export interface AddressVerification {
  id: string;
  user_id: string;
  method: VerificationMethod;
  status: VerificationStatus;
  validated_by: string[];
  created_at: string | Date;
  updated_at: string | Date;
  required_validations?: number;
}

export interface AddressValidationActionResponse {
  id: string;
  status: VerificationStatus;
  validations_count: number;
  required_validations: number;
  is_fully_verified: boolean;
  message: string;
}
