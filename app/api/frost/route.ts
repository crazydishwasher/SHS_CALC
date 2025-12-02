import { NextRequest, NextResponse } from "next/server";

type FrostResult = {
  suggestedWinterMonths: number;
  frostDays: number | null;
  period: { from: string; to: string };
  note: string;
};

type DailyTemp = { date: string; meanTemp: number };

const clampWinterMonths = (value: number) => {
  if (Number.isNaN(value)) return 4;
  if (value < 1) return 1;
  if (value > 7) return 7;
  return value;
};

const buildPeriod = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-based

  // Last completed winter: 1 Nov (year-2) → 31 Mar (year-1) if current month < 4
  // Otherwise: 1 Nov (year-1) → 31 Mar (year) if current month >= 4? But we need completed season, so end year = year-1 when month >=4 as well.
  const endYear = month >= 4 ? year - 1 : year - 1;
  const startYear = endYear - 1;

  const from = `${startYear}-11-01`;
  const to = `${endYear}-03-31`;
  return { from, to };
};

async function fetchDailyMeanTemps(lat: number, lon: number, from: string, to: string): Promise<DailyTemp[] | null> {
  // Using Open-Meteo archive API (no auth)
  const url = new URL("https://archive-api.open-meteo.com/v1/archive");
  url.searchParams.set("latitude", lat.toString());
  url.searchParams.set("longitude", lon.toString());
  url.searchParams.set("start_date", from);
  url.searchParams.set("end_date", to);
  url.searchParams.set("daily", "temperature_2m_mean");
  url.searchParams.set("timezone", "UTC");

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data?.daily?.time || !data?.daily?.temperature_2m_mean) return null;

  const times: string[] = data.daily.time;
  const temps: number[] = data.daily.temperature_2m_mean;

  const items: DailyTemp[] = [];
  for (let i = 0; i < times.length; i++) {
    const t = temps[i];
    if (typeof t === "number") {
      items.push({ date: times[i], meanTemp: t });
    }
  }
  return items;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = searchParams.get("lat");
  const lon = searchParams.get("lon");

  if (!lat || !lon) {
    return NextResponse.json({ error: "lat og lon kreves" }, { status: 400 });
  }

  const latNum = parseFloat(lat);
  const lonNum = parseFloat(lon);
  if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) {
    return NextResponse.json({ error: "Ugyldige koordinater" }, { status: 400 });
  }

  const period = buildPeriod();

  try {
    const temps = await fetchDailyMeanTemps(latNum, lonNum, period.from, period.to);

    if (!temps || temps.length === 0) {
      const fallback: FrostResult = {
        suggestedWinterMonths: 4,
        frostDays: null,
        period,
        note: "Ingen værdata tilgjengelig, bruker standard 4 måneder.",
      };
      return NextResponse.json(fallback);
    }

    const frostDays = temps.filter((d) => typeof d.meanTemp === "number" && d.meanTemp <= 0).length;
    const suggested = clampWinterMonths(Math.round(frostDays / 30));

    const result: FrostResult = {
      suggestedWinterMonths: suggested,
      frostDays,
      period,
      note: "Basert på døgnmiddeltemperatur ≤ 0 °C for valgt område.",
    };

    return NextResponse.json(result);
  } catch (error) {
    const fallback: FrostResult = {
      suggestedWinterMonths: 4,
      frostDays: null,
      period,
      note: "Feil ved henting av værdata, bruker standard 4 måneder.",
    };
    return NextResponse.json(fallback, { status: 200 });
  }
}
