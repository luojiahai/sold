"use client";

import { useState } from "react";
import { money } from "../format";
import { startRedetection } from "./redetect-action";

export interface RedetectDetectorOption {
  id: string;
  name: string;
  promptVersion: number;
  /** Post count per scope id, computed server-side against this detector. */
  counts: Record<string, number>;
}

export interface RedetectScopeOption {
  id: string;
  label: string;
  note: string;
}

/**
 * Re-detection, behind a deliberate two-step confirm.
 *
 * This is the only control in the app that spends money with no other visible
 * effect, so the count and the cost estimate are put on screen at the moment of
 * commitment rather than left to be inferred. Changing either input drops back
 * out of the confirmed state: the numbers you approved must be the numbers you
 * are approving.
 *
 * Scopes are listed cheapest-first so the cost gradient is visible in the
 * control itself.
 */
export function RedetectPanel({
  detectors,
  scopes,
  costPerPost,
  runActive,
  staleTotal,
}: {
  detectors: RedetectDetectorOption[];
  scopes: RedetectScopeOption[];
  costPerPost: number | null;
  runActive: boolean;
  staleTotal: number;
}) {
  const [detectorId, setDetectorId] = useState(detectors[0].id);
  const [scope, setScope] = useState(scopes[0].id);
  const [prepared, setPrepared] = useState(false);

  const detector = detectors.find((d) => d.id === detectorId)!;
  const count = detector.counts[scope] ?? 0;
  const estimate = costPerPost === null ? null : costPerPost * count;

  const change = (apply: () => void) => {
    apply();
    setPrepared(false);
  };

  const body = (
    <form action={startRedetection} className="card">
      <p className="small muted" style={{ margin: "0 0 16px" }}>
        Re-runs posts already collected through the current prompt, appending a
        verdict rather than replacing one. Nothing is collected and nothing is
        overwritten.
      </p>

      <div style={{ maxWidth: 420 }}>
        <label htmlFor="redetectDetector">Detector</label>
        <select
          id="redetectDetector"
          name="detectorId"
          value={detectorId}
          onChange={(e) => change(() => setDetectorId(e.target.value))}
        >
          {detectors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <div className="chips" style={{ marginTop: 8 }}>
          <span className="tag mono">prompt v{detector.promptVersion}</span>
        </div>
      </div>

      <h2>Scope</h2>
      <div className="options">
        {scopes.map((option) => (
          <label key={option.id} className="option">
            <input
              type="radio"
              name="scope"
              value={option.id}
              checked={scope === option.id}
              onChange={() => change(() => setScope(option.id))}
            />
            <i className="box" aria-hidden="true" />
            <span>
              <b>{option.label}</b>
              <small>
                {option.note} — {(detector.counts[option.id] ?? 0).toLocaleString("en-AU")}{" "}
                post(s).
              </small>
            </span>
          </label>
        ))}
      </div>

      {runActive && (
        <p className="small muted" style={{ marginTop: 16 }}>
          A run is already in progress. Stop it before starting a re-detection —
          two runs at once would double the load on the detector while the status
          strip showed one.
        </p>
      )}

      {prepared ? (
        <div className="confirm">
          <div className="chips">
            <span className="tag">{count.toLocaleString("en-AU")} post(s)</span>
            <span className="tag mono">
              {estimate === null ? "cost unknown" : `≈ ${money(estimate)}`}
            </span>
          </div>
          <p>
            {estimate === null
              ? "No completed detections yet, so there is nothing to estimate a cost from. The post count is the number that scales."
              : "Estimated from the cost of past detections. The current prompt asks for more output than those runs did, so treat this as a floor."}
          </p>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="primary" type="submit" disabled={runActive || count === 0}>
              Start re-detection
            </button>
            <button className="ghost" type="button" onClick={() => setPrepared(false)}>
              Back
            </button>
          </div>
        </div>
      ) : (
        <div className="row" style={{ marginTop: 20 }}>
          <button className="primary" type="button" onClick={() => setPrepared(true)}>
            Prepare re-detection
          </button>
        </div>
      )}
    </form>
  );

  // Nothing is out of date, so the panel gets out of the way — but stays
  // reachable, because the widest scope exists for comparing a detector against
  // itself and that is wanted precisely when nothing is stale.
  if (staleTotal === 0) {
    return (
      <details className="redetect-idle">
        <summary className="small muted">
          Every verdict is current. Re-detection isn&apos;t needed — open anyway
        </summary>
        <div style={{ marginTop: 12 }}>{body}</div>
      </details>
    );
  }

  return (
    <>
      <h2>Re-detection</h2>
      {body}
    </>
  );
}
