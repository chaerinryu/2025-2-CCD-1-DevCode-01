import { getResponse, postResponse, patchResponse } from "@apis/instance";

export type Note = {
  id: number;
  content: string;
};

export async function fetchNoteByPage(pageId: number): Promise<Note | null> {
  const data = await getResponse<Note>(`/class/${pageId}/note/`);
  return data ?? null;
}

export async function createNote(
  pageId: number,
  content: string
): Promise<Note | null> {
  return await postResponse<{ content: string }, Note>(
    `/class/${pageId}/note/`,
    { content }
  );
}

export async function updateNote(
  noteId: number,
  content: string
): Promise<Note | null> {
  return await patchResponse<{ content: string }, Note>(
    `/class/note/${noteId}/`,
    { content }
  );
}
