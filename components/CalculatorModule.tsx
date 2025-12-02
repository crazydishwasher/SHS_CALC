"use client";

import React, { useMemo, useState } from "react";

type CabinAge = "new" | "normal" | "old";

type Step = "intro" | "location" | "size" | "age" | "price" | "result";

function getKWhPerM2PerWinter(age?: CabinAge): number {
  if (age === "new") return 55;
  if (age === "normal") return 75;
  if (age === "old") return 100;
  return 75;
}

type CalculatorState = {
  locationName?: string;
  locationLat?: number;
  locationLon?: number;
  winterMonths?: number;
  m2?: number;
  customPrice?: number;
  priceMode?: "standard" | "custom";
  cabinAge?: CabinAge;
};

const DEFAULT_WINTER_MONTHS = 4;
const DEFAULT_PRICE = 0.5;
const kWh_per_m2_per_winter = 60;
const padsPowerKw = 0.06; // 3 pads × 20 W

export default function CalculatorModule() {
  const [step, setStep] = useState<Step>("intro");
  const [state, setState] = useState<CalculatorState>({
    winterMonths: undefined,
    customPrice: undefined,
    priceMode: undefined,
  });

  const stepOrder: Step[] = ["intro", "location", "size", "age", "price", "result"];

  const headings: Record<Step, string> = {
    intro: "Hvor mye kan jeg spare?",
    location: "Hvor ligger fritidsboligen?",
    size: "Hvor stor er fritidsboligen?",
    age: "Hvor gammel er fritidsboligen?",
    price: "Hvilken strømpris skal vi bruke?",
    result: "Din estimerte vinterbesparelse",
  };

  const subtitles: Record<Step, string | undefined> = {
    intro: "Få et raskt estimat basert på hyttens plassering og størrelse.",
    location: "Søk etter adresse eller stedsnavn.",
    size: undefined,
    age: "Vi bruker dette til å anslå hvor mye energi som trengs til frostsikring.",
    price: "Velg Norgespris (0,50 kr/kWh) eller legg inn egen pris.",
    result: "Basert på værdata og størrelsen på fritidsboligen.",
  };

  const stepLabel = useMemo(() => {
    const idx = stepOrder.indexOf(step);
    return `Steg ${idx + 1}/${stepOrder.length}`;
  }, [step]);

  const resetAll = () => {
    setState({
      winterMonths: undefined,
      customPrice: undefined,
      locationLat: undefined,
      locationLon: undefined,
      locationName: undefined,
      m2: undefined,
    });
    setStep("intro");
  };

  const savingResult = useMemo(() => {
    if (!state.winterMonths || !state.m2) {
      return { saving: 0, kWhFrost: 0, kWhPads: 0 };
    }
    const winterMonths = state.winterMonths ?? DEFAULT_WINTER_MONTHS;
    const price =
      state.priceMode === "custom"
        ? state.customPrice && state.customPrice > 0
          ? state.customPrice
          : DEFAULT_PRICE
        : DEFAULT_PRICE;
    const perM2 = getKWhPerM2PerWinter(state.cabinAge);
    let kWh_frost = state.m2 * perM2;
    kWh_frost *= winterMonths / DEFAULT_WINTER_MONTHS;
    const kWh_pads = padsPowerKw * 24 * 30 * winterMonths;
    const rawSaving = (kWh_frost - kWh_pads) * price;
    const saving = Math.max(0, rawSaving);
    return { saving, kWhFrost: kWh_frost, kWhPads: kWh_pads };
  }, [state]);

  return (
    <section className="card" aria-label="SHS Heating Pads kalkulator">
      <div className="step-indicator">{stepLabel}</div>
      <h1>{headings[step]}</h1>
      {subtitles[step] && <p className="lead">{subtitles[step]}</p>}

      {step === "intro" && (
        <div>
          <button type="button" onClick={() => setStep("location")}>
            Start
          </button>
        </div>
      )}

      {step === "location" && (
        <LocationStep
          state={state}
          setState={setState}
          onBack={() => setStep("intro")}
          onNext={() => setStep("size")}
        />
      )}

      {step === "size" && (
        <SizeStep
          state={state}
          setState={setState}
          onBack={() => setStep("location")}
          onNext={() => setStep("age")}
        />
      )}

      {step === "age" && (
        <AgeStep
          state={state}
          setState={setState}
          onBack={() => setStep("size")}
          onNext={() => setStep("price")}
        />
      )}

      {step === "price" && (
        <PriceStep
          state={state}
          setState={setState}
          onBack={() => setStep("size")}
          onNext={() => setStep("result")}
        />
      )}

      {step === "result" && (
        <ResultStep
          state={state}
          setState={setState}
          saving={savingResult.saving}
          kWhFrost={savingResult.kWhFrost}
          kWhPads={savingResult.kWhPads}
          onRestart={resetAll}
        />
      )}
    </section>
  );
}

