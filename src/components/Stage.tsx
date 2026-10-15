import { useEffect, useState, type ReactNode } from "react";

export const STAGE_W = 1920;
export const STAGE_H = 1080;

/**
 * Lays everything out at 1920×1080 and scales it to fit whatever screen it's on.
 * The footer sits outside the stage so it hugs the real bottom edge at full width,
 * even when the screen isn't 16:9, while scaling to match.
 */
export function Stage({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const fit = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  const scale = Math.min(viewport.w / STAGE_W, viewport.h / STAGE_H);

  return (
    <div className="desk">
      <div className="stage" style={{ width: STAGE_W, height: STAGE_H, transform: `translate(-50%, -50%) scale(${scale})` }}>
        {children}
      </div>
      {footer && (
        <div className="stage-footer" style={{ width: viewport.w / scale, transform: `scale(${scale})` }}>
          {footer}
        </div>
      )}
    </div>
  );
}
