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

  const tone =
    run.status === "failed" ? "bad" : run.status === "completed" ? "ok" : "accent live";

  return (
    <>
      <div className="row" style={{ marginBottom: "var(--s4)" }}>
        <span className={`tag ${tone}`}>
          {live && <span className="dot" />}
          {run.status}
        </span>
        {live && (
          <span className="small faint" aria-live="polite">
            updating every 2s…
          </span>
        )}
      </div>

      {run.error && (
        <div className="banner bad">
          <b>Run failed:</b> {run.error}
        </div>
      )}

      <div className="stats" style={{ marginBottom: "var(--s5)" }}>
        <div className="stat">
          <b className="num">{run.postsSeen}</b>
          <span>Collected</span>
        </div>
        <div className="stat">
          <b className="num">{run.postsNew}</b>
          <span>New (deduped)</span>
        </div>
        <div className="stat">
          <b className="num">{run.postsDetected}</b>
          <span>Detected</span>
        </div>
        <div className="stat ok">
          <b className="num">{run.postsVerified}</b>
          <span>AU listings</span>
        </div>
        <div className="stat accent">
          <b className="num">${run.detectorCostUsd.toFixed(4)}</b>
          <span>Detector cost</span>
        </div>
      </div>

      <h2>Log</h2>
      <div className="log" ref={logRef} role="log" aria-live="polite" aria-label="Run log">
        {events.length === 0 ? (
          <div className="faint">Waiting for the first event…</div>
        ) : (
          events.map((event) => (
            <div key={event.id} className={`log-line lvl-${event.level}`}>
              <time>
                {new Date(event.createdAt).toLocaleTimeString("en-AU", { hour12: false })}
              </time>
              <span className="phase">[{event.phase}]</span>
              <span className="msg">{event.message}</span>
            </div>
          ))
        )}
      </div>
    </>
  );
}
