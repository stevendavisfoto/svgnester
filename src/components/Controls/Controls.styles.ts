import styled from "styled-components";
import { c } from "src/theme";

/**
 * Width shared by every control in the right-hand column of a settings row, so
 * numeric fields and segmented button sets line up as one edge down the panel.
 */
const CONTROL_WIDTH = "140px";

export const Panel = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
`;

export const Section = styled.div`
  background: ${c.surfaceCard};
  border: 1px solid ${c.borderDefault};
  border-radius: 10px;
  display: flex;
  /* Shrinks when Panel is too short (content scrolls), but never grows
     beyond its content height — so no empty space at the bottom. */
  flex: 0 1 auto;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;

  &::-webkit-scrollbar {
    display: none;
  }
  scrollbar-width: none;
`;

export const SectionHeader = styled.div`
  align-items: center;
  display: flex;
  justify-content: space-between;
`;

export const SectionTitle = styled.h3`
  color: ${c.textMuted};
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
`;

export const GhostButton = styled.button`
  align-items: center;
  background: none;
  border: none;
  border-radius: 6px;
  color: ${c.textGhost};
  cursor: pointer;
  display: flex;
  font-size: 12px;
  font-weight: 500;
  gap: 5px;
  padding: 4px 8px;
  transition:
    color 0.15s,
    background 0.15s;

  &:hover:not(:disabled) {
    background: ${c.surfaceHover};
    color: ${c.textFaint};
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.35;
  }
`;

export const ScaleNote = styled.p`
  background: ${c.accentBg};
  border-left: 2px solid ${c.accentBorderFocus};
  border-radius: 3px;
  color: ${c.textFaint};
  font-size: 11px;
  line-height: 1.4;
  margin-bottom: 2px;
  padding: 6px 8px;

  b {
    color: ${c.accentFaint};
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }
`;

export const Row = styled.div`
  align-items: center;
  display: flex;
  gap: 12px;
  justify-content: space-between;
  min-height: 32px;
`;

export const RowLabel = styled.label`
  color: ${c.textSecondary};
  font-size: 14px;
`;

export const Tooltip = styled.span`
  background: ${c.bgTooltip};
  border: 1px solid ${c.borderStrong};
  border-radius: 8px;
  box-shadow: 0 8px 24px ${c.shadowLg};
  color: ${c.textTooltip};
  font-size: 12px;
  left: 0;
  line-height: 1.45;
  opacity: 0;
  padding: 9px 11px;
  pointer-events: none;
  position: absolute;
  top: calc(100% + 8px);
  transition:
    opacity 0.14s ease,
    transform 0.14s ease;
  transform: translateY(-3px);
  visibility: hidden;
  width: 218px;
  z-index: 20;

  /* arrow */
  &::before {
    background: ${c.bgTooltip};
    border-left: 1px solid ${c.borderStrong};
    border-top: 1px solid ${c.borderStrong};
    content: "";
    height: 8px;
    left: 12px;
    position: absolute;
    top: -5px;
    transform: rotate(45deg);
    width: 8px;
  }

  strong {
    color: ${c.accentLight};
    font-weight: 600;
  }
`;

export const InfoIcon = styled.span`
  align-items: center;
  background: ${c.surfaceIcon};
  border-radius: 50%;
  color: ${c.textFaint};
  cursor: help;
  display: inline-flex;
  flex-shrink: 0;
  font-size: 9px;
  font-weight: 700;
  height: 14px;
  justify-content: center;
  transition:
    background 0.15s,
    color 0.15s;
  width: 14px;

  &:focus-visible {
    outline: 2px solid ${c.accent};
    outline-offset: 1px;
  }
`;

export const LabelGroup = styled.span`
  align-items: center;
  display: flex;
  gap: 6px;
  min-width: 110px;
  position: relative;
  line-height: 32px;

  &:hover ${InfoIcon}, &:focus-within ${InfoIcon} {
    background: ${c.accentBgStrong};
    color: ${c.accentFaint};
  }

  &:hover ${Tooltip}, &:focus-within ${Tooltip} {
    opacity: 1;
    transform: translateY(0);
    visibility: visible;
  }
