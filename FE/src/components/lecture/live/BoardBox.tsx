// src/components/lecture/live/BoardBox.tsx
import { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import {
  fetchBoards,
  uploadBoardImage,
  patchBoardText,
  deleteBoard,
  type BoardItem,
} from "@apis/lecture/board.api";

import { PANEL_FIXED_H_LIVE } from "@pages/class/pre/styles";
import { fonts } from "@styles/fonts";
import {
  useDocLiveSync,
  type BoardEventCreatedOrUpdated,
  type BoardEventDataBase,
} from "src/hooks/useDocLiveSync";
import MarkdownText from "./MarkdownText";

type Props = {
  docId: number; // WS 채널 키
  pageId: number; // API 호출 키
  assetBase?: string; // 정적 파일 prefix (ex. VITE_BASE_URL)
  token?: string | null; // access token (없으면 localStorage)
  wsBase?: string; // ws(s)://HOST[:PORT] (없으면 VITE_BASE_URL → ws 변환)
};

export default function BoardBox({
  docId,
  pageId,
  assetBase = "",
  token,
  wsBase,
}: Props) {
  const [list, setList] = useState<BoardItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const toUrl = (p: string | null) =>
    !p ? "" : p.startsWith("http") ? p : `${assetBase}${p}`;

  const accessToken = token ?? localStorage.getItem("access") ?? null;
  const wsServer =
    wsBase ??
    (import.meta.env.VITE_BASE_URL as string).replace(/^http(s?)/, "ws$1");

  // 초기 로드
  const load = async () => {
    setLoading(true);
    setError(null);
    const res = await fetchBoards(pageId);
    if (!res) setError("판서 목록을 불러오지 못했습니다.");
    setList(res?.boards ?? []);
    setLoading(false);
  };
  useEffect(() => {
    load(); /* eslint-disable-line react-hooks/exhaustive-deps */
  }, [pageId]);

  // 실시간: 수신 처리
  const { sendBoardEvent } = useDocLiveSync({
    serverBase: wsServer,
    docId,
    token: accessToken,
    onBoardCreated: (data: BoardEventCreatedOrUpdated) => {
      setList((prev) =>
        prev.some((b) => b.boardId === data.boardId)
          ? prev
          : [{ ...data }, ...prev]
      );
    },
    onBoardUpdated: (data: BoardEventCreatedOrUpdated) => {
      setList((prev) =>
        prev.map((b) =>
          b.boardId === data.boardId
            ? { ...b, text: data.text, image: data.image }
            : b
        )
      );
    },
    onBoardDeleted: (data: BoardEventDataBase) => {
      setList((prev) => prev.filter((b) => b.boardId !== data.boardId));
      if (editingId === data.boardId) setEditingId(null);
    },
  });

  // 업로드
  const handleFiles = async (file?: File) => {
    if (!file) return;
    try {
      setUploading(true);
      setError(null);
      const created = await uploadBoardImage(pageId, file);
      setList((prev) => [created, ...prev]);

      // 서버로도 created 전송 (선택)
      sendBoardEvent("created", {
        boardId: created.boardId,
        image: created.image,
        text: created.text,
      });
    } catch (e) {
      console.error(e);
      setError("업로드에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onDrop: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    handleFiles(file);
  };

  // 수정 저장
  const saveText = async (boardId: number, nextText: string) => {
    try {
      setSavingId(boardId);
      const updated = await patchBoardText(boardId, nextText);
      setList((prev) =>
        prev.map((b) => (b.boardId === boardId ? { ...b, ...updated } : b))
      );
      setEditingId(null);

      // 서버로도 updated 전송
      sendBoardEvent("updated", {
        boardId,
        image: updated.image ?? null,
        text: updated.text ?? null,
      });
    } catch (e) {
      console.error(e);
      setError("설명 저장에 실패했습니다.");
    } finally {
      setSavingId(null);
    }
  };

  // 삭제
  const remove = async (boardId: number) => {
    if (!confirm("이 판서를 삭제할까요?")) return;
    try {
      setDeletingId(boardId);
      await deleteBoard(boardId);
      setList((prev) => prev.filter((b) => b.boardId !== boardId));
      if (editingId === boardId) setEditingId(null);

      // 서버로도 deleted 전송
      sendBoardEvent("deleted", { boardId });
    } catch (e) {
      console.error(e);
      setError("삭제에 실패했습니다.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Wrap>
      <Uploader
        role="button"
        tabIndex={0}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        aria-label="사진 업로드 또는 드래그 앤 드롭"
      >
        <span>{uploading ? "업로드 중" : "사진 업로드"}</span>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={(e) => handleFiles(e.target.files?.[0] ?? undefined)}
          hidden
        />
      </Uploader>

      {loading && <Hint>불러오는 중…</Hint>}
      {error && <Error role="alert">{error}</Error>}

      <List role="list" aria-busy={loading || uploading}>
        {list.map((b) => {
          const isEditing = editingId === b.boardId;
          const isSaving = savingId === b.boardId;
          const isDeleting = deletingId === b.boardId;

          return (
            <Item key={b.boardId} role="listitem">
              {b.image && <Thumb src={toUrl(b.image)} alt="판서 이미지" />}

              <Row>
                <Actions>
                  {isEditing ? (
                    <>
                      <Button
                        type="button"
                        aria-label="설명 저장"
                        disabled={isSaving}
                        onClick={() => {
                          const textarea = document.getElementById(
                            `edit-${b.boardId}`
                          ) as HTMLTextAreaElement | null;
                          if (textarea)
                            saveText(b.boardId, textarea.value.trim());
                        }}
                      >
                        {isSaving ? "저장중…" : "저장"}
                      </Button>
                      <Button
                        type="button"
                        aria-label="편집 취소"
                        onClick={() => setEditingId(null)}
                        $variant="ghost"
                      >
                        취소
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        type="button"
                        onClick={() => setEditingId(b.boardId)}
                      >
                        수정
                      </Button>
                      <DangerBtn
                        type="button"
                        onClick={() => remove(b.boardId)}
                        disabled={isDeleting}
                        aria-label="판서 삭제"
                      >
                        {isDeleting ? "삭제중…" : "삭제"}
                      </DangerBtn>
                    </>
                  )}
                </Actions>
              </Row>

              {isEditing ? (
                <EditArea
                  id={`edit-${b.boardId}`}
                  defaultValue={b.text ?? ""}
                  placeholder="이미지에 대한 설명이나 텍스트를 입력하세요"
                />
              ) : b.text ? (
                <MarkdownText>{b.text}</MarkdownText>
              ) : (
                <EmptyLine>설명이 없습니다.</EmptyLine>
              )}
            </Item>
          );
        })}

        {!loading && list.length === 0 && (
          <Empty>아직 업로드된 판서가 없어요.</Empty>
        )}
      </List>
    </Wrap>
  );
}

/* styles */
const Wrap = styled.section`
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: ${PANEL_FIXED_H_LIVE};
`;
const Uploader = styled.div`
  border: 2px dashed #d1d5db;
  border-radius: 12px;
  padding: 12px;
  text-align: center;
  cursor: pointer;
  user-select: none;
  &:hover {
    background: var(--c-white);
  }
`;
const Hint = styled.p`
  margin: 0;
  color: #6b7280;
  font-size: 0.875rem;
`;
const Error = styled.p`
  margin: 0;
  color: #b91c1c;
  font-size: 0.875rem;
`;
const List = styled.div`
  display: grid;
  gap: 12px;
  overflow: auto;
`;
const Item = styled.article`
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 10px;
`;
const Thumb = styled.img`
  display: block;
  width: 100%;
  max-height: 220px;
  object-fit: cover;
  border-radius: 8px;
  margin-bottom: 8px;
`;
const Row = styled.div`
  display: flex;
  justify-content: flex-end;
  align-items: center;
  margin-bottom: 8px;
`;
const Actions = styled.div`
  display: inline-flex;
  gap: 8px;
`;
const Button = styled.button<{ $variant?: "ghost" }>`
  border: 2px solid #2563eb;
  color: #2563eb;
  background: #fff;
  border-radius: 999px;
  ${fonts.regular20};
  padding: 4px 10px;
  cursor: pointer;
  ${({ $variant }) =>
    $variant === "ghost" && `border-color:#e5e7eb;color:#374151;`}
`;
const DangerBtn = styled(Button)`
  border-color: #ef4444;
  color: #ef4444;
`;
const EditArea = styled.textarea`
  width: 100%;
  min-height: 150px;
  resize: vertical;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 8px;
  ${fonts.regular17};
  &:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.2);
  }
`;
const EmptyLine = styled.p`
  margin: 0;
  color: #6b7280;
`;
const Empty = styled.p`
  margin: 0;
  color: #6b7280;
  font-size: 0.9rem;
  text-align: center;
`;
