// src/hooks/useDocLiveSync.ts
import { useCallback, useEffect, useMemo, useRef } from "react";

export type BoardEventType = "created" | "updated" | "deleted";

export interface BoardEventDataBase {
  boardId: number;
}
export interface BoardEventCreatedOrUpdated extends BoardEventDataBase {
  image: string | null;
  text: string | null;
}
export type BoardEventData = BoardEventCreatedOrUpdated | BoardEventDataBase;

export type LiveMessage =
  | { type: "PAGE_CHANGE"; page: number }
  | { type: "PING" }
  | { type: "BOARD_EVENT"; event: BoardEventType; data: BoardEventData };

export interface UseDocLiveSyncOptions {
  serverBase: string; // ws(s)://HOST[:PORT]
  docId: number;
  token: string | null | undefined;
  onRemotePage?: (page: number) => void;

  onBoardCreated?: (data: BoardEventCreatedOrUpdated) => void;
  onBoardUpdated?: (data: BoardEventCreatedOrUpdated) => void;
  onBoardDeleted?: (data: BoardEventDataBase) => void;

  totalPages?: number | null;
  announce?: (msg: string) => void;
  debug?: boolean;
}

export function useDocLiveSync({
  serverBase,
  docId,
  token,
  onRemotePage,
  onBoardCreated,
  onBoardUpdated,
  onBoardDeleted,
  totalPages,
  announce,
  debug = import.meta.env?.DEV ?? false,
}: UseDocLiveSyncOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef({ tries: 0, closedByUser: false });
  const pingTimer = useRef<number | null>(null);
  const onRemotePageRef = useRef(onRemotePage);

  const maskUrl = (u: string) => u.replace(/([?&]token=)[^&]+/i, "$1***");
  const log = (...args: unknown[]) => debug && console.log("[WS]", ...args);
  const warn = (...args: unknown[]) => debug && console.warn("[WS]", ...args);
  const error = (...args: unknown[]) => debug && console.error("[WS]", ...args);

  useEffect(() => {
    onRemotePageRef.current = onRemotePage;
  }, [onRemotePage]);

  const clamp = useCallback(
    (n: number) => {
      const min = 1;
      if (!totalPages) return Math.max(min, n);
      return Math.min(Math.max(min, n), totalPages);
    },
    [totalPages]
  );

  const url = useMemo(() => {
    if (!serverBase || !docId || !token) return null;
    const base = serverBase.replace(/\/+$/, "");
    return `${base}/ws/doc/${encodeURIComponent(
      String(docId)
    )}/?token=${encodeURIComponent(token)}`;
  }, [serverBase, docId, token]);

  const parseMessage = (msg: string): LiveMessage | null => {
    try {
      const parsed = JSON.parse(msg);
      if (isLiveMessage(parsed)) return parsed;
      return null;
    } catch {
      return null;
    }
  };

  const send = useCallback((msg: LiveMessage): boolean => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(msg));
    log("보냄:", msg);
    return true;
  }, []);

  const sendBoardEvent = useCallback(
    (event: BoardEventType, data: BoardEventData) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.warn(
          "⚠️ [WS] 아직 연결되지 않아 BOARD_EVENT를 전송하지 못했습니다.",
          { event, data }
        );
        return;
      }
      const msg: LiveMessage = { type: "BOARD_EVENT", event, data };
      ws.send(JSON.stringify(msg));
      // 송신 로그
      if (event === "created") console.log("🟢 [SEND BOARD_CREATED]", data);
      if (event === "updated") console.log("🟡 [SEND BOARD_UPDATED]", data);
      if (event === "deleted") console.log("🔴 [SEND BOARD_DELETED]", data);
    },
    []
  );

  const notifyLocalPage = useCallback(
    (page: number) => {
      // clamp는 이미 훅 내부에 있어요 (페이지 범위 보정)
      const ok = send({ type: "PAGE_CHANGE", page: clamp(page) });
      if (!ok) {
        announce?.("서버 연결이 불안정하여 페이지 동기화에 실패했습니다.");
      }
      return ok;
    },
    [send, clamp, announce]
  );

  useEffect(() => {
    if (!url) return;

    reconnectRef.current.closedByUser = false;

    const connect = () => {
      log("connecting to", maskUrl(url));
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectRef.current.tries = 0;
        log("✅ connected", maskUrl(url));
        announce?.("실시간 연결이 활성화되었습니다.");

        pingTimer.current = window.setInterval(() => {
          send({ type: "PING" });
        }, 25_000);
      };

      ws.onmessage = (event) => {
        const parsed = parseMessage(event.data);
        if (!parsed) return;

        if (parsed.type === "PAGE_CHANGE" && onRemotePageRef.current) {
          const next = clamp(parsed.page);
          onRemotePageRef.current(next);
          announce?.(`상대방이 페이지 ${next}로 이동했습니다.`);
          return;
        }

        if (parsed.type === "BOARD_EVENT") {
          switch (parsed.event) {
            case "created":
              console.log("🟢 [BOARD_CREATED]", parsed.data);
              onBoardCreated?.(parsed.data as BoardEventCreatedOrUpdated);
              break;
            case "updated":
              console.log("🟡 [BOARD_UPDATED]", parsed.data);
              onBoardUpdated?.(parsed.data as BoardEventCreatedOrUpdated);
              break;
            case "deleted":
              console.log("🔴 [BOARD_DELETED]", parsed.data);
              onBoardDeleted?.(parsed.data as BoardEventDataBase);
              break;
          }
        }
      };

      ws.onclose = (ev: CloseEvent) => {
        if (pingTimer.current) {
          clearInterval(pingTimer.current);
          pingTimer.current = null;
        }
        if (reconnectRef.current.closedByUser) return;
        const delay = Math.min(10_000, 500 * 2 ** reconnectRef.current.tries);
        reconnectRef.current.tries += 1;
        warn(`closed (${ev.code}) reconnecting in ${delay}ms`);
        setTimeout(connect, delay);
      };

      ws.onerror = (ev: Event) => {
        error("socket error", ev);
      };
    };

    connect();

    return () => {
      reconnectRef.current.closedByUser = true;
      wsRef.current?.close();
      wsRef.current = null;
      if (pingTimer.current) {
        clearInterval(pingTimer.current);
        pingTimer.current = null;
      }
    };
  }, [url, clamp, announce, send]);

  return { send, sendBoardEvent, notifyLocalPage };
}

function isLiveMessage(data: unknown): data is LiveMessage {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  if (d.type === "PING") return true;
  if (d.type === "PAGE_CHANGE" && typeof d.page === "number") return true;
  if (
    d.type === "BOARD_EVENT" &&
    typeof d.event === "string" &&
    typeof d.data === "object"
  )
    return true;
  return false;
}
