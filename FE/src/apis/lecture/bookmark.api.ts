import { postNoResponse } from "@apis/instance";

export function toHHMMSS(totalSeconds: number): string {
  const sec = Math.max(0, Math.floor(totalSeconds || 0));
  const h = String(Math.floor(sec / 3600)).padStart(2, "0");
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export function isHHMMSS(s: string): boolean {
  return /^\d{2}:\d{2}:\d{2}$/.test(s);
}

export async function postBookmarkClock(pageId: number, hhmmss: string) {
  if (!isHHMMSS(hhmmss)) {
    throw new Error(`잘못된 시간 형식입니다: ${hhmmss} (예: 00:12:45)`);
  }
  return postNoResponse(`/class/${pageId}/bookmark/`, {
    timestamp: hhmmss,
  });
}
