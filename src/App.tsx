import { useCallback, useEffect, useRef, useState } from "react";
import {
  ShapesIcon,
  MoonIcon,
  SunIcon,
  GithubLogoIcon,
} from "@phosphor-icons/react";
import { ThemeVariables } from "src/theme";
import { useColorScheme } from "src/hooks/useColorScheme";
import { GeometryUtil } from "src/core/geometry";
import { polygonToPathD, extractElements } from "src/core/svg-parser";
import { Controls } from "src/components/Controls/Controls";
import { Stats } from "src/components/Stats/Stats";
import { SvgCanvas } from "src/components/SvgCanvas/SvgCanvas";
import { NestEngine } from "src/core/nest-engine";
import type {
  NestConfig,
  NestPolygon,
  NestStats,
  PartPlacement,
} from "src/types";
import { DEFAULT_CONFIG } from "src/types";
import * as S from "./App.styles";

const EMPTY_STATS: NestStats = {
  iterations: 0,
  utilization: 0,
  partsPlaced: 0,
  partsTotal: 0,
  binsUsed: 0,
  elapsed: 0,
  gpuEnabled: false,
  sharedMemEnabled: false,
};

export type PhysicalUnit = "in" | "mm";
const MM_PER_INCH = 25.4;
/** Shorter side default when a bin is first selected (inches). */
const DEFAULT_SHORT_IN = 12;
/** Default curve tolerance in physical units, applied when a bin is first selected or settings are reset. */
const DEFAULT_CURVE_TOL_PHYS: Record<PhysicalUnit, number> = {
  in: 0.15,
  mm: 1,
};

