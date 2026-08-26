import styled from "styled-components";
import { c } from "src/theme";

export const Container = styled.div`
  background: ${c.surfaceFaint};
  border: 1px solid ${c.borderDefault};
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  position: relative;
`;

export const Header = styled.div`
  align-items: center;
  border-bottom: 1px solid ${c.borderDefault};
  display: flex;
  gap: 12px;
  justify-content: space-between;
  padding: 12px 16px;
`;

export const Title = styled.h2`
  color: ${c.textMuted};
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
`;

export const Instruction = styled.span`
  color: ${c.accent};
  font-size: 12px;
`;

export const HeaderRight = styled.div`
  align-items: center;
  display: flex;
  gap: 10px;
`;

export const DownloadButton = styled.button`
  background: ${c.accent};
  border: none;
  border-radius: 8px;
  color: #fff;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  padding: 10px 20px;
  transition: opacity 0.15s;

  &:hover {
    opacity: 0.85;
  }
`;

export const UnplacedNote = styled.span`
  background: ${c.warningBg};
  border: 1px solid ${c.warningBorder};
  border-radius: 6px;
  color: ${c.warning};
  cursor: help;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  white-space: nowrap;
`;

export const CanvasWrap = styled.div<{ $pannable?: boolean }>`
  align-items: center;
  display: flex;
  flex: 1;
  justify-content: center;
  min-height: 0;
  overflow: ${({ $pannable }) => ($pannable ? "hidden" : "auto")};
  padding: 16px;
  ${({ $pannable }) => $pannable && "padding: 0; position: relative;"}
`;

export const ZoomLayer = styled.div<{ $snap?: boolean }>`
  height: 100%;
  transform-origin: 0 0;
  transition: ${({ $snap }) => ($snap ? "transform 0.25s ease-out" : "none")};
  width: 100%;
`;

export const ZoomControls = styled.div`
  align-items: center;
  bottom: 12px;
  display: flex;
  gap: 4px;
  left: 12px;
  position: absolute;
  z-index: 5;
`;

export const ZoomLabel = styled.span`
  backdrop-filter: blur(4px);
  background: ${c.surfaceOverlay};
  border: 1px solid ${c.borderDefault};
  border-radius: 7px;
  color: ${c.textDim};
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  line-height: 18px;
  min-width: 38px;
  padding: 4px 7px;
  text-align: center;
  user-select: none;
`;

export const DownloadBtn = styled.button`
  align-items: center;
  background: ${c.accent};
  border: none;
  border-radius: 6px;
  color: #fff;
  cursor: pointer;
  display: flex;
  font-size: 12px;
  font-weight: 600;
  gap: 6px;
  padding: 5px 10px;
  transition:
    background 0.15s,
    opacity 0.15s;
  white-space: nowrap;

  &:hover {
    background: ${c.accentHover};
  }
`;

export const CanvasHint = styled.div`
  bottom: 12px;
  color: ${c.textGhost};
  font-size: 12px;
  pointer-events: none;
  position: absolute;
  right: 12px;
  user-select: none;
  z-index: 5;
`;

export const ZoomBtn = styled.button`
  align-items: center;
  backdrop-filter: blur(4px);
  background: ${c.surfaceOverlay};
  border: 1px solid ${c.borderDefault};
  border-radius: 7px;
  color: ${c.textMuted};
  cursor: pointer;
  display: flex;
  height: 28px;
  justify-content: center;
  padding: 0;
  transition:
    background 0.15s,
    border-color 0.15s,
    color 0.15s;
  width: 28px;

  &:hover {
    background: ${c.accentBgHover};
    border-color: ${c.accentBorder};
    color: ${c.textHeading};
  }

  &:active {
    background: ${c.accentBgStrong};
  }
`;

export const Placeholder = styled.div`
  align-items: center;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 48px;
`;

export const PlaceholderIcon = styled.span`
  color: ${c.textPlaceholder};
  font-size: 48px;
`;

export const PlaceholderText = styled.p`
  color: ${c.textGhost};
  font-size: 14px;
  max-width: 280px;
  text-align: center;
`;

export const CloseButton = styled.button`
  align-items: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  color: ${c.textMuted};
  cursor: pointer;
  display: flex;
  height: 26px;
  justify-content: center;
  padding: 0;
  transition:
    background 0.15s,
    border-color 0.15s,
    color 0.15s;
  width: 26px;

  &:hover {
    background: ${c.dangerBgSubtle};
    border-color: ${c.dangerBorder};
    color: ${c.dangerText};
  }
`;

export const DialogOverlay = styled.div`
  align-items: center;
  background: ${c.scrim};
  bottom: 0;
  display: flex;
  justify-content: center;
  left: 0;
  position: absolute;
  right: 0;
  top: 0;
  z-index: 10;
`;

export const Dialog = styled.div`
  background: ${c.bgElevated};
  border: 1px solid ${c.borderDefault};
  border-radius: 12px;
  box-shadow: 0 8px 32px ${c.shadowMd};
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 320px;
  padding: 20px 24px;
  width: 90%;
`;

export const DialogTitle = styled.p`
  color: ${c.textHeading};
  font-size: 14px;
  font-weight: 600;
`;

export const DialogBody = styled.p`
  color: ${c.textDim};
  font-size: 13px;
  line-height: 1.5;
`;

export const DialogActions = styled.div`
  display: flex;
  gap: 8px;
  justify-content: flex-end;
`;

export const DialogCancelBtn = styled.button`
  background: transparent;
  border: 1px solid ${c.borderDefault};
  border-radius: 7px;
  color: ${c.textMuted};
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  padding: 7px 14px;
  transition:
    background 0.15s,
    border-color 0.15s;

  &:hover {
    background: ${c.surfaceSubtle};
    border-color: ${c.borderBold};
  }
`;

export const DialogConfirmBtn = styled.button`
  background: ${c.dangerBg};
  border: 1px solid ${c.dangerBorder};
  border-radius: 7px;
  color: ${c.dangerText};
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  padding: 7px 14px;
  transition:
    background 0.15s,
    border-color 0.15s;

  &:hover {
    background: ${c.dangerBgHover};
    border-color: ${c.dangerBorderHover};
  }
`;
