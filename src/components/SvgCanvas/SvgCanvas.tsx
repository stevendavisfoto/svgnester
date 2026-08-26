import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  XIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
  CornersOutIcon,
  DownloadSimpleIcon,
} from "@phosphor-icons/react";
import type { NestPolygon, PartPlacement } from "src/types";
import { GeometryUtil } from "src/core/geometry";
import { polygonToPathD } from "src/core/svg-parser";
import { FileUpload } from "src/components/FileUpload/FileUpload";
import * as S from "./SvgCanvas.styles";

interface SvgCanvasProps {
  binPolygon: NestPolygon | null;
  parts: NestPolygon[];
  /** Run-produced outlines in the nester's frame; only valid at a placement. */
  outlines: NestPolygon[];
  placements: PartPlacement[][];
  selectedBinId: number | null;
  onSelectBin: (id: number) => void;
  onSvgLoaded?: (svg: string) => void;
  onClose?: () => void;
  onDownload?: () => void;
  uploadDisabled?: boolean;
  uploadParsing?: boolean;
  uploadError?: string | null;
}

const COLORS = [
  "#6c63ff",
  "#ff6b6b",
  "#ffd93d",
  "#6bcb77",
  "#4d96ff",
  "#ff922b",
  "#cc5de8",
  "#20c997",
  "#f06595",
  "#74c0fc",
];

function computePartsBounds(parts: NestPolygon[]): {
  minX: number;
  minY: number;
  width: number;
  height: number;
} {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const part of parts) {
    const b = GeometryUtil.getPolygonBounds(part);
    if (!b) continue;
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
    if (b.x + b.width > maxX) maxX = b.x + b.width;
    if (b.y + b.height > maxY) maxY = b.y + b.height;
  }
  if (!isFinite(minX)) return { minX: 0, minY: 0, width: 400, height: 400 };
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

interface Xform {
  scale: number;
  tx: number;
  ty: number;
}
const IDENTITY: Xform = { scale: 1, tx: 0, ty: 0 };

const MIN_SCALE = 1;
const MAX_SCALE = 50;
const ZOOM_FACTOR = 1.03;
const ZOOM_BTN_FACTOR = 1.35;

