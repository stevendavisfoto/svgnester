import {
  ArrowCounterClockwise,
  ArrowCounterClockwiseIcon,
  ArrowsHorizontalIcon,
  ArrowsVerticalIcon,
  PlayIcon,
  StopIcon,
} from "@phosphor-icons/react";
import { Fragment, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { GrainAxis, GravityCorner, NestConfig } from "src/types";
import type { PhysicalUnit } from "src/App";
import * as S from "./Controls.styles";

interface ControlsProps {
  config: NestConfig;
  onChange: (patch: Partial<NestConfig>) => void;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
  running: boolean;
  hasParts: boolean;
  hasBin: boolean;
  /** Sheet dimensions in SVG units — the reference scale for Curve tolerance. */
  binSize?: { width: number; height: number } | null;
  /** Physical sheet width in the chosen unit. */
  physicalW?: number | null;
  /** Physical sheet height in the chosen unit. */
  physicalH?: number | null;
  unit?: PhysicalUnit;
  onPhysicalWChange?: (w: number) => void;
  onPhysicalHChange?: (h: number) => void;
  onUnitChange?: (unit: PhysicalUnit) => void;
  onChangeBin?: () => void;
  onStartFillIn?: () => void;
  onStopFillIn?: () => void;
  fillingIn?: boolean;
  /** True once at least one nesting iteration has produced a placement result. */
  hasResult?: boolean;
}

/** Largest number of distinct orientations we're willing to compute NFPs for. */
const MAX_ROTATIONS = 72;

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

/** Round to `decimals` places and drop trailing zeros: 22.50 -> "22.5", 90.0 -> "90". */
function formatNum(v: number, decimals: number): string {
  return String(parseFloat(v.toFixed(decimals)));
}

interface HintCtx {
  binSize?: { width: number; height: number } | null;
  physicalW?: number | null;
  physicalH?: number | null;
  unit: PhysicalUnit;
}

interface FieldConfig {
  label: string;
  key: keyof NestConfig;
  /** min/max/step/decimals are for SVG-unit mode (or when no physical sheet is set). */
  min: number;
  max: number;
  step: number;
  decimals: number;
  suffix?: string;
  /**
   * When true the value is stored in SVG units but displayed in physical units
   * (in / mm) whenever sheet physical dimensions are known.  fieldRow handles
   * the conversion automatically — no toDisplay/fromDisplay needed for these.
   */
  isPhysical?: boolean;
  /** Per-unit step override for physical mode. */
  physStep?: { in: number; mm: number };
  /** Per-unit decimal places for physical mode. */
  physDecimals?: { in: number; mm: number };
  /** Converts the stored config value into the value shown in the field. */
  toDisplay?: (stored: number) => number;
  /** Converts the typed field value back into the stored config value. */
  fromDisplay?: (shown: number) => number;
  /** Secondary line under the field, e.g. "4 orientations". */
  hint?: (stored: number, ctx: HintCtx) => string;
  /** Hide the field entirely when another setting has taken over its job. */
  hidden?: (config: NestConfig) => boolean;
  tip: ReactNode;
}

const FIELDS: FieldConfig[] = [
  {
    label: "Part gap",
    key: "spacing",
    isPhysical: true,
    physStep: { in: 0.125, mm: 1 },
    physDecimals: { in: 3, mm: 1 },
    // SVG-unit fallback (no sheet selected)
    min: 0,
    max: 10_000,
    step: 1,
    decimals: 1,
    hint: undefined,
    tip: (
      <>
        Minimum clearance between any two parts, measured edge to edge. Set this
        to your tool's kerf width for laser cutting, or your bit's offset for
        CNC routing and plasma cutting.
        <br />
        <br />
        Half the gap is added as a buffer around every part. <strong>
          0
        </strong>{" "}
        lets part outlines touch.
      </>
    ),
  },
  {
    label: "Perimeter gap",
    key: "perimeterGap",
    isPhysical: true,
    physStep: { in: 0.125, mm: 1 },
    physDecimals: { in: 3, mm: 1 },
    min: 0,
    max: 10_000,
    step: 1,
    decimals: 1,
    tip: (
      <>
        Minimum clearance between any part and the sheet edge, measured from the
        part outline inward.
        <br />
        <br />
        This shrinks the usable area of the sheet on all sides. Set to{" "}
        <strong>0</strong> to let parts sit flush against the edge.
      </>
    ),
  },
  {
    label: "Curve tolerance",
    key: "curveTolerance",
    isPhysical: true,
    physStep: { in: 0.005, mm: 0.1 },
    physDecimals: { in: 3, mm: 2 },
    // SVG-unit fallback (no sheet selected)
    min: 0.001,
    max: 1_000,
    step: 0.1,
    decimals: 2,
    tip: (
      <>
        How far a straight segment may deviate from the true curve when Béziers
        and arcs are flattened into polygons. Lower is more faithful but adds
        vertices and slows calculations. A value around{" "}
        <strong>1&nbsp;mm</strong> / <strong>0.15&nbsp;in</strong> suits most
        artwork.
      </>
    ),
  },
  {
    label: "Rotation angle",
    key: "rotations",
    min: 360 / MAX_ROTATIONS,
    max: 360,
    step: 15,
    decimals: 1,
    suffix: "deg",
    // Stored as a count of evenly spaced orientations; shown as the angle between them.
    toDisplay: (rotations) => 360 / Math.max(1, rotations),
    fromDisplay: (angle) => clamp(Math.round(360 / angle), 1, MAX_ROTATIONS),
    hint: (rotations) => (rotations <= 1 ? "no rotation" : "") as string,
    // Grain alignment derives each part's angles from its own long axis, so this
    // setting has nothing left to control.
    hidden: (config) => config.grainAxis !== "off",
    tip: (
      <>
        Each part is tried at every multiple of this angle. <strong>90°</strong>{" "}
        means 0°, 90°, 180° and 270°; <strong>360°</strong> disables rotation
        entirely. Smaller angles pack tighter but multiply the no-fit polygons
        that must be computed, so nesting slows down quickly.
      </>
    ),
  },
  {
    label: "Grain tolerance",
    key: "grainTolerance",
    min: 0,
    max: 45,
    step: 5,
    decimals: 0,
    suffix: "deg",
    hint: undefined,
    hidden: (config) => config.grainAxis === "off",
    tip: (
      <>
        How far a part may tilt away from the grain axis if that packs better.
        <br />
        <br />
        <strong>0°</strong> locks every part exactly on axis. Loosening it
        recovers sheet area but tilts the grain, and it multiplies the no-fit
        polygons that must be computed — nesting slows noticeably past{" "}
        <strong>15°</strong>. Candidates are tried in 5° increments within the
        band.
      </>
    ),
  },
];

type Quality = "fast" | "balanced" | "best";

const QUALITY_PRESETS: Record<
  Quality,
  { label: string; populationSize: number; mutationRate: number; hint: string }
> = {
  fast: {
    label: "Fast",
    populationSize: 10,
    mutationRate: 10,
    hint: "Quick iterations",
  },
  balanced: {
    label: "Balanced",
    populationSize: 20,
    mutationRate: 7,
    hint: "Good quality / speed tradeoff",
  },
  best: {
    label: "Best",
    populationSize: 40,
    mutationRate: 5,
    hint: "Thorough search, slower",
  },
};

function deriveQuality(config: NestConfig): Quality {
  if (config.populationSize <= 12) return "fast";
  if (config.populationSize <= 25) return "balanced";
  return "best";
}

const QUALITY_TIP = (
  <>
    Controls how thoroughly the genetic algorithm searches for a better layout.
    Larger parts are always placed first so smaller parts can act as{" "}
    <strong>sand</strong>, filling the gaps left behind — Quality controls how
    many orderings and rotations get explored.
    <br />
    <br />
    <strong>Fast</strong> runs quick iterations — good for previewing.{" "}
    <strong>Balanced</strong> is a good default for real jobs.{" "}
    <strong>Best</strong> maximises exploration at the cost of slower
    generations. For most jobs, <strong>2–5 minutes</strong> of runtime produces
    results comparable to commercial nesting software.
  </>
);

const GRAIN_OPTIONS: {
  value: GrainAxis;
  label: ReactNode;
  ariaLabel: string;
}[] = [
  { value: "off", label: "Off", ariaLabel: "Off" },
  {
    value: "horizontal",
    label: <ArrowsHorizontalIcon size={14} weight="bold" />,
    ariaLabel: "Horizontal",
  },
  {
    value: "vertical",
    label: <ArrowsVerticalIcon size={14} weight="bold" />,
    ariaLabel: "Vertical",
  },
];

const GRAIN_TIP: ReactNode = (
  <>
    Line every part up with the grain of the stock. <strong>Horizontal</strong>{" "}
    lays each part down so it is widest across the sheet;{" "}
    <strong>Vertical</strong> stands it up so it is tallest.
    <br />
    <br />
    The axis is measured per part from its own longest dimension, so a part
    drawn at any angle still gets turned onto the grain. Turning a part
    end-over-end is also allowed, since that keeps the same axis.
    <br />
    <br />
    While this is on, <strong>Rotation angle</strong> is ignored and hidden —
    orientations come from the grain axis plus the tolerance below. Expect fewer
    parts to fit, since parts can no longer be turned across the sheet to
    squeeze in.
  </>
);

const TOGGLE_TIPS: Record<
  "allowMirroring" | "useHoles" | "exploreConcave" | "fillInMode",
  ReactNode
> = {
  allowMirroring: (
    <>
      Let the nester flip a part over — its mirror image — whenever that packs
      tighter. Doubles the orientations tried per part, so nesting takes longer.
      <br />
      <br />
      Only safe when the material has no <em>up</em> face and the shape is not
      handed: fine for plain sheet metal or plywood, wrong for printed or
      grained stock, leather, or anything laminated one side. Flipped parts are
      tagged <code>data-mirrored</code> in the exported SVG.
    </>
  ),
  useHoles: (
    <>
      Allow small parts to be placed inside the holes of larger parts. Recovers
      material on shapes with interior cutouts, but each hole needs its own
      no-fit polygon, so nesting gets slower.
    </>
  ),
  exploreConcave: (
    <>
      Finds placements tucked into concave notches — useful for L-shapes,
      crescents, and parts with interior pockets. Without this, those recesses
      are left empty.
      <br />
      <br />
      The tradeoff: it uses the full orbital NFP algorithm instead of the fast
      approximation, which costs performance and can occasionally reduce
      placement robustness. Leave it off until you notice wasted concave space.
    </>
  ),
  fillInMode: (
    <>
      After each nesting iteration, greedily fills any remaining empty space on
      the last sheet with extra copies of the parts, placing the smallest shapes
      first. Useful for maximising material usage — e.g. filling an offcut with
      as many bonus pieces as possible.
      <br />
      <br />
      Copies use the same no-fit-polygon cache as the originals, so there is no
      extra NFP computation cost. Iteration speed may decrease slightly when
      many copies fit.
    </>
  ),
};

function SettingLabel({ label, tip }: { label: string; tip: ReactNode }) {
  return (
    <S.LabelGroup>
      <S.RowLabel>{label}</S.RowLabel>
      <S.InfoIcon tabIndex={0} role="button" aria-label={`About ${label}`}>
        ?
      </S.InfoIcon>
      <S.Tooltip role="tooltip">{tip}</S.Tooltip>
    </S.LabelGroup>
  );
}

interface NumberFieldProps {
  value: number | null;
  min: number;
  max: number;
  step: number;
  decimals: number;
  suffix?: string;
  disabled?: boolean;
  /** If true, FieldWrap stretches to fill available flex space (for dim row). */
  fill?: boolean;
  label: string;
  onCommit: (v: number) => void;
  /**
   * Fired on every keystroke when the draft parses to a finite number — use
   * for live-linked fields that should update as the user types.
   */
  onInput?: (v: number) => void;
}

/**
 * Free-typing numeric field.  Keeps a local draft so partial input ("0.", "-")
 * survives keystrokes, then clamps and commits on blur / Enter.  Escape reverts.
 */
function NumberField({
  value,
  min,
  max,
  step,
  decimals,
  suffix,
  disabled,
  fill,
  label,
  onCommit,
  onInput,
}: NumberFieldProps) {
  const canonical = value == null ? "" : formatNum(value, decimals);
  const [draft, setDraft] = useState(canonical);

  // Re-sync whenever the committed value changes from the outside (e.g. Reset).
  useEffect(() => setDraft(canonical), [canonical]);

  const isDisabled = disabled || value == null;

  const commit = (raw: string) => {
    const parsed = parseFloat(raw);
    if (!Number.isFinite(parsed)) {
      setDraft(canonical);
      return;
    }
    const next = clamp(parsed, min, max);
    setDraft(formatNum(next, decimals));
    onCommit(next);
  };

  const nudge = (direction: 1 | -1) => {
    const base = Number.isFinite(parseFloat(draft))
      ? parseFloat(draft)
      : (value ?? 0);
    commit(String(clamp(base + direction * step, min, max)));
  };

  return (
    <S.FieldWrap $disabled={isDisabled} $fill={fill}>
      <S.NumberInput
        type="text"
        inputMode="decimal"
        aria-label={label}
        value={draft}
        disabled={isDisabled}
        onChange={(e) => {
          setDraft(e.target.value);
          const live = parseFloat(e.target.value);
          if (Number.isFinite(live) && onInput) onInput(live);
        }}
        onBlur={() => commit(draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit(draft);
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            setDraft(canonical);
            e.currentTarget.blur();
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            nudge(1);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            nudge(-1);
          }
        }}
      />
      {suffix && <S.Suffix>{suffix}</S.Suffix>}
    </S.FieldWrap>
  );
}

