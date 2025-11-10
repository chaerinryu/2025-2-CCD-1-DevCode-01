import { PANEL_FIXED_H } from "@pages/class/pre/styles";
import { fonts } from "@styles/fonts";
import styled from "styled-components";

type Props = {
  summaryText?: string | null;
  summaryTtsUrl?: string | null;
  sidePaneRef: React.RefObject<HTMLDivElement | null>;
  sumAudioRef: React.RefObject<HTMLAudioElement | null>;
  stack: boolean;
  panelHeight?: string;
};

export default function SummaryPane({
  summaryText,
  summaryTtsUrl,
  sidePaneRef,
  sumAudioRef,
  stack,
  panelHeight,
}: Props) {
  return (
    <Pane
      ref={sidePaneRef}
      $stack={stack}
      $height={panelHeight}
      role="complementary"
      aria-label="요약"
      tabIndex={0}
      data-area="summary-pane"
    >
      <Header>
        <Title>요약</Title>
        <SrOnlyFocusable
          type="button"
          onClick={() => sumAudioRef?.current?.play()}
          aria-label="요약 TTS 재생"
        >
          요약 듣기
        </SrOnlyFocusable>
        {summaryTtsUrl && (
          <audio ref={sumAudioRef} preload="none" src={summaryTtsUrl} />
        )}
      </Header>
      <Body>
        <Paragraph>{summaryText ?? "요약이 없습니다."}</Paragraph>
      </Body>
    </Pane>
  );
}

/* styled */
const Pane = styled.aside<{ $stack: boolean; $height?: string }>`
  position: ${({ $stack }) => ($stack ? "static" : "sticky")};
  top: 16px;
  background: var(--c-white);
  color: var(--c-black);
  border: 1px solid #e7eef6;
  border-radius: 12px;
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.04);
  height: ${({ $height }) => $height ?? PANEL_FIXED_H};
  display: flex;
  flex-direction: column;
  overflow: scroll;
  ${({ $stack }) => $stack && `order:2;`} @media (max-width:900px) {
    order: 2;
  }
  &:focus-visible {
    outline: 2px solid #2563eb;
    outline-offset: 2px;
    border-radius: 10px;
  }
`;
const Header = styled.div`
  padding: 14px 16px 0;
`;
const Title = styled.h3`
  ${fonts.bold32}
  color: var(--c-black);
  margin: 0;
`;
const Body = styled.div`
  flex: 1 1 auto;
  overflow: auto;
  padding: 12px 16px 16px;
  overscroll-behavior: contain;
`;
const Paragraph = styled.p`
  white-space: pre-wrap;
  line-height: 1.7;
  ${fonts.medium26}
  color: var(--c-black);
`;
const SrOnlyFocusable = styled.button`
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  border: 0;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  overflow: hidden;
  &:focus {
    outline: none;
  }
`;