type StepProps = {
  state: CalculatorState;
  setState: React.Dispatch<React.SetStateAction<CalculatorState>>;
  onBack: () => void;
  onNext: () => void;
};

function LocationStep({ state, setState, onBack, onNext }: StepProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ name: string; lat: number; lon: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  React.useEffect(() => {
    const controller = new AbortController();
    const run = async () => {
      if (!query) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        const data = await res.json();
        const list = Array.isArray(data) ? data : Array.isArray(data.results) ? data.results : [];
        setResults(list);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    };
    const t = setTimeout(run, 250);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [query]);

  const selectPlace = async (place: { name: string; lat: number; lon: number }) => {
    setState((prev) => ({
      ...prev,
      locationName: place.name,
      locationLat: place.lat,
      locationLon: place.lon,
    }));
    setNote(null);
    try {
      const res = await fetch(`/api/frost?lat=${place.lat}&lon=${place.lon}`);
      const data = await res.json();
      const months =
        typeof data.suggestedWinterMonths === "number"
          ? data.suggestedWinterMonths
          : DEFAULT_WINTER_MONTHS;
      setState((prev) => ({
        ...prev,
        locationName: place.name,
        locationLat: place.lat,
        locationLon: place.lon,
        winterMonths: months,
      }));
      setNote(`Basert på værdata foreslår vi ${months} vintermåneder.`);
    } catch {
      setNote("Kunne ikke hente vintermåneder nå.");
    }
  };

  const canContinue = Boolean(state.locationName && (state.winterMonths ?? 0) > 0);

  return (
    <form className="form-block" onSubmit={(e) => e.preventDefault()}>
      <div>
        <label htmlFor="loc">Hvor ligger fritidsboligen?</label>
        <input
          id="loc"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Søk f.eks. Beitostølen"
          className="location-input"
        />
        {loading && <div className="helper" style={{ marginTop: 8 }}>Søker...</div>}

        {!state.locationName && (
          <>
            {results.length > 0 && (
              <div
                style={{
                  marginTop: 10,
                  border: "1px solid #E5E7EB",
                  borderRadius: 8,
                  maxHeight: 200,
                  overflowY: "auto",
                  background: "#fff",
                  padding: 0,
                }}
              >
                {results.map((r) => (
                  <button
                    key={`${r.name}-${r.lat}-${r.lon}`}
                    type="button"
                    onClick={() => selectPlace(r)}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "12px 14px",
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      fontSize: 15,
                      color: "#1F2937",
                      borderBottom: "1px solid #F3F4F6",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "#F3F8FF";
                      e.currentTarget.style.color = "#2563EB";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.color = "#1F2937";
                    }}
                  >
                    {r.name}
                  </button>
                ))}
              </div>
            )}
            {query && !loading && results.length === 0 && (
              <div className="helper" style={{ marginTop: 8 }}>
                Ingen treff. Prøv et annet stedsnavn.
              </div>
            )}
          </>
        )}

        {state.locationName && (
          <div
            style={{
              marginTop: 16,
              background: "#F7F7F8",
              padding: 16,
              borderRadius: 10,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 4, color: "#111" }}>
              {state.locationName}
            </div>
            {state.winterMonths && (
              <div style={{ color: "#555", fontWeight: 400 }}>
                Basert på værdata foreslår vi {state.winterMonths} vintermåneder.
              </div>
            )}
          </div>
        )}

        {note && !state.locationName && <div className="inline-note">{note}</div>}
      </div>
      <div className="actions" style={{ marginTop: 24 }}>
        <button type="button" className="ghost-button" onClick={onBack}>
          Tilbake
        </button>
        <button type="button" className="primary" disabled={!canContinue} onClick={onNext}>
          Neste
        </button>
      </div>
    </form>
  );
}