export function Controls({
  config,
  onChange,
  onStart,
  onStop,
  onReset,
  running,
  hasParts,
  hasBin,
  binSize,
  physicalW,
  physicalH,
  unit = "in",
  onPhysicalWChange,
  onPhysicalHChange,
  onUnitChange,
  onChangeBin,
  onStartFillIn,
  onStopFillIn,
  fillingIn = false,
  hasResult = false,
}: ControlsProps) {
  const canStart = hasParts && hasBin && !running;
  const settingsDisabled = !hasBin || running;
  const visibleFields = FIELDS.filter((field) => !field.hidden?.(config));
  const hintCtx: HintCtx = { binSize, physicalW, physicalH, unit };

  // Scale factor: SVG units → physical units.  Only valid when both physical
  // dimensions and SVG bin size are known.
  const hasPhys = physicalW != null && physicalH != null && binSize != null;
  // Use the width axis for the scale; aspect ratio is locked so either axis works.
  const svgPerPhys = hasPhys ? binSize!.width / physicalW! : null;

  const fieldRow = (field: FieldConfig) => {
    const stored = (config[field.key] as number) ?? 0;

    const usePhys = field.isPhysical && svgPerPhys != null;
    const step = usePhys
      ? (field.physStep?.[unit] ?? (unit === "in" ? 0.01 : 0.1))
      : field.step;
    const decimals = usePhys
      ? (field.physDecimals?.[unit] ?? (unit === "in" ? 3 : 2))
      : field.decimals;
    const suffix = usePhys ? unit : (field.suffix ?? "");

    // Convert SVG units → physical for display, physical → SVG units on commit.
    // isPhysical fields show blank (null) until a bin establishes the scale.
    const shown = usePhys
      ? stored / svgPerPhys!
      : field.isPhysical && !hasBin
        ? null
        : field.toDisplay
          ? field.toDisplay(stored)
          : stored;

    const handleCommit = (v: number) => {
      const svgVal = usePhys ? v * svgPerPhys! : v;
      onChange({
        [field.key]: field.fromDisplay ? field.fromDisplay(svgVal) : svgVal,
      });
    };

    return (
      <S.Row>
        <SettingLabel label={field.label} tip={field.tip} />
        <S.FieldColumn>
          <NumberField
            label={field.label}
            value={shown}
            min={field.min}
            max={field.max}
            step={step}
            decimals={decimals}
            suffix={suffix}
            disabled={settingsDisabled}
            onCommit={handleCommit}
          />
          {field.hint && (
            <S.FieldHint>{field.hint(stored, hintCtx)}</S.FieldHint>
          )}
        </S.FieldColumn>
      </S.Row>
    );
  };

  const grainAxisRow = (
    <S.Row>
      <SettingLabel label="Grain direction" tip={GRAIN_TIP} />
      <S.SegmentGroup role="group" aria-label="Grain direction">
        {GRAIN_OPTIONS.map((opt) => (
          <S.Segment
            key={opt.value}
            type="button"
            $active={config.grainAxis === opt.value}
            aria-pressed={config.grainAxis === opt.value}
            aria-label={opt.ariaLabel}
            disabled={settingsDisabled}
            onClick={() => onChange({ grainAxis: opt.value })}
          >
            {opt.label}
          </S.Segment>
        ))}
      </S.SegmentGroup>
    </S.Row>
  );

  return (
    <S.Panel>
      <S.Section>
        <S.SectionHeader>
          <S.SectionTitle>Settings</S.SectionTitle>
          <S.GhostButton onClick={onReset} disabled={running || !hasBin}>
            <ArrowCounterClockwiseIcon size={14} weight="bold" /> Reset
          </S.GhostButton>
        </S.SectionHeader>
        <S.Divider />
        {/* Physical sheet size — always visible; fields blank+disabled until a sheet is selected */}
        <S.DimRow>
          <S.DimRowHeader>
            <SettingLabel
              label="Sheet size"
              tip={
                <>
                  The physical dimensions of your sheet material. Set either
                  side and the other updates automatically to preserve the
                  sheet's aspect ratio.
                  <br />
                  <br />
                  This scale is used to convert <strong>
                    Part gap
                  </strong> and <strong>Curve tolerance</strong> between
                  real-world units and the SVG coordinate system — the rendered
                  output is unchanged.
                </>
              }
            />
            {hasBin && onChangeBin && (
              <S.ChangeBinBtn onClick={onChangeBin} disabled={running}>
                Change sheet
              </S.ChangeBinBtn>
            )}
          </S.DimRowHeader>
          <S.DimControls>
            <S.DimFieldGroup>
              <S.DimFieldLabel>Width</S.DimFieldLabel>
              <NumberField
                label="Sheet width"
                value={physicalW ?? null}
                min={0.001}
                max={10000}
                step={unit === "in" ? 0.125 : 1}
                decimals={unit === "in" ? 3 : 1}
                disabled={running || physicalW == null}
                fill
                onInput={onPhysicalWChange ?? (() => {})}
                onCommit={onPhysicalWChange ?? (() => {})}
              />
            </S.DimFieldGroup>
            <S.DimX>×</S.DimX>
            <S.DimFieldGroup>
              <S.DimFieldLabel>Height</S.DimFieldLabel>
              <NumberField
                label="Sheet height"
                value={physicalH ?? null}
                min={0.001}
                max={10000}
                step={unit === "in" ? 0.125 : 1}
                decimals={unit === "in" ? 3 : 1}
                disabled={running || physicalH == null}
                fill
                onInput={onPhysicalHChange ?? (() => {})}
                onCommit={onPhysicalHChange ?? (() => {})}
              />
            </S.DimFieldGroup>
            <S.UnitToggle>
              <S.Segment
                type="button"
                $active={unit === "in"}
                onClick={() => onUnitChange?.("in")}
                disabled={settingsDisabled}
              >
                in
              </S.Segment>
              <S.Segment
                type="button"
                $active={unit === "mm"}
                onClick={() => onUnitChange?.("mm")}
                disabled={settingsDisabled}
              >
                mm
              </S.Segment>
            </S.UnitToggle>
          </S.DimControls>
        </S.DimRow>
        <S.Divider />

        <S.Row style={{ alignItems: "flex-start", minHeight: "63px" }}>
          <SettingLabel
            label="Pack toward"
            tip={
              <>
                Which corner of the sheet parts are packed toward. The nester
                uses a gravity heuristic — parts are scored by how close they
                sit to the chosen corner, so changing this rotates the packing
                direction without rotating the sheet itself.
              </>
            }
          />
          <S.CornerGrid>
            {(
              [
                { id: "TL", label: "↖" },
                { id: "TR", label: "↗" },
                { id: "BL", label: "↙" },
                { id: "BR", label: "↘" },
              ] as { id: GravityCorner; label: string }[]
            ).map(({ id, label }) => (
              <S.CornerBtn
                key={id}
                type="button"
                $active={config.gravityCorner === id}
                disabled={settingsDisabled}
                onClick={() => onChange({ gravityCorner: id })}
                aria-label={`Pack toward ${id}`}
              >
                {label}
              </S.CornerBtn>
            ))}
          </S.CornerGrid>
        </S.Row>

        {visibleFields.map((field) => (
          <Fragment key={field.key}>
            {/* Divider + label before orientation group */}
            {(field.key === "rotations" || field.key === "grainTolerance") && (
              <>
                <S.Divider />
                <S.GroupLabel>Orientation</S.GroupLabel>
              </>
            )}
            {/* Exactly one of these two slots is ever visible, so the grain
                direction control lands immediately above whichever is showing. */}
            {(field.key === "rotations" || field.key === "grainTolerance") &&
              grainAxisRow}
            {fieldRow(field)}
          </Fragment>
        ))}

        <S.Divider />
        <S.LabelGroup style={{ lineHeight: "normal", minWidth: 0 }}>
          <S.GroupLabel>Quality</S.GroupLabel>
          <S.InfoIcon tabIndex={0} role="button" aria-label="About Quality">
            ?
          </S.InfoIcon>
          <S.Tooltip role="tooltip">{QUALITY_TIP}</S.Tooltip>
        </S.LabelGroup>
        <S.SegmentGroup style={{ width: "100%" }}>
          {(Object.keys(QUALITY_PRESETS) as Quality[]).map((key) => (
            <S.Segment
              key={key}
              type="button"
              $active={deriveQuality(config) === key}
              aria-pressed={deriveQuality(config) === key}
              aria-label={QUALITY_PRESETS[key].hint}
              disabled={settingsDisabled}
              onClick={() =>
                onChange({
                  populationSize: QUALITY_PRESETS[key].populationSize,
                  mutationRate: QUALITY_PRESETS[key].mutationRate,
                })
              }
            >
              {QUALITY_PRESETS[key].label}
            </S.Segment>
          ))}
        </S.SegmentGroup>

        <S.Divider />
        <S.GroupLabel>Options</S.GroupLabel>
        <S.Row>
          <SettingLabel
            label="Allow part mirroring"
            tip={TOGGLE_TIPS.allowMirroring}
          />
          <S.Toggle
            checked={config.allowMirroring}
            onChange={(e) => onChange({ allowMirroring: e.target.checked })}
            disabled={settingsDisabled}
          />
        </S.Row>
        <S.Row>
          <SettingLabel label="Allow Part-in-part" tip={TOGGLE_TIPS.useHoles} />
          <S.Toggle
            checked={config.useHoles}
            onChange={(e) => onChange({ useHoles: e.target.checked })}
            disabled={settingsDisabled}
          />
        </S.Row>
        <S.Row>
          <SettingLabel
            label="Explore concave"
            tip={TOGGLE_TIPS.exploreConcave}
          />
          <S.Toggle
            checked={config.exploreConcave}
            onChange={(e) => onChange({ exploreConcave: e.target.checked })}
            disabled={settingsDisabled}
          />
        </S.Row>
      </S.Section>

      <S.ButtonGroup>
        {!running ? (
          <S.ButtonTipWrap>
            <S.PrimaryButton onClick={onStart} disabled={!canStart}>
              <PlayIcon size={16} weight="bold" /> Start Nesting
            </S.PrimaryButton>
            <S.Tooltip role="tooltip">
              Results improve with each iteration — let it run 2–5 min for best
              quality.
            </S.Tooltip>
          </S.ButtonTipWrap>
        ) : (
          <S.DangerButton onClick={onStop}>
            <StopIcon size={16} weight="bold" /> Stop Nesting
          </S.DangerButton>
        )}
        {(onStartFillIn || onStopFillIn) &&
          (fillingIn ? (
            <S.DangerButton onClick={onStopFillIn}>
              <StopIcon size={16} weight="bold" /> Stop Fill-In
            </S.DangerButton>
          ) : (
            <S.ButtonTipWrap>
              <S.SecondaryButton
                onClick={onStartFillIn}
                disabled={running || !hasBin || !hasResult}
              >
                Fill Empty Space
              </S.SecondaryButton>
              <S.Tooltip role="tooltip">
                Tries to pack extra copies of your shapes into any remaining
                open space across <strong>all sheets</strong>. Goes through
                every shape type once per round — smallest first — then repeats
                until nothing more fits. Tries every allowed rotation angle, not
                just the ones the main run used. Keeps running and improving
                until you click <strong>Stop Fill In</strong>.
              </S.Tooltip>
            </S.ButtonTipWrap>
          ))}
      </S.ButtonGroup>
    </S.Panel>
  );
}
