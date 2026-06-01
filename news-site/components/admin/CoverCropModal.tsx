"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CloseIcon, CheckIcon, ImageIcon } from "@/components/admin/icons";

// Hand-rolled cover-image cropper (no external dependency, to match the repo).
// Drag to reposition, pinch / wheel / slider to zoom, live framed preview, then
// export a canvas-cropped JPEG. Works with mouse + touch via Pointer Events.

export type CropAspect = { id: string; label: string; ratio: number; note?: string };

// Default to the Open Graph / Facebook share-card ratio (1200×630 ≈ 1.91:1) so
// the chosen framing is exactly what shows when the article link is shared.
export const COVER_ASPECTS: CropAspect[] = [
  { id: "og", label: "Cover / Social", ratio: 1200 / 630, note: "1.91:1 · best for Facebook & the article hero" },
  { id: "wide", label: "16:9", ratio: 16 / 9, note: "Widescreen" },
  { id: "classic", label: "4:3", ratio: 4 / 3, note: "Taller crop" },
];

// Longest output edge. 1200px wide → 1200×630 at 1.91:1: sharp for a hero
// without producing a huge upload.
const OUTPUT_WIDTH = 1200;
const JPEG_QUALITY = 0.9;
const MAX_ZOOM = 5;

type Props = {
  /** Object URL or data URL of the source image to crop. */
  src: string;
  /** Called with the cropped JPEG once the user clicks Apply. */
  onApply: (blob: Blob) => void;
  onCancel: () => void;
  /** Whether the parent is busy uploading the result (disables Apply). */
  busy?: boolean;
  /** Surfaced when the canvas export fails (e.g. a cross-origin source taints it). */
  onExportError?: (message: string) => void;
};

type Natural = { w: number; h: number };

