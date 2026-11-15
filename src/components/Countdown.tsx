"use client";

import { useSyncExternalStore } from "react";
import { countdownParts } from "@/lib/time";

// A once-per-second clock. Snapshot is whole seconds so it's stable between ticks.
function subscribe(onTick: () => void) {
  const id = setInterval(onTick, 1000);
  return () => clearInterval(id);
}
const getNowSeconds = () => Math.floor(Date.now() / 1000);
const getServerNow = () => null;

export function Countdown({ target }: { target: string }) {
  const targetMs = new Date(target).getTime();
  const nowSeconds = useSyncExternalStore(subscribe, getNowSeconds, getServerNow);
  const now = nowSeconds === null ? null : nowSeconds * 1000;

  // Render placeholders until mounted so server and client markup match.
  const parts = now === null ? null : countdownParts(targetMs, now);

  if (parts?.done) {
    return <p className="font-serif text-3xl font-semibold text-white">It’s trip time. ⛳</p>;
  }

  const units: [string, number | undefined][] = [
    ["Days", parts?.days],
    ["Hours", parts?.hours],
    ["Minutes", parts?.minutes],
    ["Seconds", parts?.seconds],
  ];

  return (
    <div className="grid grid-cols-4 gap-2 sm:gap-4" role="timer" aria-live="off">
      {units.map(([label, value]) => (
        <div key={label} className="rounded-xl bg-white/10 px-2 py-3 text-center backdrop-blur sm:py-5">
          <div className="font-serif text-3xl font-semibold tabular-nums text-white sm:text-6xl">
            {value === undefined ? "–" : label === "Days" ? value : String(value).padStart(2, "0")}
          </div>
          <div className="mt-1 text-[11px] font-medium uppercase tracking-widest text-white/70 sm:text-xs">
            {label}
          </div>
        </div>
      ))}
    </div>
  );
}
