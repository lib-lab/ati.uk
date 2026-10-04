import { CONFIG } from '../config';
import { getCity } from './cities';
import type { Id } from '../types';

const EARTH_RADIUS_KM = 6371;

/** Great-circle distance in km. */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

export function cityDistanceKm(a: Id, b: Id): number {
  const ca = getCity(a);
  const cb = getCity(b);
  return haversineKm(ca.lat, ca.lon, cb.lat, cb.lon);
}

/** Approximate road distance used for "rate per km". */
export function roadDistanceKm(a: Id, b: Id): number {
  return Math.round(cityDistanceKm(a, b) * CONFIG.roadFactor);
}
