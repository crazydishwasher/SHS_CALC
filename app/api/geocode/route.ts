import { NextRequest, NextResponse } from "next/server";

// Fallback statisk geokodeliste for demo.
const PLACES = [
  { name: "Beitostølen", lat: 61.2489, lon: 8.9091 },
  { name: "Oslo", lat: 59.9139, lon: 10.7522 },
  { name: "Bergen", lat: 60.39299, lon: 5.32415 },
  { name: "Trondheim", lat: 63.4305, lon: 10.3951 },
  { name: "Lillehammer", lat: 61.1153, lon: 10.4662 },
  { name: "Hemsedal", lat: 60.8645, lon: 8.5534 },
  { name: "Geilo", lat: 60.533, lon: 8.205 },
  { name: "Trysil", lat: 61.3146, lon: 12.2659 },
  { name: "Hafjell", lat: 61.2452, lon: 10.4536 },
  { name: "Sirdal", lat: 58.9146, lon: 6.8516 },
  { name: "Gol", lat: 60.7015, lon: 9.0407 },
  { name: "Hovden", lat: 59.5594, lon: 7.3559 },
  { name: "Norefjell", lat: 60.2081, lon: 9.4615 },
  { name: "Oppdal", lat: 62.5942, lon: 9.6947 },
  { name: "Sjusjøen", lat: 61.1802, lon: 10.7866 },
  { name: "Kvitfjell", lat: 61.4534, lon: 10.1126 },
  { name: "Voss", lat: 60.628, lon: 6.4147 },
  { name: "Røldal", lat: 59.8299, lon: 6.8158 },
  { name: "Narvik", lat: 68.4385, lon: 17.427 },
  { name: "Tromsø", lat: 69.6492, lon: 18.9553 },
];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  if (!q) return NextResponse.json([]);

  // Forsøk ekte geokoding via Nominatim (uten nøkkel). Fallback til statisk liste ved feil.
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "8");
    url.searchParams.set("q", q);
    url.searchParams.set("countrycodes", "no,se,dk,fi");

    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": "shs-savings-calc/1.0 (contact: support@shs.example)", // juster e-post
      },
    });

    if (!res.ok) throw new Error("Geocode request failed");
    const data = (await res.json()) as Array<any>;
    const normalizeName = (item: any) => {
      const addr = item.address || {};
      const road = addr.road || addr.pedestrian || addr.footway;
      const houseNumber = addr.house_number;
      const suburb = addr.suburb || addr.neighbourhood || addr.city_district;
      const city = addr.city || addr.town || addr.village || addr.municipality;
      const postcode = addr.postcode;
      const country = addr.country;

      const parts: string[] = [];
      if (road && houseNumber) parts.push(`${road} ${houseNumber}`);
      else if (road) parts.push(road);

      if (suburb) parts.push(suburb);
      if (city) parts.push(city);
      if (country) parts.push(country);
      else if (postcode) parts.push(postcode);

      if (parts.length > 0) return parts.join(", ");
      return item.display_name;
    };

    const mappedRaw = data
      .map((item) => ({
        name: normalizeName(item),
        lat: parseFloat(item.lat),
        lon: parseFloat(item.lon),
      }))
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));

    const seen = new Set<string>();
    const mapped: typeof mappedRaw = [];
    for (const item of mappedRaw) {
      const key = `${item.name.toLowerCase()}-${item.lat.toFixed(4)}-${item.lon.toFixed(4)}`;
      if (!seen.has(key)) {
        seen.add(key);
        mapped.push(item);
      }
      if (mapped.length >= 8) break;
    }

    if (mapped.length === 0) {
      throw new Error("No results");
    }

    return NextResponse.json(mapped);
  } catch (error) {
    const fallbackSeen = new Set<string>();
    const fallback = PLACES.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())).filter((p) => {
      const key = `${p.name.toLowerCase()}-${p.lat}-${p.lon}`;
      if (fallbackSeen.has(key)) return false;
      fallbackSeen.add(key);
      return true;
    }).slice(0, 8);
    return NextResponse.json(fallback);
  }
}
