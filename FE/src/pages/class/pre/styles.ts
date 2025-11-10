import styled from "styled-components";

export const CONTAINER_MAX = 1200;
export const DOC_TEXT_MEASURE = 72;
export const SIDE_MIN = 360;
export const SIDE_MAX = 520;
export const TOOLBAR_H = 56;
export const TOOLBAR_GAP = 12;

export const PANEL_FIXED_H = `calc(100dvh - 120px - ${TOOLBAR_H}px - ${TOOLBAR_GAP}px - env(safe-area-inset-bottom, 0px))`;

export const PANEL_FIXED_H_LIVE = `calc(100dvh - 250px - ${TOOLBAR_H}px - ${TOOLBAR_GAP}px - env(safe-area-inset-bottom, 0px))`;

export const Wrap = styled.section`
  --ui-scale-effective: calc(var(--ui-scale, 1));
  min-height: 100dvh;
  background: #f8fafc;
  padding-bottom: calc(
    ${TOOLBAR_H}px + ${TOOLBAR_GAP}px + env(safe-area-inset-bottom, 0px)
  );
  width: 100%;
`;

export const SrLive = styled.div`
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  border: 0;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  overflow: hidden;
`;

export const Container = styled.div`
  max-width: ${CONTAINER_MAX}px;
  margin-inline: auto;
  padding: 16px clamp(16px, 4vw, 24px);
`;

export const Grid = styled.div<{ $stack: boolean }>`
  display: grid;
  gap: 16px;
  grid-template-columns: ${({ $stack }) =>
    $stack
      ? "1fr"
      : `minmax(0,1fr) minmax(${SIDE_MIN}px, clamp(${SIDE_MIN}px, 28vw, ${SIDE_MAX}px))`};
  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;