function SizeStep({ state, setState, onBack, onNext }: StepProps) {
  const val = state.m2 ?? "";
  const canContinue = !!state.m2 && state.m2 > 0;

  return (
    <form className="form-block" onSubmit={(e) => e.preventDefault()}>
      <div>
        <label htmlFor="m2">Hvor stor er fritidsboligen?</label>
        <input
          id="m2"
          type="number"
          min={1}
          step={1}
          value={val}
          onChange={(e) =>
            setState((prev) => ({
              ...prev,
              m2: e.target.value ? parseFloat(e.target.value) : undefined,
            }))
          }
          placeholder="Oppgi areal i m²"
        />
      </div>
      <div className="actions">
        <button type="button" className="ghost-button" onClick={onBack}>
          Tilbake
        </button>
        <button type="button" className="primary" disabled={!canContinue} onClick={onNext}>
          Neste
        </button>
      </div>
    </form>
  );
}

function PriceStep({ state, setState, onBack, onNext }: StepProps) {
  const priceMode = state.priceMode ?? "standard";
  const customValNum = priceMode === "custom" ? state.customPrice : undefined;
  const isCustomValid = priceMode === "custom" ? (customValNum ?? 0) > 0 : true;

  const setMode = (mode: "standard" | "custom") => {
    setState((prev) => ({
      ...prev,
      priceMode: mode,
      customPrice: mode === "standard" ? undefined : prev.customPrice ?? undefined,
    }));
  };

  const canContinue = priceMode === "standard" || (priceMode === "custom" && isCustomValid);

  return (
    <form className="form-block" onSubmit={(e) => e.preventDefault()}>
      <div className="choice-row">
        <button
          type="button"
          className={`option-button ${priceMode === "standard" ? "active" : ""}`}
          onClick={() => setMode("standard")}
        >
          Norgespris (0,50 kr/kWh)
        </button>
        <button
          type="button"
          className={`option-button ${priceMode === "custom" ? "active" : ""}`}
          onClick={() => setMode("custom")}
        >
          Egendefinert pris
        </button>
      </div>

      {priceMode === "custom" && (
        <div>
          <label htmlFor="customPrice">Egendefinert strømpris (kr/kWh)</label>
          <input
            id="customPrice"
            type="number"
            min={0}
            step={0.01}
            value={
              priceMode === "custom"
                ? customValNum !== undefined
                  ? customValNum
                  : ""
                : 0.5
            }
            onChange={(e) =>
              setState((prev) => ({
                ...prev,
                customPrice: e.target.value === "" ? undefined : parseFloat(e.target.value),
              }))
            }
          />
          <div className="helper">Standardpris er 0,50 kr/kWh.</div>
        </div>
      )}

      <div className="actions">
        <button type="button" className="ghost-button" onClick={onBack}>
          Tilbake
        </button>
        <button type="button" className="primary" disabled={!canContinue} onClick={onNext}>
          Neste
        </button>
      </div>
    </form>
  );
}

function AgeStep({ state, setState, onBack, onNext }: StepProps) {
  const selected = state.cabinAge;
  const canContinue = Boolean(selected);

  const selectAge = (age: CabinAge) => {
    setState((prev) => ({ ...prev, cabinAge: age }));
  };

  return (
    <form className="form-block" onSubmit={(e) => e.preventDefault()}>
      <div className="choice-row">
        <button
          type="button"
          className={`option-button ${selected === "new" ? "active" : ""}`}
          onClick={() => selectAge("new")}
        >
          Nyere hytte <span className="option-sub"> (etter 2010)</span>
        </button>
        <button
          type="button"
          className={`option-button ${selected === "normal" ? "active" : ""}`}
          onClick={() => selectAge("normal")}
        >
          Normal hytte <span className="option-sub"> (ca. 1990–2010)</span>
        </button>
        <button
          type="button"
          className={`option-button ${selected === "old" ? "active" : ""}`}
          onClick={() => selectAge("old")}
        >
          Eldre hytte <span className="option-sub"> (før 1990)</span>
        </button>
      </div>
      <div className="actions">
        <button type="button" className="ghost-button" onClick={onBack}>
          Tilbake
        </button>
        <button type="button" className="primary" disabled={!canContinue} onClick={onNext}>
          Neste
        </button>
      </div>
    </form>
  );
}

