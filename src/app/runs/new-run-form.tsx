"use client";

import { useState } from "react";
import { startHarvest } from "./actions";

interface CollectorOption {
  id: string;
  name: string;
  description: string;
  implemented: boolean;
  strategies: string[];
  costTier: string;
  supportsDateCutoff: boolean;
}

interface DetectorOption {
  id: string;
  name: string;
  description: string;
  implemented: boolean;
  batchSize: number;
  costTier: string;
}

const STRATEGY_LABELS: Record<string, string> = {
  hashtag_recent: "Hashtag (recency surface)",
  keyword_serp: "Keyword (ranked search)",
};

const STRATEGY_NOTES: Record<string, string> = {
  hashtag_recent:
    "Approximately reverse-chronological, so it can stop once posts fall before the start date.",
  keyword_serp:
    "Algorithmically ranked, so there is no valid stopping point — budgeted and best-effort, never exhaustive.",
};

const isoDaysAgo = (days: number) =>
  new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

export function NewRunForm({
  collectors,
  detectors,
  enabledHashtags,
  enabledKeywords,
}: {
  collectors: CollectorOption[];
  detectors: DetectorOption[];
  enabledHashtags: number;
  enabledKeywords: number;
}) {
  const [collectorId, setCollectorId] = useState(
    collectors.find((c) => c.implemented)?.id ?? collectors[0].id,
  );
  const [detectorId, setDetectorId] = useState(
    detectors.find((d) => d.implemented)?.id ?? detectors[0].id,
  );
  const [strategies, setStrategies] = useState<string[]>(["hashtag_recent"]);
  const [termSource, setTermSource] = useState("seed");
  const [checking, setChecking] = useState(false);
  const [checks, setChecks] = useState<
    Record<string, { ok: boolean; detail: string }> | null
  >(null);

  const collector = collectors.find((c) => c.id === collectorId)!;
  const detector = detectors.find((d) => d.id === detectorId)!;
  const blocked = !collector.implemented || !detector.implemented;

  async function preflight() {
    setChecking(true);
    setChecks(null);
    try {
      const response = await fetch("/api/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectorId, detectorId }),
      });
      setChecks(await response.json());
    } catch (err) {
      setChecks({ error: { ok: false, detail: (err as Error).message } });
    } finally {
      setChecking(false);
    }
  }

  function toggleStrategy(id: string) {
    setStrategies((current) =>
      current.includes(id) ? current.filter((s) => s !== id) : [...current, id],
    );
  }

  return (
    <form action={startHarvest} className="panel">
      <div className="panel-head">New run</div>

      <div className="panel-body grid" style={{ gap: "var(--s5)" }}>
        {/* --- pipeline ------------------------------------------------ */}
        <div
          className="grid"
          style={{ gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: "var(--s4)" }}
        >
          <div className="field">
            <label htmlFor="collectorId">Collector</label>
            <select
              id="collectorId"
              name="collectorId"
              value={collectorId}
              onChange={(e) => setCollectorId(e.target.value)}
            >
              {collectors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.implemented ? "" : " — not implemented"}
                </option>
              ))}
            </select>
            <p className="small muted" style={{ margin: "6px 0 0" }}>
              {collector.description}
            </p>
            <div className="row row-tight" style={{ marginTop: "var(--s2)" }}>
              <span className="tag">cost: {collector.costTier}</span>
              <span className={`tag ${collector.supportsDateCutoff ? "ok" : "warn"}`}>
                {collector.supportsDateCutoff ? "date cutoff supported" : "no date cutoff"}
              </span>
            </div>
          </div>

          <div className="field">
            <label htmlFor="detectorId">Detector</label>
            <select
              id="detectorId"
              name="detectorId"
              value={detectorId}
              onChange={(e) => setDetectorId(e.target.value)}
            >
              {detectors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {d.implemented ? "" : " — not implemented"}
                </option>
              ))}
            </select>
            <p className="small muted" style={{ margin: "6px 0 0" }}>
              {detector.description}
            </p>
            <div className="row row-tight" style={{ marginTop: "var(--s2)" }}>
              <span className="tag">cost: {detector.costTier}</span>
              <span className="tag">batch of {detector.batchSize}</span>
            </div>
          </div>
        </div>

        {/* --- strategies ---------------------------------------------- */}
        <fieldset style={{ border: "none", padding: 0, margin: 0, minWidth: 0 }}>
          <legend className="field-legend">
            Strategies
          </legend>
          <div className="grid" style={{ gap: "var(--s2)" }}>
            {collector.strategies.map((id) => (
              <label key={id} className="check">
                <input
                  type="checkbox"
                  name="strategies"
                  value={id}
                  checked={strategies.includes(id)}
                  onChange={() => toggleStrategy(id)}
                />
                <span>
                  <b>{STRATEGY_LABELS[id] ?? id}</b>
                  {STRATEGY_NOTES[id] && <span className="hint">{STRATEGY_NOTES[id]}</span>}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {/* --- terms --------------------------------------------------- */}
        <fieldset style={{ border: "none", padding: 0, margin: 0, minWidth: 0 }}>
          <legend className="field-legend">
            Terms
          </legend>
          <div className="row" style={{ gap: "var(--s4)", marginBottom: "var(--s3)" }}>
            {[
              {
                value: "seed",
                label: `Seed list (${enabledHashtags} hashtags, ${enabledKeywords} keywords)`,
              },
              { value: "custom", label: "Custom terms for this run" },
            ].map((option) => (
              <label key={option.value} className="check">
                <input
                  type="radio"
                  name="termSource"
                  value={option.value}
                  checked={termSource === option.value}
                  onChange={() => setTermSource(option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>

          {termSource === "custom" && (
            <div
              className="grid"
              style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "var(--s3)" }}
            >
              <div className="field">
                <label htmlFor="customHashtags">Hashtags (one per line, no #)</label>
                <textarea
                  id="customHashtags"
                  name="customHashtags"
                  rows={4}
                  defaultValue={"justlisted\nauctionday"}
                />
              </div>
              <div className="field">
                <label htmlFor="customKeywords">Keywords (one per line)</label>
                <textarea
                  id="customKeywords"
                  name="customKeywords"
                  rows={4}
                  defaultValue={"house for sale australia"}
                />
              </div>
            </div>
          )}
        </fieldset>

        {/* --- range and budget ---------------------------------------- */}
        <fieldset style={{ border: "none", padding: 0, margin: 0, minWidth: 0 }}>
          <legend className="field-legend">
            Range and budget
          </legend>
          <div
            className="grid"
            style={{ gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: "var(--s3)" }}
          >
            <div className="field">
              <label htmlFor="since">Since</label>
              <input id="since" type="date" name="since" defaultValue={isoDaysAgo(7)} required />
            </div>
            <div className="field">
              <label htmlFor="until">Until</label>
              <input id="until" type="date" name="until" defaultValue={isoDaysAgo(0)} required />
            </div>
            <div className="field">
              <label htmlFor="maxPagesPerTerm">Max pages / term</label>
              <input
                id="maxPagesPerTerm"
                type="number"
                name="maxPagesPerTerm"
                defaultValue={3}
                min={1}
                max={50}
              />
            </div>
            <div className="field">
              <label htmlFor="maxPostsPerTerm">Max posts / term</label>
              <input
                id="maxPostsPerTerm"
                type="number"
                name="maxPostsPerTerm"
                defaultValue={60}
                min={1}
                max={1000}
              />
            </div>
            <div className="field">
              <label htmlFor="delayMin">Delay min (s)</label>
              <input
                id="delayMin"
                type="number"
                name="delayMin"
                defaultValue={3}
                min={0}
                max={120}
                step={0.5}
              />
            </div>
            <div className="field">
              <label htmlFor="delayMax">Delay max (s)</label>
              <input
                id="delayMax"
                type="number"
                name="delayMax"
                defaultValue={8}
                min={0}
                max={300}
                step={0.5}
              />
            </div>
          </div>

          <label className="check" style={{ marginTop: "var(--s3)" }}>
            <input type="checkbox" name="detectBacklog" />
            Also detect the existing undetected backlog, not just this run&apos;s finds
          </label>
        </fieldset>

        {checks && (
          <div>
            {Object.entries(checks).map(([key, result]) => (
              <div
                key={key}
                className={`banner ${result.ok ? "ok" : "bad"}`}
                style={{ marginBottom: "var(--s2)" }}
              >
                <b>{key}:</b> {result.detail}
              </div>
            ))}
          </div>
        )}

        {blocked && (
          <div className="banner warn" style={{ marginBottom: 0 }}>
            {!collector.implemented && `${collector.name} is a declared placeholder. `}
            {!detector.implemented && `${detector.name} is a declared placeholder. `}
            Pick an implemented option to start a run.
          </div>
        )}

        <div className="row">
          <button className="primary" type="submit" disabled={blocked || strategies.length === 0}>
            Start harvest
          </button>
          <button type="button" onClick={preflight} disabled={checking}>
            {checking ? "Checking…" : "Preflight"}
          </button>
          <span className="small faint">
            Preflight verifies the session and the model before you commit to a crawl.
          </span>
        </div>
      </div>
    </form>
  );
}