export function CoverCropModal({ src, onApply, onCancel, busy = false, onExportError }: Props) {
  const [aspect, setAspect] = useState<CropAspect>(COVER_ASPECTS[0]);
  const [natural, setNatural] = useState<Natural | null>(null);
  const [loadError, setLoadError] = useState(false);

  // Crop transform, in *cover* units: zoom=1 means the image exactly covers the
  // frame (no letterboxing). x/y are the image-center offset from the frame
  // center, in frame pixels. They're clamped so the frame is always filled.
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const frameRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [frameW, setFrameW] = useState(0);

  // Track active pointers for drag + pinch.
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const gesture = useRef<{ startDist: number; startZoom: number; startOffset: { x: number; y: number }; startMid: { x: number; y: number } } | null>(null);
  const dragStart = useRef<{ x: number; y: number; offX: number; offY: number } | null>(null);

  const frameH = frameW / aspect.ratio;

  // The displayed image size at zoom=1 (covers the frame), then scaled by zoom.
  const baseScale = useMemo(() => {
    if (!natural || !frameW) return 1;
    // cover: scale so both dimensions ≥ frame.
    return Math.max(frameW / natural.w, frameH / natural.h);
  }, [natural, frameW, frameH]);

  const dispW = natural ? natural.w * baseScale * zoom : 0;
  const dispH = natural ? natural.h * baseScale * zoom : 0;

  // Clamp offset so the (scaled) image always covers the frame.
  const clamp = useCallback(
    (x: number, y: number, dw: number, dh: number) => {
      const maxX = Math.max(0, (dw - frameW) / 2);
      const maxY = Math.max(0, (dh - frameH) / 2);
      return {
        x: Math.min(maxX, Math.max(-maxX, x)),
        y: Math.min(maxY, Math.max(-maxY, y)),
      };
    },
    [frameW, frameH],
  );

  // Re-clamp whenever zoom/aspect/frame changes.
  useEffect(() => {
    setOffset((o) => clamp(o.x, o.y, dispW, dispH));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispW, dispH, clamp]);

  // Measure the frame; keep it responsive.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () => setFrameW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Load the source to learn its natural size.
  useEffect(() => {
    setLoadError(false);
    setNatural(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      setNatural({ w: img.naturalWidth, h: img.naturalHeight });
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    };
    img.onerror = () => setLoadError(true);
    img.src = src;
  }, [src]);

  // Escape to cancel; lock background scroll.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onCancel();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onCancel, busy]);

  // ── Pointer gestures (drag + pinch) ──
  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      dragStart.current = { x: e.clientX, y: e.clientY, offX: offset.x, offY: offset.y };
    } else if (pointers.current.size === 2) {
      const pts = [...pointers.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      gesture.current = {
        startDist: dist,
        startZoom: zoom,
        startOffset: { ...offset },
        startMid: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 },
      };
      dragStart.current = null;
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];

    if (pts.length >= 2 && gesture.current) {
      // Pinch zoom around the gesture midpoint.
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const next = Math.min(MAX_ZOOM, Math.max(1, gesture.current.startZoom * (dist / gesture.current.startDist)));
      setZoom(next);
    } else if (pts.length === 1 && dragStart.current) {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      setOffset(clamp(dragStart.current.offX + dx, dragStart.current.offY + dy, dispW, dispH));
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) gesture.current = null;
    if (pointers.current.size === 1) {
      const p = [...pointers.current.values()][0];
      dragStart.current = { x: p.x, y: p.y, offX: offset.x, offY: offset.y };
    }
    if (pointers.current.size === 0) dragStart.current = null;
  }

  function onWheel(e: React.WheelEvent) {
    const next = Math.min(MAX_ZOOM, Math.max(1, zoom - e.deltaY * 0.0015));
    setZoom(next);
  }

  // ── Export: draw the visible frame region to a canvas at output resolution ──
  function handleApply() {
    const img = imgRef.current;
    if (!img || !natural || !frameW) return;

    const outW = OUTPUT_WIDTH;
    const outH = Math.round(OUTPUT_WIDTH / aspect.ratio);
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // Map the on-screen frame → source pixels. The image is drawn centered in
    // the frame, shifted by `offset`, scaled by (baseScale*zoom). Invert that to
    // find the source rectangle currently under the frame.
    const scale = baseScale * zoom; // screen px per source px
    const frameToSource = 1 / scale;
    // Top-left of the frame, in displayed-image coordinates (image top-left at
    // frame center minus dispW/2 plus offset).
    const imgLeftInFrame = frameW / 2 + offset.x - dispW / 2;
    const imgTopInFrame = frameH / 2 + offset.y - dispH / 2;
    const sx = (0 - imgLeftInFrame) * frameToSource;
    const sy = (0 - imgTopInFrame) * frameToSource;
    const sw = frameW * frameToSource;
    const sh = frameH * frameToSource;

    try {
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
      canvas.toBlob(
        (blob) => {
          if (blob) onApply(blob);
          else onExportError?.("Couldn’t process the image. Please try a different file.");
        },
        "image/jpeg",
        JPEG_QUALITY,
      );
    } catch {
      // A cross-origin source without CORS taints the canvas and blocks export.
      onExportError?.("Couldn’t export this image (it may be from another site). Upload the file directly instead.");
    }
  }

  return (
    <div className="adm-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}>
      <div className="adm-modal adm-crop-modal" role="dialog" aria-modal="true" aria-label="Adjust cover image">
        <div className="adm-modal-head">
          <div>
            <h2 className="adm-serif" style={{ margin: 0 }}>Adjust cover image</h2>
            <p className="adm-crop-sub">Drag to reposition · scroll, pinch, or use the slider to zoom</p>
          </div>
          <button type="button" className="adm-iconbtn" aria-label="Cancel" onClick={onCancel} disabled={busy}>
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="adm-modal-body adm-crop-body">
          {loadError ? (
            <div className="adm-crop-error">
              <div className="adm-ill" style={{ margin: "0 auto 12px" }}><ImageIcon className="h-7 w-7" /></div>
              <p>Couldn’t load that image. Please pick another file.</p>
            </div>
          ) : (
            <>
              {/* Aspect presets. */}
              <div className="adm-crop-aspects" role="group" aria-label="Aspect ratio">
                {COVER_ASPECTS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className={`adm-crop-aspect ${a.id === aspect.id ? "on" : ""}`}
                    onClick={() => setAspect(a)}
                    title={a.note}
                  >
                    {a.label}
                  </button>
                ))}
              </div>

              {/* The crop stage. */}
              <div
                ref={frameRef}
                className="adm-crop-stage"
                style={{ aspectRatio: String(aspect.ratio) }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onWheel={onWheel}
              >
                {natural && frameW > 0 && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={src}
                    alt=""
                    draggable={false}
                    className="adm-crop-img"
                    style={{
                      width: dispW,
                      height: dispH,
                      transform: `translate(${offset.x}px, ${offset.y}px)`,
                    }}
                  />
                )}
                {!natural && <div className="adm-crop-loading"><span className="adm-spinner" aria-hidden /></div>}
                {/* Rule-of-thirds guides. */}
                <div className="adm-crop-grid" aria-hidden>
                  <span /><span /><span /><span />
                </div>
              </div>

              {/* Zoom slider. */}
              <div className="adm-crop-zoom">
                <span className="adm-crop-zoom-lbl" aria-hidden>−</span>
                <input
                  type="range"
                  min={1}
                  max={MAX_ZOOM}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  aria-label="Zoom"
                  className="adm-crop-range"
                />
                <span className="adm-crop-zoom-lbl" aria-hidden>+</span>
              </div>

              <p className="adm-crop-note">
                Exports a {OUTPUT_WIDTH}px-wide image · this framing is what shows on the article and
                when shared on Facebook.
              </p>
            </>
          )}
        </div>

        <div className="adm-modal-foot">
          <button type="button" className="adm-btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className="adm-btn-primary" onClick={handleApply} disabled={busy || loadError || !natural}>
            {busy ? <span className="adm-spinner" aria-hidden /> : <CheckIcon className="h-4 w-4" />}
            {busy ? "Saving…" : "Apply"}
          </button>
        </div>
      </div>
    </div>
  );
}