`;

/** Wraps a full-width button to attach a tooltip that opens upward. */
export const ButtonTipWrap = styled.div`
  display: flex;
  flex-direction: column;
  position: relative;
  width: 100%;

  /* Flip tooltip above the button */
  ${Tooltip} {
    bottom: calc(100% + 8px);
    top: auto;
    transform: translateY(3px);

    /* Arrow points downward */
    &::before {
      bottom: -5px;
      top: auto;
      transform: rotate(225deg);
    }
  }

  &:hover ${Tooltip}, &:focus-within ${Tooltip} {
    opacity: 1;
    transform: translateY(0);
    visibility: visible;
  }
`;

export const FieldWrap = styled.div<{ $disabled?: boolean; $fill?: boolean }>`
  align-items: center;
  background: ${c.surfaceControl};
  border: 1px solid ${c.borderStrong};
  border-radius: 6px;
  box-sizing: border-box;
  display: flex;
  flex: ${({ $fill }) => ($fill ? "1" : "none")};
  gap: 1px;
  min-width: ${({ $fill }) => ($fill ? "0" : "auto")};
  opacity: ${({ $disabled }) => ($disabled ? 0.4 : 1)};
  padding: 0 8px;
  transition:
    background 0.15s,
    border-color 0.15s;
  width: ${({ $fill }) => ($fill ? "auto" : CONTROL_WIDTH)};

  &:focus-within {
    background: ${c.accentBgFocus};
    border-color: ${c.accent};
  }
`;

export const NumberInput = styled.input`
  background: none;
  border: none;
  color: ${c.textPrimary};
  flex: 1;
  font-family: inherit;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  min-width: 0;
  outline: none;
  padding: 7px 0;
  text-align: right;
  width: auto;

  &:disabled {
    cursor: not-allowed;
  }
`;

export const Suffix = styled.span`
  color: ${c.textFaint};
  font-size: 14px;
  line-height: 1;
  margin-left: 3px;
  user-select: none;
  vertical-align: baseline;
`;

export const Select = styled.select`
  appearance: none;
  background: ${c.surfaceControl}
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23888'/%3E%3C/svg%3E")
    no-repeat right 8px center;
  border: 1px solid ${c.borderStrong};
  border-radius: 6px;
  box-sizing: border-box;
  color: ${c.textPrimary};
  cursor: pointer;
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  outline: none;
  padding: 7px 28px 7px 10px;
  transition:
    border-color 0.15s,
    background 0.15s;
  width: ${CONTROL_WIDTH};

  &:focus {
    background-color: ${c.accentBgFocus};
    border-color: ${c.accent};
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }
`;

export const FieldColumn = styled.div`
  align-items: flex-end;
  display: flex;
  flex: 0 0 ${CONTROL_WIDTH};
  flex-direction: column;
  gap: 2px;
  width: ${CONTROL_WIDTH};
`;

export const FieldHint = styled.span`
  color: ${c.textHint};
  font-size: 11px;
  line-height: 1.35;
  max-width: 100%;
  text-align: right;
`;

export const SegmentGroup = styled.div`
  background: ${c.surfaceControl};
  border: 1px solid ${c.borderStrong};
  border-radius: 6px;
  box-sizing: border-box;
  display: flex;
  gap: 2px;
  padding: 2px;
  width: ${CONTROL_WIDTH};
`;

/** Compact unit toggle (in / mm) — matches CONTROL_WIDTH of other controls. */
export const UnitToggle = styled.div`
  align-self: flex-end;
  background: ${c.surfaceControl};
  border: 1px solid ${c.borderStrong};
  border-radius: 6px;
  box-sizing: border-box;
  display: flex;
  flex-shrink: 0;
  gap: 2px;
  padding: 2px;
  width: ${CONTROL_WIDTH};
`;

// ---------------------------------------------------------------------------
// Physical dimension row
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 2×2 corner picker
// ---------------------------------------------------------------------------

export const CornerGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3px;
  width: ${CONTROL_WIDTH};
`;

export const CornerBtn = styled.button<{ $active: boolean }>`
  background: ${({ $active }) => ($active ? c.accent : c.surfaceControl)};
  border: 1px solid ${({ $active }) => ($active ? c.accent : c.borderStrong)};
  border-radius: 5px;
  color: ${({ $active }) => ($active ? "#fff" : c.textMuted)};
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  padding: 6px 0;
  text-align: center;
  transition:
    background 0.15s,
    border-color 0.15s,
    color 0.15s;

  &:not(:disabled):hover {
    background: ${({ $active }) => ($active ? c.accentHover : c.surfaceHover)};
    border-color: ${({ $active }) => ($active ? c.accentHover : c.borderBold)};
    color: #fff;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }
`;

