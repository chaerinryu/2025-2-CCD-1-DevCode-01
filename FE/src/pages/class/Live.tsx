import { useEffect, useMemo, useRef, useState, useReducer } from "react";
import { useLocation, useParams, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import { fetchDocPage, fetchPageSummary } from "@apis/lecture/lecture.api";
import { formatOcr } from "@shared/formatOcr";

import DocPane from "src/components/lecture/pre/DocPane";
import RightTabs from "src/components/lecture/live/RightTabs";
import BottomToolbar from "src/components/lecture/pre/BottomToolBar";

import { useFocusTTS } from "src/hooks/useFocusTTS";
import { useDocLiveSync } from "src/hooks/useDocLiveSync";
import {
  A11Y_STORAGE_KEYS,
  makeAnnouncer,
  readFontPct,
  readReadOnFocus,
} from "./pre/ally";
import { Container, Grid, SrLive, Wrap } from "./pre/styles";
import { postBookmarkClock, toHHMMSS } from "@apis/lecture/bookmark.api";
import { uploadSpeechQueued } from "@apis/lecture/speech.api";
import { useAudioRecorder } from "@shared/useAudioRecorder";

type RouteParams = { courseId?: string; docId?: string };
type NavState = {
  navTitle?: string;
  totalPages?: number;
  docId?: number;
  autoRecord?: boolean;
};

/* ------------------ 녹음 세션 영속 저장 ------------------ */
type RecPersist = {
  status: "idle" | "recording" | "paused";
  startedAt?: number; // ms epoch
  accumulated: number; // 누적 sec
};
const recKey = (docId: number) => `rec:${docId}`;

const loadRec = (docId: number): RecPersist => {
  try {
    const raw = localStorage.getItem(recKey(docId));
    if (!raw) return { status: "idle", accumulated: 0 };
    const parsed = JSON.parse(raw) as RecPersist;
    return {
      status: parsed.status ?? "idle",
      startedAt:
        typeof parsed.startedAt === "number" ? parsed.startedAt : undefined,
      accumulated:
        typeof parsed.accumulated === "number" ? parsed.accumulated : 0,
    };
  } catch {
    return { status: "idle", accumulated: 0 };
  }
};
const saveRec = (docId: number, v: RecPersist) =>
  localStorage.setItem(recKey(docId), JSON.stringify(v));
const clearRec = (docId: number) => localStorage.removeItem(recKey(docId));

export default function LiveClass() {
  const params = useParams<RouteParams>();
  const { state } = useLocation() as { state?: NavState };
  const navigate = useNavigate();
  // const MIN_CHUNK_MS = 350; // 최소 조각 길이 보장 (권장: 300~500ms)
  // const DRAIN_WAIT_MS = 140; // stop 전에 버퍼 드레인 대기
  // const END_MIN_MS = 250; // 종료 직전 최소 채움 시간
  // const END_DRAIN_MS = 120;

  // useEffect(() => {
  //   // 앱 진입 시: 오프라인 보관분 재전송
  //   void drainSpeechQueue();
  //   // 종료/탭이동 대비: 비콘 등록
  //   registerSpeechBeacon();
  // }, []);

  const role = (localStorage.getItem("role") || "student") as
    | "assistant"
    | "student";

  const parsedParamId = Number(params.docId);
  const docId =
    state?.docId ?? (Number.isFinite(parsedParamId) ? parsedParamId : NaN);
  const totalPages = state?.totalPages ?? null;

  const [page, setPage] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);

  const [docPage, setDocPage] = useState<Awaited<
    ReturnType<typeof fetchDocPage>
  > | null>(null);

  const [summary, setSummary] = useState<Awaited<
    ReturnType<typeof fetchPageSummary>
  > | null>(null);

  const [fontPct, setFontPct] = useState<number>(readFontPct());
  const [readOnFocus, setReadOnFocus] = useState<boolean>(readReadOnFocus());
  const stackByFont = fontPct >= 175;

  const [mode, setMode] = useState<"ocr" | "image">(
    role === "assistant" ? "image" : "ocr"
  );

  // ------- refs -------
  const liveRef = useRef<HTMLDivElement | null>(null);
  const mainRegionRef = useRef<HTMLDivElement | null>(null);
  const docBodyRef = useRef<HTMLDivElement | null>(null);
  const sidePaneRef = useRef<HTMLDivElement | null>(null);
  const ocrAudioRef = useRef<HTMLAudioElement | null>(null);
  const sumAudioRef = useRef<HTMLAudioElement | null>(null);

  const announce = useMemo(() => makeAnnouncer(liveRef), []);
  const cleanOcr = useMemo(() => formatOcr(docPage?.ocr ?? ""), [docPage?.ocr]);

  /* ------------------ 접근성 설정 변경 이벤트 ------------------ */
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === A11Y_STORAGE_KEYS.font) setFontPct(readFontPct());
      if (e.key === A11Y_STORAGE_KEYS.readOnFocus)
        setReadOnFocus(readReadOnFocus());
    };
    const onFontCustom = () => setFontPct(readFontPct());
    const onReadCustom = () => setReadOnFocus(readReadOnFocus());

    window.addEventListener("storage", onStorage);
    window.addEventListener("a11y:font-change", onFontCustom as EventListener);
    window.addEventListener(
      "a11y:read-on-focus-change",
      onReadCustom as EventListener
    );
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
    };
  }, []);

  /* ------------------ 데이터 로딩 ------------------ */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);

        const dp = await fetchDocPage(docId!, page);
        if (cancelled) return;

        if (!dp) {
          setDocPage(null);
          setSummary(null);
          toast.error("페이지 로드 실패");
          return;
        }

        setDocPage(dp);

        if (dp.pageId) {
          const sum = await fetchPageSummary(dp.pageId);
          if (!cancelled) setSummary(sum ?? null);
        } else {
          setSummary(null);
        }

        const nextDefaultMode: "ocr" | "image" =
          role === "assistant" ? "image" : "ocr";
        setMode(nextDefaultMode);

        announce(
          `페이지 ${dp.pageNumber}${totalPages ? ` / 총 ${totalPages}` : ""}, ${
            nextDefaultMode === "ocr" ? "본문" : "원본"
          } 보기`
        );

        setTimeout(() => mainRegionRef.current?.focus(), 0);
      } catch (err) {
        if (!cancelled) {
          toast.error("데이터 로드 중 오류가 발생했습니다.");
          setDocPage(null);
          setSummary(null);
          console.log(err);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [docId, page, role, totalPages, announce]);

  /* ------------------ 포커스-자동읽기 (TTS) ------------------ */
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

  /* ------------------ 동기화 (웹소켓) ------------------ */
  const token = localStorage.getItem("access");
  const serverBase = import.meta.env.VITE_WS_BASE as string;

  const clampPage = (n: number) => {
    if (!totalPages) return Math.max(1, n);
    return Math.min(Math.max(1, n), totalPages);
  };

  const applyRemotePage = (p: number) => {
    setPage((cur) => (cur === p ? cur : p));
  };

  const { notifyLocalPage } = useDocLiveSync({
    serverBase,
    docId: Number(docId),
    token,
    onRemotePage: applyRemotePage,
    totalPages: totalPages ?? null,
    announce,
  });

  /* ------------------ 녹음 훅 ------------------ */
  const { start, stop, pause, resume } = useAudioRecorder();

  /* ------------------ 자동 시작/상태 복원 ------------------ */
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!Number.isFinite(docId)) return;
    const dId = Number(docId);
    const persisted = loadRec(dId);

    if (!startedRef.current) {
      if (state?.autoRecord || persisted.status === "recording") {
        start()
          .then(() => {
            const now = Date.now();
            saveRec(dId, {
              status: "recording",
              startedAt: now,
              accumulated: persisted.accumulated ?? 0,
            });
            announce("녹음을 시작했습니다.");
            toast.success("녹음 시작");
            rerender();
          })
          .catch(() => {
            toast.error("마이크 권한 또는 녹음 시작에 실패했어요.");
            announce("녹음을 시작하지 못했습니다. 설정을 확인해 주세요.");
          });
        startedRef.current = true;
      } else if (persisted.status === "paused") {
        saveRec(dId, { ...persisted, status: "paused", startedAt: undefined });
        rerender();
      } else {
        saveRec(dId, { status: "idle", accumulated: 0 });
        rerender();
      }
    }
  }, [docId, state?.autoRecord, start, announce, rerender]);

  /* ------------------ 중지(토글) ------------------ */
  const handlePauseToggle = () => {
    if (!Number.isFinite(docId)) return;
    const dId = Number(docId);
    const p = loadRec(dId);

    if (p.status === "recording" && p.startedAt) {
      const now = Date.now();
      const acc = p.accumulated + Math.floor((now - p.startedAt) / 1000);
      try {
        pause();
        saveRec(dId, { status: "paused", accumulated: acc });
        announce("녹음 일시 정지");
        rerender();
      } catch {
        /* ignore */
      }
    } else if (p.status === "paused") {
      try {
        resume();
        saveRec(dId, {
          status: "recording",
          startedAt: Date.now(),
          accumulated: p.accumulated,
        });
        announce("녹음 재개");
        rerender();
      } catch {
        /* ignore */
      }
    } else if (p.status === "idle") {
      start()
        .then(() => {
          saveRec(dId, {
            status: "recording",
            startedAt: Date.now(),
            accumulated: 0,
          });
          announce("녹음을 시작했습니다.");
          toast.success("녹음 시작");
          rerender();
        })
        .catch(() => {
          toast.error("마이크 권한 또는 녹음 시작에 실패했어요.");
          announce("녹음을 시작하지 못했습니다.");
        });
    }
  };

  const pauseLabel = (() => {
    if (!Number.isFinite(docId)) return "중지";
    const p = loadRec(Number(docId));
    return p.status === "paused" ? "녹음 다시 시작" : "중지";
  })();

  /* ------------------ 북마크: 논리시간 우선 ------------------ */
  const getCurrentClock = (): string => {
    const p = Number.isFinite(docId)
      ? loadRec(Number(docId))
      : { status: "idle", accumulated: 0 as number, startedAt: undefined };

    if (p.status === "recording" && p.startedAt) {
      const sec = p.accumulated + Math.floor((Date.now() - p.startedAt) / 1000);
      return toHHMMSS(sec);
    }
    if (p.status === "paused") {
      return toHHMMSS(p.accumulated);
    }
    const t1 = ocrAudioRef.current?.currentTime ?? 0;
    const t2 = sumAudioRef.current?.currentTime ?? 0;
    return toHHMMSS(Math.max(t1, t2));
  };

  const onBookmark = async () => {
    const pageId = docPage?.pageId;
    if (!pageId) {
      toast.error("이 페이지는 북마크를 저장할 수 없어요.");
      return;
    }
    const hhmmss = getCurrentClock();

    const ok = await postBookmarkClock(pageId, hhmmss);
    if (ok) {
      toast.success(`북마크 저장됨 (${hhmmss})`);
      announce(`현재 시각 ${hhmmss}에 북마크가 추가되었습니다.`);
    } else {
      toast.error("북마크 저장에 실패했어요. 네트워크를 확인해 주세요.");
      announce("북마크 저장에 실패했습니다.");
    }
  };

  /* ------------------ 페이지 전환 업로드: Blob + 끝시각만 ------------------ */
  const cuttingRef = useRef(false);

  // const getEndSec = (dId: number): number => {
  //   const p = loadRec(dId);
  //   if (p.status === "recording" && p.startedAt) {
  //     return p.accumulated + Math.floor((Date.now() - p.startedAt) / 1000);
  //   }
  //   return p.accumulated ?? 0;
  // };

  const cutAndUploadCurrentPageAsync = async (prevPageId: number | null) => {
    if (!Number.isFinite(docId) || !prevPageId) return;
    const dId = Number(docId);
    if (cuttingRef.current) return;
    cuttingRef.current = true;
    setTimeout(() => (cuttingRef.current = false), 160);

    const p = loadRec(dId);
    if (p.status !== "recording" || !p.startedAt) return;

    // 끝시각 계산
    const endSec =
      p.accumulated + Math.floor((Date.now() - p.startedAt) / 1000);
    const endHHMMSS = toHHMMSS(endSec);

    // stop()으로 Blob 확보 (빈 Blob이면 스킵)
    const blob: Blob = await stop();
    console.log("%c[Recorder.stop#cut]", "color:lightgreen;font-weight:bold", {
      type: blob.type,
      size: blob.size,
      endHHMMSS,
    });
    if (!blob || blob.size === 0) {
      // 누적만 반영 후 재시작
      saveRec(dId, {
        status: "paused",
        accumulated: endSec,
        startedAt: undefined,
      });
      await start().catch(() => {});
      saveRec(dId, {
        status: "recording",
        accumulated: endSec,
        startedAt: Date.now(),
      });
      return;
    }

    // ✅ 업로드는 큐에 넣고 바로 반환(응답 기다리지 않음)
    uploadSpeechQueued(prevPageId, blob, endHHMMSS);

    // 누적 반영 후 재시작
    saveRec(dId, {
      status: "paused",
      accumulated: endSec,
      startedAt: undefined,
    });
    await start().catch(() => {});
    saveRec(dId, {
      status: "recording",
      accumulated: endSec,
      startedAt: Date.now(),
    });
  };

  // 강의 종료
  const onEndLecture = async () => {
    try {
      if (!Number.isFinite(docId)) throw new Error("잘못된 문서 ID");
      const dId = Number(docId);
      const pageId = docPage?.pageId;
      if (!pageId) throw new Error("pageId 없음");

      // 상태 확인 후 안전하게 마지막 조각 확보(빈 Blob이면 스킵)
      let p = loadRec(dId);
      let blob: Blob | null = null;

      if (p.status === "recording" && p.startedAt) {
        await new Promise((r) => setTimeout(r, 120));
        blob = await stop();
      } else if (p.status === "paused") {
        await start().catch(() => {});
        saveRec(dId, {
          status: "recording",
          accumulated: p.accumulated,
          startedAt: Date.now(),
        });
        await new Promise((r) => setTimeout(r, 250));
        blob = await stop();
      }

      p = loadRec(dId);
      const endSec =
        p.status === "recording" && p.startedAt
          ? p.accumulated + Math.floor((Date.now() - p.startedAt) / 1000)
          : p.accumulated;
      const endHHMMSS = toHHMMSS(endSec);

      if (blob && blob.size > 0) {
        // ✅ 종료 업로드도 큐에 넣고 즉시 이동
        uploadSpeechQueued(pageId, blob, endHHMMSS);
      } else {
        console.warn("[end] empty blob → skip upload");
      }

      clearRec(dId);
      toast.success("강의를 종료합니다.");
      announce("강의 종료");
      navigate(`/lecture/doc/${docId}/post`, { replace: true });
    } catch (e) {
      console.error(e);
      toast.error("강의 종료 처리 중 오류가 발생했어요.");
      announce("강의 종료 처리 중 오류가 발생했습니다.");
    }
  };
  /* ------------------ 페이지 이동: 즉시 전환 + 비동기 업로드 ------------------ */
  const goToPage = (n: number) => {
    const next = clampPage(n);
    if (next === page) return;

    const prevPageId = docPage?.pageId ?? null;

    // 이전 페이지 조각 업로드(비동기)
    cutAndUploadCurrentPageAsync(prevPageId);

    // 페이지 전환/동기화는 즉시
    setPage(next);
    notifyLocalPage(next);
    announce(`페이지 ${next}로 이동합니다.`);
  };

  /* ------------------ 렌더링 ------------------ */
  const canPrev = page > 1;
  const canNext = totalPages ? page < totalPages : true;

  const toggleMode = () =>
    setMode((prev) => {
      const next = prev === "ocr" ? "image" : "ocr";
      announce(next === "image" ? "원본 보기" : "본문 보기");
      setTimeout(() => mainRegionRef.current?.focus(), 0);
      return next;
    });

  return (
    <Wrap aria-busy={loading} aria-describedby="live-status">
      <SrLive
        id="live-status"
        ref={liveRef}
        aria-live="polite"
        aria-atomic="true"
      />

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

          <RightTabs
            stack={stackByFont}
            activeInitial="memo"
            role={role}
            summary={{
              text: summary?.summary ?? "",
              ttsUrl: summary?.summary_tts ?? "",
              sumAudioRef,
              sidePaneRef,
            }}
            memo={{
              docId: Number.isFinite(docId) ? (docId as number) : 0,
              pageId: docPage?.pageId ?? null,
              pageNumber: page,
            }}
            board={{
              docId: Number.isFinite(docId) ? (docId as number) : 0,
              page,
              pageId: docPage?.pageId ?? null,
            }}
          />
        </Grid>
      </Container>

      <BottomToolbar
        canPrev={canPrev}
        canNext={canNext}
        page={page}
        totalPages={totalPages ?? undefined}
        mode={mode}
        onPrev={() => void goToPage(page - 1)}
        onNext={() => void goToPage(page + 1)}
        onToggleMode={toggleMode}
        onPause={handlePauseToggle}
        onBookmark={onBookmark}
        onEnd={onEndLecture}
        onGoTo={(n) => void goToPage(n)}
        pauseLabel={pauseLabel}
      />
    </Wrap>
  );
}
