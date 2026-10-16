import { useCallback, useEffect, useRef, useState } from "react";
import type { Edition, PaperConfig, WireStatus } from "../shared/types.ts";
import { FrontPage } from "./components/FrontPage.tsx";
import { IdleScreen } from "./components/IdleScreen.tsx";
import { Stage } from "./components/Stage.tsx";
import { Ticker } from "./components/Ticker.tsx";
import { confettiBurst, confettiDrift, fanfare, reducedMotion, unlockAudio } from "./fx.ts";

/** How long the spinner takes to land, and to fly off again. Keep in sync with styles.css. */
const SPIN_IN_MS = 1800;
const SPIN_OUT_MS = 900;
/** Browsing old editions with the arrow keys drops back to idle after this long. */
const BROWSE_MS = 30_000;

type Showing =
  | { kind: "idle" }
  | { kind: "celebrate"; edition: Edition; started: number }
  | { kind: "browse"; index: number }
  | { kind: "outro"; edition: Edition; celebrated: boolean };

function readSoundPref() {
  try {
    return localStorage.getItem("bugle:sound") === "on";
  } catch {
    return false;
  }
}

export default function App() {
  const [paper, setPaper] = useState<PaperConfig | null>(null);
  const [editions, setEditions] = useState<Edition[]>([]);
  const [status, setStatus] = useState<WireStatus>();
  const [queue, setQueue] = useState<Edition[]>([]);
  const [showing, setShowing] = useState<Showing>({ kind: "idle" });
  const [sound, setSound] = useState(readSoundPref);
  const [toast, setToast] = useState("");
  const soundRef = useRef(sound);
  soundRef.current = sound;

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  };

  // Initial load, live stream and wire status
  useEffect(() => {
    fetch("/api/config").then((r) => r.json()).then(setPaper);
    const load = () => fetch("/api/editions").then((r) => r.json()).then(setEditions).catch(() => {});
    const loadStatus = () => fetch("/api/status").then((r) => r.json()).then(setStatus).catch(() => {});
    load();
    loadStatus();
    const t1 = setInterval(load, 5 * 60_000);
    const t2 = setInterval(loadStatus, 30_000);

    const stream = new EventSource("/api/stream");
    stream.addEventListener("edition", (e) => {
      const { edition, celebrate } = JSON.parse((e as MessageEvent).data) as { edition: Edition; celebrate: boolean };
      setEditions((list) =>
        [edition, ...list.filter((x) => x.id !== edition.id)].sort((a, b) => b.shippedAt.localeCompare(a.shippedAt)),
      );
      if (celebrate) setQueue((q) => [...q, edition]);
    });
    return () => {
      clearInterval(t1);
      clearInterval(t2);
      stream.close();
    };
  }, []);

  // A new release interrupts idling or browsing (but waits for a spin-out to finish)
  useEffect(() => {
    if (showing.kind === "celebrate" || showing.kind === "outro" || queue.length === 0) return;
    const [next, ...rest] = queue;
    setQueue(rest);
    setShowing({ kind: "celebrate", edition: next, started: Date.now() });
  }, [queue, showing.kind]);

  // Celebration effects, then spin the paper away
  useEffect(() => {
    if (showing.kind !== "celebrate" || !paper) return;
    const landed = setTimeout(
      () => {
        confettiBurst(1);
        if (soundRef.current) fanfare();
      },
      reducedMotion() ? 0 : SPIN_IN_MS - 100,
    );
    const second = setTimeout(() => confettiBurst(0.6), SPIN_IN_MS + 3000);
    const stopDrift = confettiDrift(Math.min(30_000, paper.celebrateSeconds * 1000));
    const done = setTimeout(
      () => setShowing({ kind: "outro", edition: showing.edition, celebrated: true }),
      paper.celebrateSeconds * 1000,
    );
    return () => {
      clearTimeout(landed);
      clearTimeout(second);
      clearTimeout(done);
      stopDrift();
    };
  }, [showing, paper]);

  // Finish the spin-out, and time out of browsing
  useEffect(() => {
    if (showing.kind === "outro") {
      const t = setTimeout(() => setShowing({ kind: "idle" }), reducedMotion() ? 300 : SPIN_OUT_MS);
      return () => clearTimeout(t);
    }
    if (showing.kind === "browse") {
      const edition = editions[showing.index];
      const t = setTimeout(() => edition && setShowing({ kind: "outro", edition, celebrated: false }), BROWSE_MS);
      return () => clearTimeout(t);
    }
  }, [showing, editions]);

  /** ← goes back in time from the most recent release; → comes forward again, then back to the clock. */
  const browse = useCallback(
    (direction: "older" | "newer") =>
      setShowing((s) => {
        if (!editions.length) return s;
        if (s.kind === "celebrate") return { kind: "outro", edition: s.edition, celebrated: true };
        const current = s.kind === "browse" ? s.index : -1;
        const index = current + (direction === "older" ? 1 : -1);
        if (index >= editions.length) return s; // already at the oldest
        if (index < 0) return s.kind === "browse" ? { kind: "outro", edition: editions[s.index], celebrated: false } : s;
        return { kind: "browse", index };
      }),
    [editions],
  );

  // Keyboard: handy with a TV remote or a wireless keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === "t") {
        unlockAudio();
        fetch("/api/test", { method: "POST" });
      } else if (key === "r") {
        // Replay the latest release as if it had just shipped, on this screen only
        unlockAudio();
        if (editions[0]) setShowing({ kind: "celebrate", edition: editions[0], started: Date.now() });
      } else if (key === "f") {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen().catch(() => {});
      } else if (key === "s") {
        const next = !soundRef.current;
        setSound(next);
        try {
          localStorage.setItem("bugle:sound", next ? "on" : "off");
        } catch {
          /* private mode: the toggle just won't stick */
        }
        if (next) unlockAudio().then(fanfare);
        flash(next ? "Fanfare on" : "Fanfare off");
      } else if (key === "arrowright") browse("newer");
      else if (key === "arrowleft") browse("older");
      else if (key === "escape" || key === " ") {
        setShowing((s) =>
          s.kind === "celebrate"
            ? { kind: "outro", edition: s.edition, celebrated: true }
            : s.kind === "browse" && editions[s.index]
              ? { kind: "outro", edition: editions[s.index], celebrated: false }
              : s,
        );
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [browse, editions]);

  if (!paper) return <Stage>{null}</Stage>;

  const edition =
    showing.kind === "celebrate" || showing.kind === "outro"
      ? showing.edition
      : showing.kind === "browse"
        ? editions[showing.index]
        : undefined;
  const celebrating = showing.kind === "celebrate" || (showing.kind === "outro" && showing.celebrated);
  const motion = showing.kind === "outro" ? "spin-out" : showing.kind === "celebrate" ? "spin-in" : "slide-in";
  const holderKey =
    showing.kind === "celebrate" ? `c-${showing.started}` : showing.kind === "browse" ? `b-${edition?.id}` : `o-${edition?.id}`;
  const position =
    showing.kind === "browse" ? `Back issue ${showing.index + 1} of ${editions.length}` : undefined;

  return (
    <Stage footer={<Ticker editions={editions} status={status} position={position} />}>
      {(showing.kind === "idle" || showing.kind === "outro") && (
        <IdleScreen paper={paper} editions={editions} status={status} />
      )}
      {edition && (
        <div key={holderKey} className={`paper-holder ${motion}`}>
          <FrontPage edition={edition} paper={paper} celebrating={celebrating} />
          {celebrating && (
            <div className="sticker" aria-hidden>
              <span>Now live!</span>
            </div>
          )}
        </div>
      )}
      {queue.length > 0 && <div className="queue-note">{queue.length} more hot off the press</div>}
      {toast && <div className="toast">{toast}</div>}
    </Stage>
  );
}
