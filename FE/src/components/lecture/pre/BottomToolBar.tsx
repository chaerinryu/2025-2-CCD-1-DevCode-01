import { TOOLBAR_GAP, TOOLBAR_H } from "@pages/class/pre/styles";
import { fonts } from "@styles/fonts";
import styled from "styled-components";
import { useEffect, useRef, useState } from "react";

type Mode = "ocr" | "image";

type CommonProps = {
  canPrev: boolean;
  canNext: boolean;
  page: number;
  totalPages?: number;
  mode: Mode;
  onPrev: () => void | Promise<void>;
  onNext: () => void | Promise<void>;
  onToggleMode: () => void;
  onGoTo: (page: number) => void | Promise<void>;
  /** 선택: 화면읽기 보조 음성 */
  speak?: (msg: string) => void;
};

type PreOnly = {
  onStart?: () => void | Promise<void>;
};

type LiveOnly = {
  onPause?: () => void | Promise<void>;
  onBookmark?: () => void | Promise<void>;
  onEnd?: () => void | Promise<void>;
  pauseLabel?: string;
};

type Props = CommonProps & PreOnly & LiveOnly;

export default function BottomToolbar({
  canPrev,
  canNext,
  page,
  totalPages,
  mode,
  onPrev,
  onNext,
  onToggleMode,
  onGoTo,
  speak,
  onStart,
  onPause,
  onBookmark,
  onEnd,
  pauseLabel = "일시 정지",
}: Props) {
  const [draft, setDraft] = useState<string>(String(page));
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDraft(String(page));
  }, [page]);

  const min = 1;
  const max = totalPages && totalPages > 0 ? totalPages : undefined;

  const normalize = (raw: string): number | null => {
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) return null;
    if (n < min) return min;
    if (max && n > max) return max;
    return n;
  };

  const goDraft = () => {
    const n = normalize(draft);
    if (n == null) {
      speak?.("유효한 숫자를 입력하세요.");
      setDraft(String(page));
      inputRef.current?.focus();
      return;
    }
    if (n === page) {
      speak?.(`이미 ${n}페이지입니다.`);
      return;
    }
    void onGoTo(n);
    speak?.(`${n}페이지로 이동`);
  };

  const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      goDraft();
    }
  };

  const onFocus: React.FocusEventHandler<HTMLInputElement> = () => {
    speak?.("페이지 번호 입력");
  };

  return (
    <Bar role="toolbar" aria-label="페이지 및 강의 조작">
      {/* ← → + 현재/전체 + 입력 이동 */}
      <Group>
        <Btn
          onClick={() => {
            void onPrev();
            speak?.("이전 페이지로 이동");
          }}
          onFocus={() => speak?.("이전 페이지 버튼")}
          disabled={!canPrev}
          aria-label="이전 페이지"
        >
          ‹
        </Btn>

        <PageInputWrap>
          <PageInput
            ref={inputRef}
            inputMode="numeric"
            type="text"
            role="spinbutton"
            aria-label="페이지 번호 입력"
            aria-valuemin={min}
            aria-valuemax={max ?? undefined}
            aria-valuenow={page}
            value={draft}
            onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ""))}
            onKeyDown={onKeyDown}
            onFocus={onFocus}
            onBlur={() => {
              setDraft(String(page));
            }}
          />
        </PageInputWrap>

        <Slash>/</Slash>
        <span aria-label="전체 페이지">{totalPages ?? "?"}</span>

        <Btn
          onClick={() => {
            void onNext();
            speak?.("다음 페이지로 이동");
          }}
          onFocus={() => speak?.("다음 페이지 버튼")}
          disabled={!canNext}
          aria-label="다음 페이지"
        >
          ›
        </Btn>
      </Group>

      <Divider role="separator" aria-orientation="vertical" />

      {/* 보기 전환 */}
      <Group>
        <Btn
          onClick={() => {
            onToggleMode();
            speak?.(mode === "ocr" ? "원본 보기로 전환" : "본문 보기로 전환");
          }}
          onFocus={() => speak?.("보기 전환 버튼")}
          aria-pressed={mode === "image"}
          aria-label={mode === "ocr" ? "원본 보기로 전환" : "본문 보기로 전환"}
        >
          {mode === "ocr" ? "원본 보기" : "본문 보기"}
        </Btn>
      </Group>

      {/* 라이브 전용 버튼(핸들러가 있을 때만 노출) */}
      {(onPause || onBookmark || onEnd) && (
        <>
          <Divider role="separator" aria-orientation="vertical" />
          <Group>
            {onPause && (
              <Btn
                type="button"
                onClick={() => {
                  void onPause();
                  speak?.(pauseLabel);
                }}
                onFocus={() => speak?.(`${pauseLabel} 버튼`)}
              >
                {pauseLabel}
              </Btn>
            )}
            {onBookmark && (
              <Btn
                type="button"
                onClick={() => {
                  void onBookmark();
                  speak?.("북마크 추가");
                }}
                onFocus={() => speak?.("북마크 버튼")}
              >
                북마크
              </Btn>
            )}
            {onEnd && (
              <Primary
                type="button"
                onClick={() => {
                  void onEnd();
                  speak?.("강의 종료");
                }}
                onFocus={() => speak?.("강의 종료 버튼")}
              >
                ■ 강의종료
              </Primary>
            )}
          </Group>
        </>
      )}

      {/* 강의 전 전용 버튼(있을 때만 노출) */}
      {onStart && (
        <>
          <Divider role="separator" aria-orientation="vertical" />
          <Group>
            <Primary
              type="button"
              onClick={() => {
                void onStart();
                speak?.("강의가 시작되었습니다.");
              }}
              onFocus={() => speak?.("강의 시작 버튼")}
            >
              ▶ 강의시작
            </Primary>
          </Group>
        </>
      )}
    </Bar>
  );
}

/* styled */
const Bar = styled.div`
  position: fixed;
  left: 50%;
  bottom: calc(${TOOLBAR_GAP}px + env(safe-area-inset-bottom, 0px));
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  height: ${TOOLBAR_H}px;
  padding: 2rem;
  background: var(--c-blue);
  color: var(--c-white);
  border-radius: 0.5rem;
  box-shadow: 0 6px 10px rgba(0, 0, 0, 0.12);
  z-index: 999;
  width: max-content;
`;
const Group = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;

  span {
    ${fonts.medium26};
  }
`;
const Divider = styled.div`
  width: 1px;
  height: 1.25rem;
  background: #ffffff55;
`;
const Btn = styled.button`
  border: 2px solid var(--c-white);
  ${fonts.medium26};
  background: transparent;
  color: var(--c-white);
  cursor: pointer;
  padding: 0.25rem 0.6rem;
  border-radius: 0.4rem;
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  &:focus-visible {
    outline: 2px solid var(--c-white);
    outline-offset: 2px;
  }
`;

const Slash = styled.span`
  ${fonts.medium26};
`;
const Primary = styled.button`
  background: var(--c-blue);
  color: var(--c-white);
  padding: 0.35rem 0.8rem;
  border-radius: 0.5rem;
  border: 2px solid var(--c-white);
  ${fonts.medium26};
  cursor: pointer;
`;

const PageInputWrap = styled.div`
  display: inline-flex;
  align-items: center;
  border: 2px solid var(--c-white);
  border-radius: 0.4rem;
  padding: 0.1rem 0.4rem;
  background: #ffffff22;
`;

const PageInput = styled.input`
  width: 3.2ch;
  text-align: center;
  background: transparent;
  border: 0;
  outline: none;
  color: var(--c-white);
  ${fonts.medium26};

  &::-webkit-outer-spin-button,
  &::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
`;