export const Divider = styled.hr`
  border: none;
  border-top: 1px solid ${c.borderDefault};
  margin: 4px 0;
`;

export const DimRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

export const DimRowHeader = styled.div`
  align-items: center;
  display: flex;
  justify-content: space-between;
`;

export const ChangeBinBtn = styled.button`
  background: transparent;
  border: none;
  color: ${c.accent};
  cursor: pointer;
  font-size: 11px;
  font-weight: 500;
  padding: 0;
  text-decoration: underline;
  text-underline-offset: 2px;
  transition: color 0.15s;

  &:hover {
    color: ${c.accentLight};
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }
`;

export const GroupLabel = styled.span`
  color: ${c.textGhost};
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
`;

export const DimLabel = styled.span`
  color: ${c.textSecondary};
  font-size: 14px;
`;

export const DimControls = styled.div`
  align-items: center;
  display: flex;
  gap: 6px;
`;

export const DimX = styled.span`
  align-self: flex-end;
  color: ${c.textGhost};
  flex-shrink: 0;
  font-size: 14px;
  padding-bottom: 7px;
`;

export const DimFieldGroup = styled.div`
  display: flex;
  flex: 0 0 72px;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
`;

export const DimFieldLabel = styled.span`
  color: ${c.textDim};
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.04em;
`;

export const Segment = styled.button<{ $active: boolean }>`
  background: ${({ $active }) => ($active ? c.accent : "transparent")};
  border: none;
  border-radius: 4px;
  color: ${({ $active }) => ($active ? "#fff" : c.textMuted)};
  cursor: pointer;
  align-items: center;
  display: flex;
  flex: 1;
  font-size: 14px;
  font-weight: 600;
  justify-content: center;
  min-width: 0;
  padding: 6px 4px;
  transition:
    background 0.15s,
    color 0.15s;

  &:not(:disabled):hover {
    background: ${({ $active }) => ($active ? c.accentHover : c.surfaceHover)};
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
`;

export const Toggle = styled.input.attrs({ type: "checkbox" })`
  appearance: none;
  background: ${c.surfaceControl};
  border: 1px solid ${c.borderStrong};
  border-radius: 4px;
  cursor: pointer;
  flex-shrink: 0;
  height: 16px;
  outline-offset: 2px;
  position: relative;
  transition:
    background 0.15s,
    border-color 0.15s;
  width: 16px;

  &:checked {
    background: ${c.accent};
    border-color: ${c.accent};
  }

  &:checked::after {
    border: 2px solid #fff;
    border-left: none;
    border-top: none;
    content: "";
    height: 8px;
    left: 4px;
    position: absolute;
    top: 1px;
    transform: rotate(45deg);
    width: 4px;
  }

  &:focus-visible {
    border-color: ${c.accent};
    outline: 2px solid ${c.accentBorderFocus};
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }
`;

export const ButtonGroup = styled.div`
  border-top: 1px solid ${c.borderFaint};
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: 8px;
  margin-top: auto;
  padding-top: 16px;
`;

const BaseButton = styled.button`
  align-items: center;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  font-size: 14px;
  font-weight: 600;
  gap: 8px;
  justify-content: center;
  padding: 12px 16px;
  transition:
    opacity 0.15s,
    transform 0.1s;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.35;
  }
  &:not(:disabled):active {
    transform: scale(0.98);
  }
`;

export const PrimaryButton = styled(BaseButton)`
  background: ${c.accent};
  color: #fff;

  &:not(:disabled):hover {
    background: ${c.accentHover};
  }
`;

export const DangerButton = styled(BaseButton)`
  background: ${c.danger};
  color: #fff;

  &:not(:disabled):hover {
    background: ${c.dangerHover};
  }
`;

export const SecondaryButton = styled(BaseButton)`
  background: ${c.surfaceSecondary};
  color: ${c.textSecondary};

  &:not(:disabled):hover {
    background: ${c.surfaceHoverMid};
  }
`;
