"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { money } from "./format";

export interface LiveRunSnapshot {
  id: string;
  status: string;
  collectorId: string;
  postsSeen: number;
  postsNew: number;
  postsVerified: number;
  detectorCostUsd: number;
  stalled: boolean;
}

const TERMINAL = new Set(["completed", "failed", "cancelled"]);

/**
 * Run status, pinned above every page.
 *
 * A harvest takes tens of minutes and the pages you want to watch during one
 * (Feed, Keywords) aren't the page that reports it. Navigating away used to
 * mean losing sight of the run entirely.
 *
 * Only polls while a run is live: with nothing running this component renders
 * nothing and opens no timer.
 */
export function LiveRun({ initial }: { initial: LiveRunSnapshot }) {
  const [run, setRun] = useState(initial);
  const router = useRouter();
  const live = !TERMINAL.has(run.status);

  useEffect(() => {
    setRun(initial);
  }, [initial]);

  useEffect(() => {
    if (!live) return;

    let cancelled = false;
    const tick = async () => {
      try {
        const response = await fetch(`/api/runs/${run.id}?after=999999999`, {
          cache: "no-store",
        });
        if (!response.ok || cancelled) return;
        const data = await response.json();
        setRun((current) => ({ ...current, ...data.run }));
        // The strip disappears server-side; the rest of the page may also have
        // gained rows worth showing now that the run has finished.
        if (TERMINAL.has(data.run.status)) router.refresh();
      } catch {
        // A dropped poll is not worth reporting — the next tick retries.
      }
    };

    const timer = setInterval(tick, 3_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [live, run.id, router]);

  if (!live) return null;

  return (
    <Link href={`/runs/${run.id}`} className={`live-strip${run.stalled ? " stalled" : ""}`}>
      <span className={`pulse${run.stalled ? " warn" : ""}`} aria-hidden="true" />
      <b>{run.stalled ? "Run stalled" : `Harvest ${run.status}`}</b>
      <span className="mono">{run.collectorId}</span>
      {run.stalled && <span className="tag warn">no progress in 2 min</span>}
      <span className="figures">
        <span>{run.postsSeen.toLocaleString("en-AU")} seen</span>
        <span>{run.postsNew.toLocaleString("en-AU")} new</span>
        <span>{run.postsVerified.toLocaleString("en-AU")} verified</span>
        <span>{money(run.detectorCostUsd)}</span>
      </span>
    </Link>
  );
}