export default function App() {
  const { scheme, toggle: toggleScheme } = useColorScheme();
  const [config, setConfig] = useState<NestConfig>(DEFAULT_CONFIG);
  const [parts, setParts] = useState<NestPolygon[]>([]);
  /**
   * True part outlines in the nester's coordinate frame, produced by a run. Kept
   * apart from `parts` because they are shifted to each part's own origin, so
   * drawing them anywhere other than at a placement stacks them all in one corner.
   */
  const [outlines, setOutlines] = useState<NestPolygon[]>([]);
  const [binPolygon, setBinPolygon] = useState<NestPolygon | null>(null);
  const [selectedBinId, setSelectedBinId] = useState<number | null>(null);
  const [placements, setPlacements] = useState<PartPlacement[][]>([]);
  const [stats, setStats] = useState<NestStats>(EMPTY_STATS);
  const [running, setRunning] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);

  // Physical sheet dimensions and unit.  These live parallel to SVG-unit
  // geometry and are only for the UI — the nesting algorithm never sees them.
  const [unit, setUnit] = useState<PhysicalUnit>("in");
  const [physicalW, setPhysicalW] = useState<number | null>(null);
  const [physicalH, setPhysicalH] = useState<number | null>(null);
  // Width-to-height ratio of the selected bin in SVG units, locked once a bin
  // is chosen so the two physical fields stay linked.
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);

  const engineRef = useRef<NestEngine | null>(null);
  // Tracks whether the user has manually set curveTolerance. When false the
  // physical default is applied each time a new bin is selected.
  const curveToleranceCustomizedRef = useRef(false);

  const getEngine = () => {
    if (!engineRef.current) engineRef.current = new NestEngine(config);
    return engineRef.current;
  };

  const handleSvgLoaded = useCallback(
    (svgString: string) => {
      setUploadError(null);
      setParsing(true);

      // Phase 1: DOMParser runs on the main thread (workers don't have it).
      // This is fast — it only extracts attribute data, no tessellation.
      let elements;
      try {
        elements = extractElements(svgString);
      } catch (e) {
        setParsing(false);
        setUploadError(
          `Could not read this SVG: ${(e as Error).message}. Make sure the file is a valid SVG.`,
        );
        return;
      }

      if (elements.length === 0) {
        setParsing(false);
        setUploadError(
          "No supported shapes found in this SVG. Make sure your file uses path, rect, circle, ellipse, or polygon elements with closed outlines.",
        );
        return;
      }

      // Phase 2: expensive tessellation + toTree runs in a worker.
      const worker = new Worker(
        new URL("src/workers/parse.worker.ts", import.meta.url),
        { type: "module" },
      );

      const timeout = setTimeout(() => {
        worker.terminate();
        setParsing(false);
        setUploadError(
          "This SVG is too complex to process — it timed out after 30 seconds. " +
            "Try simplifying the file, reducing the number of paths, or increasing " +
            "the Curve Tolerance setting before loading.",
        );
      }, 30_000);

      worker.onmessage = (
        e: MessageEvent<{ polygons?: NestPolygon[]; error?: string }>,
      ) => {
        clearTimeout(timeout);
        worker.terminate();
        setParsing(false);
        const { polygons, error } = e.data;
        if (error) {
          setUploadError(
            `Could not process this SVG: ${error}. Try re-saving or re-exporting the file from your design tool.`,
          );
          return;
        }
        if (!polygons || polygons.length === 0) {
          setUploadError(
            "No valid shapes found after processing. Make sure each shape is a closed outline — not a stroke-only or grouped/clipped path. Text and raster images are not supported.",
          );
          return;
        }
        const engine = getEngine();
        engine.setPolygons(polygons);
        setParts(polygons);
        setOutlines([]);
        setBinPolygon(null);
        setSelectedBinId(null);
        setPlacements([]);
        setStats(EMPTY_STATS);
      };

      worker.onerror = (err) => {
        clearTimeout(timeout);
        worker.terminate();
        setParsing(false);
        setUploadError(
          `Could not process this SVG: ${err.message}. Try re-saving or re-exporting the file from your design tool.`,
        );
      };

      worker.postMessage({ elements, curveTolerance: config.curveTolerance });
    },
    [config.curveTolerance],
  );

  const handleSelectBin = useCallback(
    (id: number) => {
      const engine = getEngine();
      engine.setBin(id);
      const rawBin = parts.find((p) => p.id === id) ?? null;
      if (rawBin) {
        // Normalize to origin so the bin is drawn from (0,0). Placements arrive in
        // the shrunk bin's frame and are shifted into this one via engine.binOffset.
        const bounds = GeometryUtil.getPolygonBounds(rawBin);
        const ox = bounds?.x ?? 0;
        const oy = bounds?.y ?? 0;
        const normalized = rawBin.map((p) => ({
          x: p.x - ox,
          y: p.y - oy,
        })) as typeof rawBin;
        normalized.id = rawBin.id;
        normalized.source = rawBin.source;
        if (bounds) {
          normalized.width = bounds.width;
          normalized.height = bounds.height;
        }
        setBinPolygon(normalized);

        // Derive the aspect ratio and seed physical dimensions from a sensible
        // default (shorter side = DEFAULT_SHORT_IN inches).
        if (bounds) {
          const ratio = bounds.width / bounds.height;
          setAspectRatio(ratio);
          const short = DEFAULT_SHORT_IN;
          const factor = unit === "mm" ? MM_PER_INCH : 1;
          let physW: number;
          if (ratio >= 1) {
            physW = parseFloat((short * ratio * factor).toFixed(3));
            setPhysicalW(physW);
            setPhysicalH(parseFloat((short * factor).toFixed(3)));
          } else {
            physW = parseFloat((short * factor).toFixed(3));
            setPhysicalW(physW);
            setPhysicalH(parseFloat(((short / ratio) * factor).toFixed(3)));
          }
          // Only seed curveTolerance from the physical default on first selection
          // (or after the user explicitly reset/cleared customization).
          if (!curveToleranceCustomizedRef.current) {
            const svgPerPhys = bounds.width / physW;
            const curveTolerance = DEFAULT_CURVE_TOL_PHYS[unit] * svgPerPhys;
            setConfig((prev) => ({ ...prev, curveTolerance }));
            getEngine().updateConfig({ curveTolerance });
          }

          // Default grain axis to whichever dimension is longer.
          const grainAxis =
            bounds.width >= bounds.height ? "horizontal" : "vertical";
          setConfig((prev) => ({ ...prev, grainAxis }));
          getEngine().updateConfig({ grainAxis });
        }
      } else {
        setBinPolygon(null);
      }
      setSelectedBinId(id);
    },
    [parts, unit],
  );

  const handleConfigChange = useCallback((patch: Partial<NestConfig>) => {
    if (patch.curveTolerance !== undefined) {
      curveToleranceCustomizedRef.current = true;
    }
    setConfig((prev) => ({ ...prev, ...patch }));
    getEngine().updateConfig(patch);
  }, []);

  const handleResetConfig = useCallback(() => {
    curveToleranceCustomizedRef.current = false;
    let curveTolerance = DEFAULT_CONFIG.curveTolerance;
    if (physicalW != null && binPolygon?.width != null) {
      const svgPerPhys = binPolygon.width / physicalW;
      curveTolerance = DEFAULT_CURVE_TOL_PHYS[unit] * svgPerPhys;
    }
    // Mirror the same grain-axis default applied on bin selection.
    const grainAxis =
      binPolygon != null
        ? (binPolygon.width ?? 0) >= (binPolygon.height ?? 0)
          ? "horizontal"
          : "vertical"
        : DEFAULT_CONFIG.grainAxis;
    const resetConfig = { ...DEFAULT_CONFIG, curveTolerance, grainAxis };
    setConfig(resetConfig);
    getEngine().updateConfig(resetConfig);
  }, [physicalW, binPolygon, unit]);

  const handlePhysicalWChange = useCallback(
    (w: number) => {
      setPhysicalW(w);
      if (aspectRatio !== null) {
        setPhysicalH(parseFloat((w / aspectRatio).toFixed(3)));
      }
    },
    [aspectRatio],
  );

  const handlePhysicalHChange = useCallback(
    (h: number) => {
      setPhysicalH(h);
      if (aspectRatio !== null) {
        setPhysicalW(parseFloat((h * aspectRatio).toFixed(3)));
      }
    },
    [aspectRatio],
  );

  const handleUnitChange = useCallback((newUnit: PhysicalUnit) => {
    setUnit((prev) => {
      if (prev === newUnit) return prev;
      const factor = newUnit === "mm" ? MM_PER_INCH : 1 / MM_PER_INCH;
      setPhysicalW((w) =>
        w !== null
          ? parseFloat((w * factor).toFixed(newUnit === "mm" ? 1 : 3))
          : null,
      );
      setPhysicalH((h) =>
        h !== null
          ? parseFloat((h * factor).toFixed(newUnit === "mm" ? 1 : 3))
          : null,
      );
      return newUnit;
    });
  }, []);

  const handleStart = useCallback(() => {
    // Starting a fresh nesting run cancels any active fill-in loop.
    getEngine().stopFillIn();
    setFillingIn(false);
    setRunning(true);
    setPlacements([]);
    setStats(EMPTY_STATS);

    const engine = getEngine();
    engine.start({
      onProgress: (s) => setStats(s),
      onPlacement: (pl, s) => {
        // Render the true outlines, not the clearance-inflated envelopes the
        // nester collides against: those are packed until they touch, so drawing
        // them makes any part gap look like it was ignored.
        if (engine.partOutlines.size > 0) {
          setOutlines([...engine.partOutlines.values()]);
        }
        // Placements are relative to the shrunk bin, which sits half a gap
        // inside the bin the canvas and export draw. Move them into that frame.
        const { x: bx, y: by } = engine.binOffset;
        setPlacements(
          bx === 0 && by === 0
            ? pl
            : pl.map((bin) =>
                bin.map((p) => ({ ...p, x: p.x + bx, y: p.y + by })),
              ),
        );
        setStats(s);
      },
    });
  }, []);

  const handleStop = useCallback(() => {
    getEngine().stop();
    setRunning(false);
  }, []);

  const [fillingIn, setFillingIn] = useState(false);

  const handleStartFillIn = useCallback(() => {
    setFillingIn(true);
    getEngine()
      .startFillIn({
        onPlacement: (newPlacements, stats) => {
          setPlacements(newPlacements);
          setStats(stats);
        },
        onProgress: (stats) => setStats(stats),
      })
      .finally(() => setFillingIn(false));
  }, []);

  const handleStopFillIn = useCallback(() => {
    getEngine().stopFillIn();
    setFillingIn(false);
  }, []);

  const handleReset = useCallback(() => {
    curveToleranceCustomizedRef.current = false;
    const engine = getEngine();
    engine.stopFillIn();
    engine.reset();
    engineRef.current = null;
    setParts([]);
    setOutlines([]);
    setBinPolygon(null);
    setSelectedBinId(null);
    setPlacements([]);
    setPhysicalW(null);
    setPhysicalH(null);
    setAspectRatio(null);
    setStats(EMPTY_STATS);
    setRunning(false);
    setConfig(DEFAULT_CONFIG);
    setUploadError(null);
  }, []);

  // Clear bin selection without closing the file, so the user can pick a
  // different shape as the sheet.
  const handleChangeBin = useCallback(() => {
    curveToleranceCustomizedRef.current = false;
    setBinPolygon(null);
    setSelectedBinId(null);
    setPlacements([]);
    setOutlines([]);
    setPhysicalW(null);
    setPhysicalH(null);
    setAspectRatio(null);
    setStats(EMPTY_STATS);
  }, []);

  // Space bar toggles Start / Stop when focus is not inside a text input.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      )
        return;
      e.preventDefault();
      if (running) {
        handleStop();
      } else if (parts.length > 1 && selectedBinId !== null) {
        handleStart();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [running, parts.length, selectedBinId, handleStart, handleStop]);

  const handleDownload = useCallback(() => {
    if (!binPolygon || placements.length === 0) return;

    const binW = binPolygon.width ?? 400;
    const binH = binPolygon.height ?? 400;
    const sheets = placements.length;

    const gutter = Math.max(binW, binH) * 0.08;
    const totalW = sheets * binW + (sheets - 1) * gutter;
    const totalH = binH;
    const strokeWidth = Math.max(binW, binH) * 0.002;

    const svgNs = "http://www.w3.org/2000/svg";
    const doc = document.implementation.createDocument(svgNs, "svg", null);
    const root = doc.documentElement;
    root.setAttribute("xmlns", svgNs);
    root.setAttribute("viewBox", `0 0 ${totalW} ${totalH}`);
    root.setAttribute("width", `${totalW}`);
    root.setAttribute("height", `${totalH}`);

    placements.forEach((bin, index) => {
      const g = doc.createElementNS(svgNs, "g");
      g.setAttribute("transform", `translate(${index * (binW + gutter)} 0)`);
      g.setAttribute("id", `sheet-${index + 1}`);

      const title = doc.createElementNS(svgNs, "title");
      title.textContent = `Sheet ${index + 1} of ${sheets}`;
      g.appendChild(title);

      const outline = doc.createElementNS(svgNs, "path");
      outline.setAttribute("d", polygonToPathD(binPolygon));
      outline.setAttribute("fill", "none");
      outline.setAttribute("stroke", "#b0b0b0");
      outline.setAttribute("stroke-width", `${strokeWidth}`);
      outline.setAttribute("data-role", "sheet-outline");
      g.appendChild(outline);

      for (const p of bin) {
        const part = outlines.find((pt) => pt.id === p.id);
        if (!part) continue;
        const path = doc.createElementNS(svgNs, "path");
        path.setAttribute(
          "d",
          polygonToPathD(part, p.x, p.y, p.rotation, p.mirrored),
        );
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", "#000");
        path.setAttribute("stroke-width", `${strokeWidth}`);
        if (p.mirrored) path.setAttribute("data-mirrored", "true");
        g.appendChild(path);
      }

      root.appendChild(g);
    });

    const blob = new Blob([new XMLSerializer().serializeToString(doc)], {
      type: "image/svg+xml",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = sheets > 1 ? `nested-${sheets}-sheets.svg` : "nested.svg";
    a.click();
    URL.revokeObjectURL(url);
  }, [binPolygon, placements, outlines]);

  return (
    <>
      <ThemeVariables />
      <S.Layout>
        <S.Sidebar>
          <S.Logo>
            <S.LogoMark>
              <ShapesIcon size={22} weight="fill" />
            </S.LogoMark>
            <S.LogoText>
              SVG<S.LogoAccent>nester</S.LogoAccent>
            </S.LogoText>
            <S.GitHubLink
              href="https://github.com/stevendavisfoto/svgnester"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="View source on GitHub"
              title="View source on GitHub"
            >
              <GithubLogoIcon size={16} weight="fill" />
            </S.GitHubLink>
            <S.ThemeToggleBtn
              onClick={toggleScheme}
              aria-label={
                scheme === "dark"
                  ? "Switch to light mode"
                  : "Switch to dark mode"
              }
              title={
                scheme === "dark"
                  ? "Switch to light mode"
                  : "Switch to dark mode"
              }
            >
              {scheme === "dark" ? (
                <SunIcon size={16} weight="bold" />
              ) : (
                <MoonIcon size={16} weight="bold" />
              )}
            </S.ThemeToggleBtn>
            <S.ContactLink
              href={`mailto:${["stevendavisphoto.com", "@", "gmail.com"].join("")}`}
            >
              Contact Author
            </S.ContactLink>
          </S.Logo>

          <Controls
            config={config}
            onChange={handleConfigChange}
            onStart={handleStart}
            onStop={handleStop}
            onReset={handleResetConfig}
            running={running}
            hasParts={parts.length > 1}
            hasBin={selectedBinId !== null}
            binSize={
              binPolygon?.width != null && binPolygon?.height != null
                ? { width: binPolygon.width, height: binPolygon.height }
                : null
            }
            unit={unit}
            physicalW={physicalW}
            physicalH={physicalH}
            onPhysicalWChange={handlePhysicalWChange}
            onPhysicalHChange={handlePhysicalHChange}
            onUnitChange={handleUnitChange}
            onChangeBin={handleChangeBin}
            hasResult={placements.length > 0}
            onStartFillIn={handleStartFillIn}
            onStopFillIn={handleStopFillIn}
            fillingIn={fillingIn}
          />
        </S.Sidebar>

        <S.Main>
          <Stats stats={stats} />
          <SvgCanvas
            binPolygon={binPolygon}
            parts={parts}
            outlines={outlines}
            placements={placements}
            selectedBinId={selectedBinId}
            onSelectBin={handleSelectBin}
            onSvgLoaded={handleSvgLoaded}
            onClose={handleReset}
            onDownload={handleDownload}
            uploadDisabled={running || parsing}
            uploadParsing={parsing}
            uploadError={uploadError}
          />
        </S.Main>
      </S.Layout>
    </>
  );
}
