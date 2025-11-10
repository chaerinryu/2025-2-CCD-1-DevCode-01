from django.shortcuts import render
from django.http import JsonResponse
from classes.serializers import SpeechCreateSerializer
from classes.models import Bookmark, Note, Speech
from classes.utils import get_duration, speech_to_text, text_to_speech, text_to_speech_local, time_to_seconds
from lecture_docs.models import Page
from rest_framework.response import Response
from rest_framework import status, generics, permissions
import traceback
from rest_framework.views import APIView

"""
1. 음성 파일(STT 변환)
2. 변환된 텍스트(TTS 변환)
3. DB 저장
4. speechId, stt, tts, page 반환
"""
class SpeechView(generics.CreateAPIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pageId):
        try:
            user = request.user
            # ✅ 1️⃣ pageId로 Page 객체 조회
            page = Page.objects.get(id=pageId)
        except Page.DoesNotExist:
            return JsonResponse({"error": "해당 페이지를 찾을 수 없습니다."}, status=404)

        serializer = SpeechCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            audio = serializer.validated_data['audio']
            end_time = serializer.validated_data['timestamp']

            end_time_sec = time_to_seconds(end_time)
                
            # 1️⃣ STT 변환
            stt_text = speech_to_text(audio)
            if not stt_text or stt_text.strip() == "":
                return JsonResponse({"error": "변환된 텍스트가 비어 있습니다."}, status=400)

            # 2️⃣ TTS 변환 + S3 업로드
            s3_url = text_to_speech(stt_text, user, s3_folder="tts/speech/")

            duration_sec, duration = get_duration(audio)

            # 3️⃣ DB 저장
            speech = Speech.objects.create(
                stt=stt_text,
                stt_tts=s3_url,
                page=page,
                end_time=end_time,
                end_time_sec=end_time_sec,
                duration=duration,
                duration_sec=duration_sec,
            )

            # 성공 응답
            return JsonResponse({
                "speech_id": speech.id,
                "stt": stt_text,
                "stt_tts": s3_url,
                "page": page.page_number,
                "end_time": end_time,
                "duration": duration,
            }, status=200)
        
        except Exception as e:
            traceback.print_exc()  # 서버 로그 출력용
            return JsonResponse(
                {"error": f"TTS 변환 중 오류가 발생했습니다: {str(e)}"},
                status=500
            )
        
class TTSTestView(APIView):
    """
    TTS 변환 로컬 저장 테스트용 API
    """
    def post(self, request):
        try:
            test_text = request.data["text"]
            voice = request.data["voice"]
            rate = request.data["rate"]

            # TTS 변환 (로컬에만 저장)
            local_path = text_to_speech_local(test_text, voice, rate)

            return JsonResponse({
                "message": "TTS 변환 성공",
                "test_text": test_text,
                "local_path": local_path
            }, status=200)

        except Exception as e:
            traceback.print_exc()
            return JsonResponse(
                {"error": f"TTS 테스트 중 오류 발생: {str(e)}"},
                status=500
            )
        
class BookmarkView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pageId):
        try:
            page = Page.objects.get(id=pageId)
        except Page.DoesNotExist:
            return JsonResponse({"error": "해당 페이지를 찾을 수 없습니다."}, status=404)\
            
        timestamp = request.data['timestamp']

        if not timestamp:
            return JsonResponse({"error": "타임스탬프가 제공되지 않았습니다."}, status=400)

        timestamp_sec = time_to_seconds(timestamp)

        bookmark = Bookmark.objects.create(
            page=page,
            user=request.user,
            timestamp=timestamp,
            timestamp_sec=timestamp_sec
        )

        return JsonResponse({
            "bookmark_id": bookmark.id,
            "page": page.page_number,
            "timestamp": timestamp
        }, status=200)
    
class BookmarkDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, bookmarkId):
        try:
            bookmark = Bookmark.objects.get(id=bookmarkId)
        except Bookmark.DoesNotExist:
            return JsonResponse({"error": "해당 북마크를 찾을 수 없습니다."}, status=404)
        
        speeches = Speech.objects.filter(page__doc=bookmark.page.doc)

        matched_speech = next(
            (
                s for s in speeches
                if(s.end_time_sec - s.duration_sec) <= bookmark.timestamp_sec <= s.end_time_sec
            ), None
        )

        if not matched_speech:
            return JsonResponse({"error": "해당 북마크에 매칭되는 음성 파일이 없습니다."}, status=404)
        

        start_time_sec = matched_speech.end_time_sec - matched_speech.duration_sec
        relative_time = round(bookmark.timestamp_sec - start_time_sec, 2)
        
        return JsonResponse({
            "stt_tts": matched_speech.stt_tts,
            "relative_time": relative_time
        }, status=200)
    
    def delete(self, request, bookmarkId):
        try:
            bookmark = Bookmark.objects.get(id=bookmarkId)
        except Bookmark.DoesNotExist:
            return JsonResponse({"error": "해당 북마크를 찾을 수 없습니다."}, status=404)
        
        bookmark.delete()
        return JsonResponse({"message": "북마크가 삭제되었습니다."}, status=204)
    
class NoteView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pageId):
        """페이지별 개인 노트 작성"""
        try:
            page = Page.objects.get(id=pageId)
        except Page.DoesNotExist:
            return JsonResponse({"error": "해당 페이지를 찾을 수 없습니다."}, status=404)
        
        user = request.user
        content = request.data.get("content")

        # ✅ 이미 해당 페이지에 본인 노트가 존재하면 작성 불가 (1페이지당 1개)
        if Note.objects.filter(page=page, user=user).exists():
            return Response({"error": "이미 이 페이지에 작성한 노트가 있습니다."}, status=status.HTTP_400_BAD_REQUEST)
        
        note_tts = text_to_speech(content, user, "tts/note/")

        note = Note.objects.create(
            page=page,
            user=user,
            content=content.strip(),
            note_tts=note_tts
        )

        return Response({
            "note_id": note.id,
            "content": note.content,
            "note_tts": note.note_tts,
        }, status=status.HTTP_201_CREATED)
    
class NoteDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, noteId):
        """개인 노트 수정"""
        note = Note.objects.filter(id=noteId).first()
        if not note:
            return Response({"error": "해당 노트를 찾을 수 없습니다."}, status=status.HTTP_404_NOT_FOUND)

        user = request.user
        if note.user != user:
            return Response({"error": "본인이 작성한 노트만 수정할 수 있습니다."},
                            status=status.HTTP_403_FORBIDDEN)

        content = request.data.get("content")
        note_tts = text_to_speech(content, user, "tts/note/")

        note.content = content.strip()
        note.note_tts = note_tts
        note.save()

        return Response({
            "note_id": note.id,
            "content": note.content,
            "note_tts": note.note_tts
        }, status=status.HTTP_200_OK)
    
