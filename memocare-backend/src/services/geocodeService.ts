import { haversineDistanceMeters } from './locationService';

export interface PlaceName {
  place: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  label: string;
  source: 'osm' | 'offline';
}

/**
 * A small offline gazetteer so the app can always show *something* human
 * readable (place, city, state) even if OpenStreetMap is unreachable.
 */
const KNOWN_PLACES: { place: string; city: string; state: string; lat: number; lng: number }[] = [
  { place: 'Vashi', city: 'Navi Mumbai', state: 'Maharashtra', lat: 19.0771, lng: 72.9986 },
  { place: 'Sanpada', city: 'Navi Mumbai', state: 'Maharashtra', lat: 19.0633, lng: 73.0108 },
  { place: 'Juinagar', city: 'Navi Mumbai', state: 'Maharashtra', lat: 19.0483, lng: 73.0146 },
  { place: 'Nerul', city: 'Navi Mumbai', state: 'Maharashtra', lat: 19.033, lng: 73.0169 },
  { place: 'Seawoods', city: 'Navi Mumbai', state: 'Maharashtra', lat: 19.0203, lng: 73.0178 },
  { place: 'CBD Belapur', city: 'Navi Mumbai', state: 'Maharashtra', lat: 19.0176, lng: 73.0387 },
  { place: 'Kharghar', city: 'Navi Mumbai', state: 'Maharashtra', lat: 19.047, lng: 73.069 },
  { place: 'Kamothe', city: 'Navi Mumbai', state: 'Maharashtra', lat: 19.017, lng: 73.1 },
  { place: 'Kalamboli', city: 'Navi Mumbai', state: 'Maharashtra', lat: 18.993, lng: 73.1 },
  { place: 'New Panvel', city: 'Navi Mumbai', state: 'Maharashtra', lat: 18.993, lng: 73.123 },
  { place: 'Panvel', city: 'Navi Mumbai', state: 'Maharashtra', lat: 18.9894, lng: 73.1175 },
  { place: 'Taloja', city: 'Navi Mumbai', state: 'Maharashtra', lat: 19.07, lng: 73.1 },
  { place: 'Ulwe', city: 'Navi Mumbai', state: 'Maharashtra', lat: 18.976, lng: 73.03 },
  { place: 'Dronagiri', city: 'Navi Mumbai', state: 'Maharashtra', lat: 18.91, lng: 72.93 },
  { place: 'Airoli', city: 'Navi Mumbai', state: 'Maharashtra', lat: 19.159, lng: 72.993 },
  { place: 'Ghansoli', city: 'Navi Mumbai', state: 'Maharashtra', lat: 19.123, lng: 72.999 },
  { place: 'Koparkhairane', city: 'Navi Mumbai', state: 'Maharashtra', lat: 19.105, lng: 72.997 },
  { place: 'Rabale', city: 'Navi Mumbai', state: 'Maharashtra', lat: 19.14, lng: 73.0 },
  { place: 'Turbhe', city: 'Navi Mumbai', state: 'Maharashtra', lat: 19.08, lng: 73.02 },
  { place: 'Thane', city: 'Thane', state: 'Maharashtra', lat: 19.2183, lng: 72.9781 },
  { place: 'Mumbai', city: 'Mumbai', state: 'Maharashtra', lat: 19.076, lng: 72.8777 },
  { place: 'Pune', city: 'Pune', state: 'Maharashtra', lat: 18.5204, lng: 73.8567 },
  { place: 'Lonavala', city: 'Pune', state: 'Maharashtra', lat: 18.7546, lng: 73.4062 },
  { place: 'Alibag', city: 'Alibag', state: 'Maharashtra', lat: 18.6414, lng: 72.8722 },
  { place: 'Uran', city: 'Uran', state: 'Maharashtra', lat: 18.8781, lng: 72.9403 },
  { place: 'Badlapur', city: 'Badlapur', state: 'Maharashtra', lat: 19.1556, lng: 73.2656 },
  { place: 'Ambernath', city: 'Ambernath', state: 'Maharashtra', lat: 19.186, lng: 73.192 },
];

function buildLabel(place: string | null, city: string | null, state: string | null) {
  const parts: string[] = [];
  for (const part of [place, city, state]) {
    const value = part?.trim();
    if (value && !parts.some((p) => p.toLowerCase() === value.toLowerCase())) parts.push(value);
  }
  return parts.join(', ');
}

function nearestKnownPlace(latitude: number, longitude: number) {
  let best = KNOWN_PLACES[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of KNOWN_PLACES) {
    const distance = haversineDistanceMeters(latitude, longitude, candidate.lat, candidate.lng);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return { place: best.place, city: best.city, state: best.state };
}

/**
 * Turns raw GPS coordinates into a readable "place, city, state" label.
 * Uses OpenStreetMap's free reverse-geocoding endpoint, and falls back to
 * the built-in gazetteer above when the network or the service is down, so
 * the UI never has to show bare numbers.
 */
export async function reverseGeocode(latitude: number, longitude: number): Promise<PlaceName> {
  try {
    const url =
      'https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=16' +
      `&lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'MemoCare/1.0 (medical-store directory)', 'Accept-Language': 'en' },
        signal: controller.signal,
      });
      if (response.ok) {
        const data = (await response.json()) as {
          name?: string;
          address?: Record<string, string>;
        };
        const address = data.address ?? {};
        const place =
          address.suburb ||
          address.neighbourhood ||
          address.quarter ||
          address.village ||
          address.hamlet ||
          address.residential ||
          address.road ||
          data.name ||
          null;
        const city =
          address.city ||
          address.town ||
          address.municipality ||
          address.city_district ||
          address.village ||
          address.county ||
          null;
        const state = address.state || address.state_district || null;
        if (place || city || state) {
          return {
            place: place ?? null,
            city: city ?? null,
            state: state ?? null,
            postcode: address.postcode ?? null,
            label: buildLabel(place ?? null, city ?? null, state ?? null),
            source: 'osm',
          };
        }
      }
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // Network unavailable or timed out — use the offline gazetteer below.
  }

  const nearest = nearestKnownPlace(latitude, longitude);
  return {
    place: nearest.place,
    city: nearest.city,
    state: nearest.state,
    postcode: null,
    label: buildLabel(nearest.place, nearest.city, nearest.state),
    source: 'offline',
  };
}
