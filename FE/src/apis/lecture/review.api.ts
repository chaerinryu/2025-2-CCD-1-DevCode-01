import { getResponse } from "@apis/instance";

export type PageReview = {
  note?: {
    note_id: number;
    content: string;
    note_tts?: string;
  } | null;
  speeches?: Array<{
    speech_id: number;
    stt: string;
    stt_tts?: string;
    end_time?: string;
    duration?: string;
  }>;
  bookmarks?: Array<{
    bookmark_id: number;
    timestamp: string;
  }>;
};

export async function fetchPageReview(
  pageId: number
): Promise<PageReview | null> {
  return await getResponse<PageReview>(`/page/${pageId}/review/`);
}
