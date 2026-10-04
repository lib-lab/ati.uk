import type { Id } from '../types';

export interface City {
  id: Id;
  name: string;
  country: string;
  lat: number;
  lon: number;
}

// Small reference list for the prototype. Coordinates are approximate city centres.
export const CITIES: City[] = [
  { id: 'warsaw', name: 'Warsaw', country: 'PL', lat: 52.23, lon: 21.01 },
  { id: 'krakow', name: 'Kraków', country: 'PL', lat: 50.06, lon: 19.94 },
  { id: 'lodz', name: 'Łódź', country: 'PL', lat: 51.76, lon: 19.46 },
  { id: 'wroclaw', name: 'Wrocław', country: 'PL', lat: 51.11, lon: 17.04 },
  { id: 'poznan', name: 'Poznań', country: 'PL', lat: 52.41, lon: 16.93 },
  { id: 'gdansk', name: 'Gdańsk', country: 'PL', lat: 54.35, lon: 18.65 },
  { id: 'katowice', name: 'Katowice', country: 'PL', lat: 50.26, lon: 19.02 },
  { id: 'berlin', name: 'Berlin', country: 'DE', lat: 52.52, lon: 13.4 },
  { id: 'hamburg', name: 'Hamburg', country: 'DE', lat: 53.55, lon: 9.99 },
  { id: 'munich', name: 'Munich', country: 'DE', lat: 48.14, lon: 11.58 },
  { id: 'cologne', name: 'Cologne', country: 'DE', lat: 50.94, lon: 6.96 },
  { id: 'frankfurt', name: 'Frankfurt', country: 'DE', lat: 50.11, lon: 8.68 },
  { id: 'leipzig', name: 'Leipzig', country: 'DE', lat: 51.34, lon: 12.37 },
  { id: 'dresden', name: 'Dresden', country: 'DE', lat: 51.05, lon: 13.74 },
  { id: 'prague', name: 'Prague', country: 'CZ', lat: 50.08, lon: 14.44 },
  { id: 'brno', name: 'Brno', country: 'CZ', lat: 49.2, lon: 16.61 },
  { id: 'ostrava', name: 'Ostrava', country: 'CZ', lat: 49.82, lon: 18.26 },
  { id: 'vilnius', name: 'Vilnius', country: 'LT', lat: 54.69, lon: 25.28 },
  { id: 'kaunas', name: 'Kaunas', country: 'LT', lat: 54.9, lon: 23.9 },
  { id: 'riga', name: 'Riga', country: 'LV', lat: 56.95, lon: 24.11 },
  { id: 'tallinn', name: 'Tallinn', country: 'EE', lat: 59.44, lon: 24.75 },
  { id: 'rotterdam', name: 'Rotterdam', country: 'NL', lat: 51.92, lon: 4.48 },
  { id: 'amsterdam', name: 'Amsterdam', country: 'NL', lat: 52.37, lon: 4.9 },
  { id: 'antwerp', name: 'Antwerp', country: 'BE', lat: 51.22, lon: 4.4 },
  { id: 'vienna', name: 'Vienna', country: 'AT', lat: 48.21, lon: 16.37 },
  { id: 'bratislava', name: 'Bratislava', country: 'SK', lat: 48.15, lon: 17.11 },
  { id: 'budapest', name: 'Budapest', country: 'HU', lat: 47.5, lon: 19.04 },
  { id: 'milan', name: 'Milan', country: 'IT', lat: 45.46, lon: 9.19 },
  { id: 'lyon', name: 'Lyon', country: 'FR', lat: 45.76, lon: 4.84 },
  { id: 'paris', name: 'Paris', country: 'FR', lat: 48.86, lon: 2.35 },
];

const BY_ID = new Map(CITIES.map((c) => [c.id, c]));

export function getCity(id: Id): City {
  const city = BY_ID.get(id);
  if (!city) throw new Error(`Unknown city: ${id}`);
  return city;
}
