import styled from "styled-components";
import { c } from "src/theme";

export const Tooltip = styled.span`
  background: ${c.bgTooltip};
  border: 1px solid ${c.borderDefault};
  border-radius: 6px;
  color: ${c.textTooltip};
  font-size: 11px;
  font-weight: 400;
  left: 50%;
  letter-spacing: 0;
  line-height: 1.5;
  min-width: 180px;
  max-width: 240px;
  opacity: 0;
  padding: 7px 10px;
  pointer-events: none;
  position: absolute;
  text-align: left;
  text-transform: none;
  top: calc(100% + 6px);
  transform: translateX(-50%) translateY(-4px);
  transition:
    opacity 0.15s,
    transform 0.15s,
    visibility 0.15s;
  visibility: hidden;
  white-space: normal;
  z-index: 100;

  /* Arrow pointing up */
  &::before {
    border: 5px solid transparent;
    border-bottom-color: ${c.borderDefault};
    content: "";
    left: 50%;
    position: absolute;
    top: -11px;
    transform: translateX(-50%);
  }
  &::after {
    border: 5px solid transparent;
    border-bottom-color: ${c.bgTooltip};
    content: "";
    left: 50%;
    position: absolute;
    top: -10px;
    transform: translateX(-50%);
  }
`;

export const Container = styled.div`
  align-items: stretch;
  background: ${c.surfaceCard};
  border: 1px solid ${c.borderDefault};
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  overflow: visible;
`;

export const StatRow = styled.div`
  display: grid;
  gap: 1px;
  grid-template-columns: repeat(5, 1fr);
`;

export const StatCard = styled.div`
  background: ${c.surfaceFaint};
  cursor: default;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 12px 10px;
  position: relative;

  &:hover ${Tooltip}, &:focus-within ${Tooltip} {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
    visibility: visible;
  }

  &:first-child {
    border-radius: 10px 0 0 0;
  }
  &:last-child {
    border-radius: 0 10px 0 0;
  }
`;

export const StatValue = styled.span`
  color: ${c.textPrimary};
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.02em;
`;

export const StatLabel = styled.span`
  color: ${c.textDim};
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
`;

export const Bar = styled.div.attrs<{ $pct: number }>((p) => ({
  style: { width: `${Math.min(p.$pct * 100, 100)}%` },
}))<{ $pct: number }>`
  background: ${c.accent};
  border-radius: 0 2px 2px 0;
  bottom: 0;
  height: 3px;
  left: 0;
  position: absolute;
  transition: width 0.4s;
`;

export const BadgeRow = styled.div`
  align-items: center;
  background: ${c.surfaceFaint};
  border-top: 1px solid ${c.borderDefault};
  display: flex;
  gap: 6px;
  padding: 8px 12px;
`;

export const BadgeWrap = styled.span`
  position: relative;

  &:hover ${Tooltip}, &:focus-within ${Tooltip} {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
    visibility: visible;
  }
`;

export const Badge = styled.span<{ $active: boolean }>`
  background: ${({ $active }) => ($active ? c.accentBgBadge : c.surfaceFaint)};
  border: 1px solid
    ${({ $active }) => ($active ? c.accentBorder : c.borderDefault)};
  border-radius: 4px;
  color: ${({ $active }) => ($active ? c.accentLight : c.textGhost)};
  cursor: default;
  display: inline-block;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.05em;
  padding: 2px 6px;
`;
