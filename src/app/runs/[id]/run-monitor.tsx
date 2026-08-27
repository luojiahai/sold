"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface RunEvent {
  id: number;
  level: string;
  phase: string;
  message: string;
  createdAt: string;
}

interface RunSnapshot {
  status: string;
  postsSeen: number;
  postsNew: number;
  postsDetected: number;
  postsVerified: number;
  detectorCostUsd: number;
  error: string | null;
}

const TERMINAL = new Set(["completed", "failed", "cancelled"]);

/**
 * Polls run progress while the run is live.
 *
 * `after` carries the highest event id already seen, so an hour-long collect
 * doesn't re-send its entire log every two seconds.
 */
export function RunMonitor({
  runId,
  initialRun,
  initialEvents,
}: {
  runId: string;
  initialRun: RunSnapshot;
  initialEvents: RunEvent[];
}) {
  const [run, setRun] = useState(initialRun);
  const [events, setEvents] = useState(initialEvents);
  const logRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const live = !TERMINAL.has(run.status);

  useEffect(() => {
    if (!live) return;

    let cancelled = false;
    const tick = async () => {
      try {
        const after = events.length ? events[events.length - 1].id : 0;
        const response = await fetch(`/api/runs/${runId}?after=${after}`, {
          cache: "no-store",
        });
        if (!response.ok || cancelled) return;

        const data = (await response.json()) as { run: RunSnapshot; events: RunEvent[] };
        setRun(data.run);
        if (data.events.length) setEvents((current) => [...current, ...data.events]);
        // A finished run's per-term table and stats are server-rendered.
        if (TERMINAL.has(data.run.status)) router.refresh();
      } catch {
        // Transient fetch failures are not worth surfacing; the next tick retries.
      }
    };

    const timer = setInterval(tick, 2_000);
    void tick();
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [live, runId, events, router]);

  useEffect(() => {
    const node = logRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [events]);

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <span
          className={`tag ${
            run.status === "failed" ? "bad" : run.status === "completed" ? "ok" : "live"
          }`}
        >
          {run.status}
        </span>
        {live && (
          <span className="small muted">
            <span className="pulse" aria-hidden="true" style={{ display: "inline-block", marginRight: 6 }} />
            updating every 2s
          </span>
        )}
      </div>

      {run.error && (
        <div className="banner bad">
          <b>Run failed:</b> {run.error}
        </div>
      )}

      <div className="stats">
        <div className="tile">
          <div className="label">Collected</div>
          <div className="value">{run.postsSeen.toLocaleString("en-AU")}</div>
        </div>
        <div className="tile">
          <div className="label">New (deduped)</div>
          <div className="value">{run.postsNew.toLocaleString("en-AU")}</div>
        </div>
        <div className="tile">
          <div className="label">Detected</div>
          <div className="value">{run.postsDetected.toLocaleString("en-AU")}</div>
        </div>
        <div className="tile k-ok">
          <div className="label">AU listings</div>
          <div className="value">{run.postsVerified.toLocaleString("en-AU")}</div>
        </div>
        <div className="tile">
          <div className="label">Detector cost</div>
          <div className="value">${run.detectorCostUsd.toFixed(4)}</div>
        </div>
      </div>

      <h2>Log</h2>
      <div className="log" ref={logRef}>
        {events.length === 0 ? (
          <div className="muted">Waiting for the first event…</div>
        ) : (
          events.map((event) => (
            <div key={event.id} className={`lvl-${event.level}`}>
              <time>{new Date(event.createdAt).toLocaleTimeString("en-AU", { hour12: false })}</time>
              <span className="phase">{event.phase}</span>
              <span>{event.message}</span>
            </div>
          ))
        )}
      </div>
    </>
  );
}
