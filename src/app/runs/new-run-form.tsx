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
    <form action={startHarvest} className="card">
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
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
          <div className="row" style={{ gap: 4, marginTop: 8 }}>
            <span className="tag">cost {collector.costTier}</span>
            <span className={`tag ${collector.supportsDateCutoff ? "ok" : "warn"}`}>
              {collector.supportsDateCutoff ? "date cutoff" : "no date cutoff"}
            </span>
          </div>
        </div>

        <div>
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
          <div className="row" style={{ gap: 4, marginTop: 8 }}>
            <span className="tag">cost {detector.costTier}</span>
            <span className="tag">batch {detector.batchSize}</span>
          </div>
        </div>
      </div>

      <h2 style={{ marginTop: 22 }}>Strategies</h2>
      <div className="grid" style={{ gap: 8 }}>
        {collector.strategies.map((id) => (
          <label key={id} className="plain">
            <input
              type="checkbox"
              name="strategies"
              value={id}
              checked={strategies.includes(id)}
              onChange={() => toggleStrategy(id)}
            />
            <span>
              <b>{STRATEGY_LABELS[id] ?? id}</b>
              {STRATEGY_NOTES[id] && (
                <span className="small muted" style={{ display: "block" }}>
                  {STRATEGY_NOTES[id]}
                </span>
              )}
            </span>
          </label>
        ))}
      </div>

      <h2>Terms</h2>
      <div className="row" style={{ gap: 16, marginBottom: 10 }}>
        {[
          { value: "seed", label: `Seed list (${enabledHashtags} hashtags, ${enabledKeywords} keywords)` },
          { value: "custom", label: "Custom terms for this run" },
        ].map((option) => (
          <label key={option.value} className="plain">
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
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <label htmlFor="customHashtags">Hashtags (one per line, no #)</label>
            <textarea
              id="customHashtags"
              name="customHashtags"
              rows={4}
              defaultValue={"justlisted\nauctionday"}
            />
          </div>
          <div>
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

      <h2>Range and budget</h2>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))" }}>
        <div>
          <label htmlFor="since">Since</label>
          <input id="since" type="date" name="since" defaultValue={isoDaysAgo(7)} required />
        </div>
        <div>
          <label htmlFor="until">Until</label>
          <input id="until" type="date" name="until" defaultValue={isoDaysAgo(0)} required />
        </div>
        <div>
          <label htmlFor="maxPagesPerTerm">Max pages / term</label>
          <input id="maxPagesPerTerm" type="number" name="maxPagesPerTerm" defaultValue={3} min={1} max={50} />
        </div>
        <div>
          <label htmlFor="maxPostsPerTerm">Max posts / term</label>
          <input id="maxPostsPerTerm" type="number" name="maxPostsPerTerm" defaultValue={60} min={1} max={1000} />
        </div>
        <div>
          <label htmlFor="delayMin">Delay min (s)</label>
          <input id="delayMin" type="number" name="delayMin" defaultValue={3} min={0} max={120} step={0.5} />
        </div>
        <div>
          <label htmlFor="delayMax">Delay max (s)</label>
          <input id="delayMax" type="number" name="delayMax" defaultValue={8} min={0} max={300} step={0.5} />
        </div>
      </div>

      <label className="plain" style={{ marginTop: 14 }}>
        <input type="checkbox" name="detectBacklog" />
        Also detect the existing undetected backlog, not just this run&apos;s finds
      </label>

      {checks && (
        <div style={{ marginTop: 16 }}>
          {Object.entries(checks).map(([key, result]) => (
            <div key={key} className={`banner ${result.ok ? "ok" : "bad"}`} style={{ marginBottom: 8 }}>
              <b>{key}</b> — {result.detail}
            </div>
          ))}
        </div>
      )}

      {blocked && (
        <div className="banner warn" style={{ marginTop: 16 }}>
          {!collector.implemented && `${collector.name} is a declared placeholder. `}
          {!detector.implemented && `${detector.name} is a declared placeholder. `}
          Pick an implemented option to start a run.
        </div>
      )}

      <div className="row" style={{ marginTop: 18 }}>
        <button className="primary" type="submit" disabled={blocked || strategies.length === 0}>
          Start harvest
        </button>
        <button type="button" onClick={preflight} disabled={checking}>
          {checking ? "Checking…" : "Preflight"}
        </button>
        <span className="small muted">
          Preflight verifies the session and the model before you commit to a crawl.
        </span>
      </div>
    </form>
  );
}