export function SvgCanvas({
  binPolygon,
  parts,
  outlines,
  placements,
  selectedBinId,
  onSelectBin,
  onSvgLoaded,
  onClose,
  onDownload,
  uploadDisabled,
  uploadParsing,
  uploadError,
}: SvgCanvasProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Pan/zoom — only active after a bin is selected.
  const [xform, setXform] = useState<Xform>(IDENTITY);
  const [isDragging, setIsDragging] = useState(false);
  const [snapAnim, setSnapAnim] = useState(false);
  const snapAnimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const xformRef = useRef<Xform>(IDENTITY);
  xformRef.current = xform;
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startTx: number;
    startTy: number;
  } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const snapToFitRef = useRef<() => void>(() => {});

  // Reset to fit whenever we enter/leave the placement preview.
  useEffect(() => {
    setXform(IDENTITY);
  }, [selectedBinId, parts]);

  // Close confirmation dialog on Escape.
  useEffect(() => {
    if (!confirmOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirmOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [confirmOpen]);

  // Non-passive wheel listener so we can prevent page scroll while zooming.
  useEffect(() => {
    if (selectedBinId === null) return;
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      // Scale continuously from deltaY so trackpad and mouse wheel both feel natural.
      const delta = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
      const factor = Math.pow(0.998, delta);
      const prev = xformRef.current;
      const newScale = Math.min(MAX_SCALE, prev.scale * factor);
      if (newScale <= MIN_SCALE) {
        snapToFitRef.current();
        return;
      }
      setXform({
        scale: newScale,
        tx: cx - (cx - prev.tx) * (newScale / prev.scale),
        ty: cy - (cy - prev.ty) * (newScale / prev.scale),
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [selectedBinId]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      // Don't start a drag when clicking a button (zoom controls, close, etc.)
      if ((e.target as HTMLElement).closest("button")) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startTx: xformRef.current.tx,
        startTy: xformRef.current.ty,
      };
      setIsDragging(true);
    },
    [],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      setXform((prev) => ({
        ...prev,
        tx: dragRef.current!.startTx + dx,
        ty: dragRef.current!.startTy + dy,
      }));
    },
    [],
  );

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
    setIsDragging(false);
  }, []);

  const snapToFit = useCallback(() => {
    if (snapAnimTimerRef.current) clearTimeout(snapAnimTimerRef.current);
    setSnapAnim(true);
    setXform(IDENTITY);
    snapAnimTimerRef.current = setTimeout(() => setSnapAnim(false), 300);
  }, []);
  snapToFitRef.current = snapToFit;

  const resetZoom = snapToFit;

  const zoomAtCenter = useCallback(
    (factor: number) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      const cx = rect ? rect.width / 2 : 200;
      const cy = rect ? rect.height / 2 : 200;
      const newScale = Math.min(MAX_SCALE, xformRef.current.scale * factor);
      if (newScale <= MIN_SCALE) {
        snapToFit();
        return;
      }
      if (snapAnimTimerRef.current) clearTimeout(snapAnimTimerRef.current);
      setSnapAnim(true);
      setXform((prev) => ({
        scale: newScale,
        tx: cx - (cx - prev.tx) * (newScale / prev.scale),
        ty: cy - (cy - prev.ty) * (newScale / prev.scale),
      }));
      snapAnimTimerRef.current = setTimeout(() => setSnapAnim(false), 300);
    },
    [snapToFit],
  );

  // Placements index into the run's outlines; fall back to the loaded parts only
  // so the very first frames of a run still have geometry to draw.
  const partMap = useMemo(
    () =>
      new Map((outlines.length > 0 ? outlines : parts).map((p) => [p.id, p])),
    [outlines, parts],
  );

  const allPlacements = placements.length > 0 ? placements : [[]];

  // Loose parts shown while no layout exists.
  const previewParts = useMemo(
    () =>
      placements.length === 0
        ? parts.filter((p) => p.id !== selectedBinId)
        : [],
    [placements, parts, selectedBinId],
  );

  // Parts the nester could not fit anywhere.
  const placedIds = useMemo(
    () => new Set(placements.flat().map((p) => p.id)),
    [placements],
  );
  const unplacedCount =
    placements.length > 0
      ? parts.filter((p) => p.id !== selectedBinId && !placedIds.has(p.id!))
          .length
      : 0;

  // Color index is global across sheets so the same part has the same color everywhere.
  // Must be declared before early returns to satisfy Rules of Hooks.
  const colorIndexMap = useMemo(() => {
    const map = new Map<number, number>();
    let idx = 0;
    for (const bin of allPlacements) {
      for (const pl of bin) {
        if (!map.has(pl.id)) map.set(pl.id, idx++);
      }
    }
    for (const part of previewParts) {
      if (!map.has(part.id!)) map.set(part.id!, idx++);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placements, previewParts]);

  // Memoize the bin outline path string — it never changes once a bin is set.
  // Must be declared before early returns to satisfy Rules of Hooks.
  const binPathD = useMemo(
    () => (binPolygon ? polygonToPathD(binPolygon) : ""),
    [binPolygon],
  );

  // No SVG loaded yet — show the upload dropzone centred in the canvas area
  if (parts.length === 0 && !binPolygon) {
    return (
      <S.Container>
        <S.Header>
          <S.Title>Placement Preview</S.Title>
        </S.Header>
        <S.CanvasWrap>
          <S.Placeholder>
            {onSvgLoaded ? (
              <FileUpload
                onSvgLoaded={onSvgLoaded}
                disabled={uploadDisabled ?? false}
                parsing={uploadParsing}
                error={uploadError}
              />
            ) : (
              <>
                <S.PlaceholderIcon>◈</S.PlaceholderIcon>
                <S.PlaceholderText>Upload an SVG to begin</S.PlaceholderText>
              </>
            )}
          </S.Placeholder>
        </S.CanvasWrap>
      </S.Container>
    );
  }

  const confirmDialog = confirmOpen ? (
    <S.DialogOverlay>
      <S.Dialog>
        <S.DialogTitle>Close this file?</S.DialogTitle>
        <S.DialogBody>
          This will clear the loaded shapes and any nesting results.
        </S.DialogBody>
        <S.DialogActions>
          <S.DialogCancelBtn onClick={() => setConfirmOpen(false)}>
            Cancel
          </S.DialogCancelBtn>
          <S.DialogConfirmBtn
            onClick={() => {
              setConfirmOpen(false);
              onClose?.();
            }}
          >
            Close file
          </S.DialogConfirmBtn>
        </S.DialogActions>
      </S.Dialog>
    </S.DialogOverlay>
  ) : null;

  // Parts loaded, no bin selected yet — show all parts and let user click one
  if (selectedBinId === null && parts.length > 0) {
    const { minX, minY, width, height } = computePartsBounds(parts);
    const pad = Math.max(width, height) * 0.05;
    return (
      <S.Container>
        {confirmDialog}
        <S.Header>
          <S.Title>Select Sheet Shape</S.Title>
          <S.HeaderRight>
            {onClose && (
              <S.CloseButton
                onClick={() => setConfirmOpen(true)}
                title="Close file"
                aria-label="Close file"
              >
                <XIcon size={18} weight="bold" />
              </S.CloseButton>
            )}
          </S.HeaderRight>
        </S.Header>
        <S.CanvasWrap style={{ position: "relative" }}>
          <svg
            viewBox={`${minX - pad} ${minY - pad} ${width + 2 * pad} ${height + 2 * pad}`}
            style={{ width: "100%", height: "100%" }}
          >
            {parts.map((part, i) => {
              const color = COLORS[i % COLORS.length];
              return (
                <g
                  key={part.id ?? i}
                  onClick={() => onSelectBin(part.id!)}
                  style={{ cursor: "pointer" }}
                >
                  <path
                    d={polygonToPathD(part)}
                    fill={color + "22"}
                    stroke={color}
                    strokeWidth={Math.max(width, height) * 0.002}
                  />
                  {/* Invisible larger hit area */}
                  <path
                    d={polygonToPathD(part)}
                    fill="transparent"
                    stroke="transparent"
                    strokeWidth={Math.max(width, height) * 0.02}
                  />
                </g>
              );
            })}
          </svg>
          <S.CanvasHint>Click a shape to use it as the sheet</S.CanvasHint>
        </S.CanvasWrap>
      </S.Container>
    );
  }

  // Inverse scale so stroke widths stay constant in screen pixels as you zoom.
  const invScale = 1 / xform.scale;

  // Bin selected — show all sheets side by side with pan/zoom.
  const binBounds = binPolygon
    ? GeometryUtil.getPolygonBounds(binPolygon)
    : null;
  const binW = binBounds?.width ?? 400;
  const binH = binBounds?.height ?? 400;
  const sheetCount = Math.max(allPlacements.length, 1);
  const gutter = Math.max(binW, binH) * 0.06;
  const totalW = sheetCount * binW + (sheetCount - 1) * gutter;
  const pad = Math.max(totalW, binH) * 0.04;
  const labelFontSize = pad * 0.7;
  const topPad = sheetCount > 1 ? pad * 0.4 + labelFontSize * 0.75 + pad : pad;

  const zoomPct = `${Math.round(xform.scale * 100)}%`;

  return (
    <S.Container>
      {confirmDialog}
      <S.Header>
        <S.Title>Placement Preview</S.Title>
        <S.HeaderRight>
          {unplacedCount > 0 && (
            <S.UnplacedNote
              title={
                "These parts fit on no sheet at the orientations being tried, so " +
                "they are not drawn anywhere. Reduce Part gap, allow more " +
                "rotation angles, or check that they are smaller than the sheet."
              }
            >
              {unplacedCount} part{unplacedCount === 1 ? "" : "s"} didn't fit
            </S.UnplacedNote>
          )}
          {onDownload && placements.length > 0 && (
            <S.DownloadBtn onClick={onDownload} aria-label="Download SVG">
              <DownloadSimpleIcon size={15} weight="bold" />
              Download SVG
            </S.DownloadBtn>
          )}
          {onClose && (
            <S.CloseButton
              onClick={() => setConfirmOpen(true)}
              title="Close file"
              aria-label="Close file"
            >
              <XIcon size={18} weight="bold" />
            </S.CloseButton>
          )}
        </S.HeaderRight>
      </S.Header>

      <S.CanvasWrap
        $pannable
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{ cursor: isDragging ? "grabbing" : "grab" }}
      >
        <S.ZoomLayer
          $snap={snapAnim}
          style={{
            transform: `translate(${xform.tx}px, ${xform.ty}px) scale(${xform.scale})`,
          }}
        >
          <svg
            viewBox={`${-pad} ${-topPad} ${totalW + 2 * pad} ${binH + topPad + pad}`}
            preserveAspectRatio="xMidYMid meet"
            style={{ width: "100%", height: "100%" }}
          >
            {allPlacements.map((sheetPlacements, si) => {
              const offsetX = si * (binW + gutter);
              return (
                <g key={si} transform={`translate(${offsetX} 0)`}>
                  {/* Sheet outline */}
                  {binPolygon && (
                    <path
                      d={binPathD}
                      fill="rgba(255,255,255,0.02)"
                      stroke="#3a3a4a"
                      strokeWidth={pad * 0.15 * invScale}
                    />
                  )}

                  {/* Sheet label when there are multiple */}
                  {sheetCount > 1 && (
                    <text
                      x={binW / 2}
                      y={-pad * 0.4}
                      textAnchor="middle"
                      fill="#4a4a5a"
                      fontSize={labelFontSize}
                      fontFamily="inherit"
                    >
                      Sheet {si + 1}
                    </text>
                  )}

                  {/* Placed parts */}
                  {sheetPlacements.map((placement, i) => {
                    const part = partMap.get(placement.id);
                    if (!part) return null;
                    const ci = colorIndexMap.get(placement.id) ?? i;
                    const color = COLORS[ci % COLORS.length];
                    return (
                      <g key={`${placement.id}-${i}`}>
                        <path
                          d={polygonToPathD(
                            part,
                            placement.x,
                            placement.y,
                            placement.rotation,
                            placement.mirrored,
                          )}
                          fill={color + "33"}
                          stroke={color}
                          strokeWidth={pad * 0.05 * invScale}
                          data-mirrored={
                            placement.mirrored ? "true" : undefined
                          }
                        >
                          <title>
                            {placement.mirrored
                              ? `Part ${placement.id} — flipped, rotated ${placement.rotation}°`
                              : `Part ${placement.id} — rotated ${placement.rotation}°`}
                          </title>
                        </path>
                      </g>
                    );
                  })}

                  {/* Parts preview when nesting hasn't started yet */}
                  {si === 0 &&
                    previewParts.map((part, i) => {
                      const ci = colorIndexMap.get(part.id!) ?? i;
                      const color = COLORS[ci % COLORS.length];
                      return (
                        <g key={part.id ?? i}>
                          <path
                            d={polygonToPathD(part)}
                            fill={color + "18"}
                            stroke={color + "60"}
                            strokeWidth={pad * 0.05 * invScale}
                            strokeDasharray={`${pad * 0.4 * invScale} ${pad * 0.2 * invScale}`}
                          />
                        </g>
                      );
                    })}
                </g>
              );
            })}
          </svg>
        </S.ZoomLayer>

        <S.ZoomControls>
          <S.ZoomBtn
            onClick={() => zoomAtCenter(1 / ZOOM_BTN_FACTOR)}
            title="Zoom out"
            aria-label="Zoom out"
          >
            <MagnifyingGlassMinusIcon size={14} weight="bold" />
          </S.ZoomBtn>
          <S.ZoomBtn
            onClick={resetZoom}
            title="Reset zoom"
            aria-label="Reset zoom"
          >
            <CornersOutIcon size={14} weight="bold" />
          </S.ZoomBtn>
          <S.ZoomBtn
            onClick={() => zoomAtCenter(ZOOM_BTN_FACTOR)}
            title="Zoom in"
            aria-label="Zoom in"
          >
            <MagnifyingGlassPlusIcon size={14} weight="bold" />
          </S.ZoomBtn>
          <S.ZoomLabel>{zoomPct}</S.ZoomLabel>
        </S.ZoomControls>
      </S.CanvasWrap>
    </S.Container>
  );
}
