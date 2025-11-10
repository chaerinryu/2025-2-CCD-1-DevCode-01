// src/pages/class/Pre/PreClass.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams, useNavigate } from "react-router-dom"; // ✅ 추가
import toast from "react-hot-toast";
import {
  fetchPageSummary,
  fetchDocPage,
  type DocPage,
  type PageSummary,
} from "@apis/lecture/lecture.api";
import { formatOcr } from "@shared/formatOcr";
import {
  A11Y_STORAGE_KEYS,
  makeAnnouncer,
  readFontPct,
  readReadOnFocus,
} from "./pre/ally";

import { useFocusTTS } from "src/hooks/useFocusTTS";
import { Container, Grid, SrLive, Wrap } from "./pre/styles";
import DocPane from "src/components/lecture/pre/DocPane";
import SummaryPane from "src/components/lecture/pre/SummaryPane";
import BottomToolbar from "src/components/lecture/pre/BottomToolBar";
import { useLocalTTS } from "src/hooks/useLocalTTS";

type RouteParams = { docId?: string; courseId?: string };
type NavState = { navTitle?: string; totalPages?: number };

export default function PreClass() {
  const params = useParams<RouteParams>();
  const { state } = useLocation() as { state?: NavState };
  const navigate = useNavigate(); // ✅ 추가

  const docIdNum = useMemo(() => {
    const raw = params.docId ?? params.courseId;
    const n = Number.parseInt(raw ?? "", 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [params.docId, params.courseId]);

  const [page, setPage] = useState(1);
  const [docPage, setDocPage] = useState<DocPage | null>(null);
  const [summary, setSummary] = useState<PageSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const [fontPct, setFontPct] = useState<number>(readFontPct());
  const stackByFont = fontPct >= 175;
  const [readOnFocus, setReadOnFocus] = useState<boolean>(readReadOnFocus());

  const totalPages = state?.totalPages;
  const cleanOcr = useMemo(() => formatOcr(docPage?.ocr ?? ""), [docPage?.ocr]);

  const [mode, setMode] = useState<"ocr" | "image">("ocr");

  const liveRef = useRef<HTMLDivElement | null>(null);
  const announce = useMemo(() => makeAnnouncer(liveRef), []); // ✅ ref 친화형
  const mainRegionRef = useRef<HTMLDivElement | null>(null);
  const docBodyRef = useRef<HTMLDivElement | null>(null);
  const sidePaneRef = useRef<HTMLDivElement | null>(null);
  const ocrAudioRef = useRef<HTMLAudioElement | null>(null);
  const sumAudioRef = useRef<HTMLAudioElement | null>(null);

  const { speak } = useLocalTTS();

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === A11Y_STORAGE_KEYS.font) setFontPct(readFontPct());
      if (e.key === A11Y_STORAGE_KEYS.readOnFocus)
        setReadOnFocus(readReadOnFocus());
    };
    const onFontCustom = () => setFontPct(readFontPct());
    const onReadCustom = () => setReadOnFocus(readReadOnFocus());
    const onVisible = () => {
      if (!document.hidden) {
        setFontPct(readFontPct());
        setReadOnFocus(readReadOnFocus());
      }
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("a11y:font-change", onFontCustom as EventListener);
    window.addEventListener(
      "a11y:read-on-focus-change",
      onReadCustom as EventListener
    );
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(
        "a11y:font-change",
        onFontCustom as EventListener
      );
      window.removeEventListener(
        "a11y:read-on-focus-change",
        onReadCustom as EventListener
      );
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // 데이터 로드
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!docIdNum) return;
      try {
        setLoading(true);
        const dp = await fetchDocPage(docIdNum, page);
        if (cancelled) return;
        if (!dp) {
          setDocPage(null);
          setSummary(null);
          toast.error("교안 페이지를 불러오지 못했어요.");
          announce("교안 페이지를 불러오지 못했습니다.");
          return;
        }
        setDocPage(dp);
        if (dp.pageId && dp.pageId > 0)
          setSummary(await fetchPageSummary(dp.pageId));
        else setSummary(null);

        setMode("ocr");
        announce(
          `페이지 ${dp.pageNumber}${
            totalPages ? ` / 총 ${totalPages}` : ""
          }로 이동했습니다. 본문 보기가 활성화되었습니다.`
        );
        mainRegionRef.current?.focus();
      } catch {
        if (!cancelled) {
          toast.error("데이터 로딩 중 오류가 발생했어요.");
          announce("데이터 로딩 중 오류가 발생했습니다.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // announce는 useMemo로 안정화되어 의존성에 넣어도 재실행 없음
  }, [docIdNum, page, totalPages, announce]);

  useEffect(() => {
    const t = `${state?.navTitle ?? "수업 전"} - p.${page}`;
    document.title = `캠퍼스 메이트 | ${t}`;
  }, [state?.navTitle, page]);

  useFocusTTS({
    enabled: readOnFocus,
    mode,
    page,
    docContainerRef: docBodyRef,
    sumContainerRef: sidePaneRef,
    ocrAudioRef,
    sumAudioRef,
    announce,
  });

  const canPrev = page > 1;
  const canNext = totalPages ? page < totalPages : true;

  const toggleMode = () => {
    setMode((m) => {
      const next = m === "ocr" ? "image" : "ocr";
      announce(
        next === "image"
          ? "원본 이미지 보기가 활성화되었습니다."
          : "본문 보기가 활성화되었습니다."
      );
      setTimeout(() => mainRegionRef.current?.focus(), 0);
      return next;
    });
  };

  // 강의 시작 → 라이브 페이지로 이동
  const onStartClass = () => {
    if (!docIdNum) {
      toast.error("문서가 없어 강의를 시작할 수 없어요.");
      announce("문서가 없어 강의를 시작할 수 없습니다.");
      return;
    }
    announce("강의가 시작되었습니다. 라이브 화면으로 이동합니다.");
    navigate(`/lecture/doc/${docIdNum}/live/`, {
      state: {
        docId: docIdNum,
        totalPages: totalPages ?? null,
        navTitle: state?.navTitle ?? "라이브",
        autoRecord: true,
      },
      replace: false,
    });
  };

  return (
    <Wrap aria-busy={loading}>
      <SrLive ref={liveRef} aria-live="polite" aria-atomic="true" />
      <Container>
        <Grid $stack={stackByFont}>
          <DocPane
            mode={mode}
            ocrText={cleanOcr}
            imageUrl={docPage?.image}
            ocrAudioRef={ocrAudioRef}
            docBodyRef={docBodyRef}
            mainRegionRef={mainRegionRef}
          />
          <SummaryPane
            stack={stackByFont}
            summaryText={summary?.summary}
            summaryTtsUrl={summary?.summary_tts}
            sidePaneRef={sidePaneRef}
            sumAudioRef={sumAudioRef}
          />
        </Grid>
      </Container>

      <BottomToolbar
        canPrev={canPrev}
        canNext={canNext}
        page={page}
        totalPages={totalPages}
        mode={mode}
        onPrev={() => setPage((p) => Math.max(1, p - 1))}
        onNext={() => setPage((p) => p + 1)}
        onToggleMode={toggleMode}
        onStart={onStartClass}
        speak={speak}
        onGoTo={(n) => setPage(n)}
      />
    </Wrap>
  );
}
