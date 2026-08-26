import styled, { keyframes } from "styled-components";
import { c } from "src/theme";

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.4; }
`;

export const DropZone = styled.div<{
  $dragging?: boolean;
  $disabled?: boolean;
}>`
  align-items: center;
  background: ${({ $dragging }) => ($dragging ? c.accentBg : c.surfaceFaint)};
  border: 2px dashed ${({ $dragging }) => ($dragging ? c.accent : c.borderBold)};
  border-radius: 12px;
  cursor: ${({ $disabled }) => ($disabled ? "not-allowed" : "pointer")};
  display: flex;
  flex-direction: column;
  gap: 10px;
  opacity: ${({ $disabled }) => ($disabled ? 0.5 : 1)};
  padding: 28px 24px;
  transition:
    border-color 0.2s,
    background 0.2s;

  &:hover {
    background: ${({ $disabled }) => ($disabled ? "none" : c.accentBgFaintest)};
    border-color: ${({ $disabled }) => ($disabled ? c.borderBold : c.accent)};
  }
`;

export const UploadIcon = styled.span`
  color: ${c.textGhost};
  display: flex;
  margin-bottom: 4px;
`;

export const Label = styled.span`
  color: ${c.textSecondary};
  font-size: 18px;
  font-weight: 500;
`;

export const Steps = styled.ol`
  display: flex;
  flex-direction: column;
  gap: 6px;
  list-style: none;
  margin-top: 4px;
  padding: 0;
  text-align: left;
  width: 100%;
`;

export const Step = styled.li`
  align-items: baseline;
  color: ${c.textDim};
  display: flex;
  font-size: 14px;
  gap: 8px;
  line-height: 1.4;

  strong {
    color: ${c.textSecondary};
    font-weight: 600;
  }
`;

export const StepNum = styled.span`
  background: ${c.surfaceControl};
  border-radius: 50%;
  color: ${c.textFaint};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 700;
  height: 16px;
  width: 16px;
`;

export const Hint = styled.span`
  border-top: 1px solid ${c.borderFaint};
  color: ${c.textGhost};
  font-size: 12px;
  margin-top: 4px;
  padding-top: 10px;
  width: 100%;
  text-align: center;
`;

export const ParsingBanner = styled.div`
  align-items: center;
  background: ${c.accentBg};
  border: 1px solid ${c.accentBorder};
  border-radius: 8px;
  color: ${c.accentLight};
  display: flex;
  flex-direction: column;
  font-size: 13px;
  gap: 10px;
  margin-top: 4px;
  max-width: 400px;
  padding: 14px 16px;
  text-align: center;
  width: 100%;
`;

export const Spinner = styled.span`
  animation: ${spin} 0.9s linear infinite;
  border: 2px solid ${c.accentBorder};
  border-top-color: ${c.accent};
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
  height: 20px;
  width: 20px;
`;

export const ParsingMessage = styled.span`
  animation: ${pulse} 1.8s ease-in-out infinite;
  font-size: 13px;
  font-weight: 500;
`;

export const ProgressTrack = styled.div`
  background: ${c.accentBorder};
  border-radius: 99px;
  height: 4px;
  overflow: hidden;
  width: 100%;
`;

export const ProgressFill = styled.div<{ $pct: number }>`
  background: ${c.accent};
  border-radius: 99px;
  height: 100%;
  transition: width 0.3s ease;
  width: ${({ $pct }) => $pct}%;
`;

export const ProgressLabel = styled.span`
  color: ${c.accentLight};
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  opacity: 0.7;
`;

export const ErrorBanner = styled.div`
  background: ${c.dangerBg};
  border: 1px solid ${c.dangerBorder};
  border-radius: 8px;
  color: ${c.dangerText};
  font-size: 13px;
  line-height: 1.5;
  margin-top: 4px;
  max-width: 400px;
  padding: 10px 14px;
  text-align: left;
  width: 100%;
`;