type ResultProps = {
  state: CalculatorState;
  setState: React.Dispatch<React.SetStateAction<CalculatorState>>;
  saving: number;
  kWhFrost: number;
  kWhPads: number;
  onRestart: () => void;
};

function ResultStep({ state, setState, saving, kWhFrost, kWhPads, onRestart }: ResultProps) {
  const price =
    state.priceMode === "custom"
      ? state.customPrice && state.customPrice > 0
        ? state.customPrice
        : DEFAULT_PRICE
      : DEFAULT_PRICE;
  const displaySaving = Math.max(0, saving);
  const formatted = Math.round(displaySaving).toLocaleString("nb-NO");
  const [showDetails, setShowDetails] = React.useState(false);
  const ageLabel =
    state.cabinAge === "new"
      ? "Nyere hytte (etter 2010)"
      : state.cabinAge === "normal"
      ? "Normal hytte (ca. 1990–2010)"
      : state.cabinAge === "old"
      ? "Eldre hytte (før 1990)"
      : "Ikke valgt";
  const perM2 = getKWhPerM2PerWinter(state.cabinAge);

  return (
    <div className="form-block">
      <div className="result-box" style={{ textAlign: "center", lineHeight: 1.55 }}>
        <p className="result-label" style={{ marginTop: 8 }}>Du kan spare omtrent</p>
        <p className="result-value" style={{ fontSize: "1.9rem", fontWeight: 700 }}>
          {formatted} kr per vinter
        </p>
        <p
          className="helper"
          style={{
            color: "#6B7280",
            marginTop: 10,
            maxWidth: 520,
            lineHeight: 1.5,
            textAlign: "left",
          }}
        >
          Estimatet er basert på værdata for området ditt, størrelsen på fritidsboligen og valgt strømpris. Det gir en god
          pekepinn på hvor mye du kan spare sammenlignet med tradisjonell frostsikring på ti grader.
        </p>
        <button
          type="button"
          className="ghost-button"
          style={{
            marginTop: 22,
            padding: "8px 10px",
            borderRadius: 8,
            background: "transparent",
            border: "1px solid #dfe3e7",
            color: "#2563eb",
          }}
          onClick={() => setShowDetails((prev) => !prev)}
        >
          {showDetails ? "Skjul detaljer ↑" : "Vis hvordan vi har regnet ↓"}
        </button>
          {showDetails && (
            <div
              style={{
              marginTop: 16,
              padding: 20,
              borderRadius: 12,
              background: "#F6F6F7",
              textAlign: "left",
              color: "#111",
              lineHeight: 1.5,
              }}
            >
            <div style={{ fontWeight: 700, marginBottom: 12, color: "#111" }}>Slik har vi regnet:</div>
            <p style={{ margin: "0 0 10px 0" }}>Frostsikring ved 10 °C: {kWhFrost.toFixed(0)} kWh per vinter</p>
            <p style={{ margin: "0 0 10px 0" }}>Med SHS Heating Pads: {kWhPads.toFixed(0)} kWh per vinter</p>
            <p style={{ margin: "0 0 10px 0" }}>
              Besparelse i kWh: {(kWhFrost - kWhPads).toFixed(0)} kWh
            </p>
            <p style={{ margin: "0 0 10px 0" }}>
              Strømpris i beregningen: {price.toFixed(2)} kr/kWh
            </p>
            <p style={{ margin: "0 0 10px 0" }}>Alder på fritidsboligen: {ageLabel}</p>
            <p style={{ margin: 0, color: "#444" }}>
              Antatt energibehov: {perM2} kWh per m² per vinter for {state.m2 ?? 0} m², justert for {state.winterMonths ?? 0} vintermåneder.
            </p>
          </div>
        )}
      </div>
      <div className="actions" style={{ marginTop: 28 }}>
        <button type="button" className="ghost-button" onClick={onRestart}>
          Beregn på nytt
        </button>
      </div>
      <style jsx global>{`
        .card > h1,
        .card > .lead {
          text-align: center;
        }
        .result-box .helper {
          text-align: left;
        }
      `}</style>
    </div>
  );
}
