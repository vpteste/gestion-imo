"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import { useEffect, useMemo, useState } from "react";

// Correction des icônes Leaflet par défaut (cassées en bundler moderne)
function fixLeafletIcons() {
  // @ts-expect-error Leaflet type mismatch
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });
}

// Coordonnées approximatives des principales villes/communes de Côte d'Ivoire
const CITY_COORDS: Record<string, [number, number]> = {
  abidjan:        [5.35995, -4.00826],
  cocody:         [5.35444, -3.98056],
  yopougon:       [5.33639, -4.08917],
  plateau:        [5.319, -4.015],
  treichville:    [5.298, -4.012],
  koumassi:       [5.303, -3.962],
  abobo:          [5.416, -4.017],
  bingerville:    [5.35581, -3.88537],
  "port-bouet":   [5.25556, -3.92639],
  yamoussoukro:   [6.82762, -5.28934],
  bouake:         [7.68963, -5.03031],
  korhogo:        [9.45711, -5.62961],
  "san-pedro":    [4.74851, -6.6363],
  "san pedro":    [4.74851, -6.6363],
  daloa:          [6.87735, -6.45022],
  man:            [7.41251, -7.55383],
  gagnoa:         [6.13193, -5.9506],
};

export type BiensCarteProperty = {
  id: string;
  title: string;
  city: string;
  addressLine: string;
  latitude?: number;
  longitude?: number;
  rentAmount: number;
};

type Props = {
  properties: BiensCarteProperty[];
};

type Coords = [number, number];
const GEO_CACHE_KEY = "biens-map-geocode-cache-v1";

function normalizeCity(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

async function geocodeCity(city: string): Promise<Coords | null> {
  const params = new URLSearchParams({
    format: "json",
    limit: "1",
    city,
    country: "Cote d'Ivoire",
  });

  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`);
  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as Array<{ lat: string; lon: string }>;
  const first = data[0];
  if (!first) {
    return null;
  }

  const lat = Number(first.lat);
  const lon = Number(first.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  return [lat, lon];
}

export default function BiensCarte({ properties }: Props) {
  const [dynamicCoords, setDynamicCoords] = useState<Record<string, Coords>>({});

  useEffect(() => {
    fixLeafletIcons();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const rawCache = localStorage.getItem(GEO_CACHE_KEY);
    const cache: Record<string, Coords> = rawCache ? JSON.parse(rawCache) : {};

    const initialFromStatic: Record<string, Coords> = {};
    for (const [city, coords] of Object.entries(CITY_COORDS)) {
      initialFromStatic[normalizeCity(city)] = coords;
    }

    const merged = { ...initialFromStatic, ...cache };
    setDynamicCoords(merged);

    async function resolveUnknownCities() {
      const unknownCities = Array.from(
        new Set(
          properties
            .map((item) => item.city)
            .filter(Boolean)
            .filter((city) => !merged[normalizeCity(city)]),
        ),
      );

      if (unknownCities.length === 0) {
        return;
      }

      const next = { ...merged };
      for (const city of unknownCities) {
        const coords = await geocodeCity(city);
        if (coords) {
          next[normalizeCity(city)] = coords;
        }
      }

      if (cancelled) {
        return;
      }

      setDynamicCoords(next);
      localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(next));
    }

    void resolveUnknownCities();

    return () => {
      cancelled = true;
    };
  }, [properties]);

  const markers = useMemo(
    () =>
      properties
        .map((p) => {
          if (typeof p.latitude === "number" && typeof p.longitude === "number") {
            return { ...p, coords: [p.latitude, p.longitude] as Coords };
          }

          const coords = dynamicCoords[normalizeCity(p.city)];
          return coords ? { ...p, coords } : null;
        })
        .filter(Boolean) as (BiensCarteProperty & { coords: Coords })[],
    [dynamicCoords, properties],
  );

  function FitToMarkers({ points }: { points: Coords[] }) {
    const map = useMap();

    useEffect(() => {
      if (points.length === 0) {
        return;
      }

      const bounds = L.latLngBounds(points.map((point) => L.latLng(point[0], point[1])));
      map.fitBounds(bounds.pad(0.25));
    }, [map, points]);

    return null;
  }

  return (
    <MapContainer
      center={[7.54, -5.55]}
      zoom={6}
      scrollWheelZoom={false}
      className="h-full w-full rounded-xl"
      style={{ minHeight: "300px" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitToMarkers points={markers.map((item) => item.coords)} />
      {markers.map((m) => (
        <Marker key={m.id} position={m.coords}>
          <Popup>
            <strong>{m.title}</strong>
            <br />
            {m.addressLine}, {m.city}
            <br />
            Loyer: {m.rentAmount.toLocaleString("fr-FR")} FCFA
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
