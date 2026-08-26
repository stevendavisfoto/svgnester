import styled from "styled-components";
import { c } from "src/theme";

export const Layout = styled.div`
  display: grid;
  grid-template-columns: 377px 1fr;
  height: 100vh;
  overflow: hidden;
`;

export const Sidebar = styled.aside`
  background: ${c.bgSidebar};
  border-right: 1px solid ${c.borderFaint};
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
  overflow: hidden;
  padding: 20px 16px;
`;

export const Logo = styled.div`
  align-items: center;
  display: flex;
  gap: 8px;
  padding-bottom: 4px;
`;

export const LogoLeft = styled.div`
  align-items: center;
  display: flex;
  gap: 8px;
`;

export const LogoMark = styled.span`
  align-items: center;
  color: ${c.textPrimary};
  display: flex;
`;

export const LogoText = styled.span`
  color: ${c.accent};
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
`;

export const LogoAccent = styled.span`
  color: ${c.textPrimary};
`;

export const Main = styled.main`
  background: ${c.bgApp};
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  overflow: hidden;
  padding: 16px;
`;

export const ThemeToggleBtn = styled.button`
  display: none;
  align-items: center;
  background: ${c.surfaceControl};
  border: 1px solid ${c.borderDefault};
  border-radius: 6px;
  color: ${c.textMuted};
  cursor: pointer;
  /* display: flex; */
  flex-shrink: 0;
  height: 26px;
  justify-content: center;
  margin-left: auto;
  padding: 0;
  transition:
    background 0.15s,
    border-color 0.15s,
    color 0.15s;
  width: 26px;

  &:hover {
    background: ${c.accentBgHover};
    border-color: ${c.accentBorderSubtle};
    color: ${c.accent};
  }
`;

export const StatusBar = styled.p`
  background: ${c.surfaceCard};
  border: 1px solid ${c.borderDefault};
  border-radius: 6px;
  color: ${c.textMuted};
  font-size: 12px;
  margin-top: auto;
  padding: 8px 10px;
`;

export const ContactLink = styled.a`
  color: ${c.textGhost};
  font-size: 11px;
  font-weight: 500;
  margin-left: auto;
  text-decoration: none;
  transition: color 0.15s;

  &:hover {
    color: ${c.accent};
    text-decoration: underline;
  }
`;
