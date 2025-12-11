from django.http import JsonResponse
from lectures.permissions import IsLectureMember
from classes.tasks import run_speech, save_temp_audio
from classes.serializers import *
from classes.models import Bookmark, Note, Speech
from classes.utils import text_to_speech, text_to_speech_local, time_to_seconds
from lecture_docs.models import Page
from rest_framework.response import Response
from rest_framework import status, permissions
import traceback
from rest_framework.views import APIView



class SpeechView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsLectureMember]

    def post(self, request, pageId):
        try:
            page = Page.objects.get(id=pageId)
        except Page.DoesNotExist:
            return Response({"error": "해당 페이지를 찾을 수 없습니다."}, status=404)
        self.check_object_permissions(request, page)
        serializer = SpeechCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        audio = serializer.validated_data["audio"]
        timestamp = serializer.validated_data["timestamp"]

        end_time_sec = time_to_seconds(timestamp)

        audio_path = save_temp_audio(audio)

        speech = Speech.objects.create(
            page=page,
            user=request.user,
            end_time=timestamp,
            end_time_sec=end_time_sec
        )

        run_speech.delay(
            speech.id,
            audio_path,
            page.id,
            request.user.id,
        )

        return Response({
            "speech_id": speech.id,
            "status": "processing"
        }, status=201)

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
    permission_classes = [permissions.IsAuthenticated, IsLectureMember]

    def post(self, request, pageId):
        try:
            page = Page.objects.get(id=pageId)
        except Page.DoesNotExist:
            return JsonResponse({"error": "해당 페이지를 찾을 수 없습니다."}, status=404)
        self.check_object_permissions(request, page)    
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
    permission_classes = [permissions.IsAuthenticated, IsLectureMember]

    def get(self, request, bookmarkId):
        try:
            bookmark = Bookmark.objects.get(id=bookmarkId)
        except Bookmark.DoesNotExist:
            return JsonResponse({"error": "해당 북마크를 찾을 수 없습니다."}, status=404)
        self.check_object_permissions(request, bookmark)
        # 해당 북마크와 매칭되는 Speech 찾기
        speeches = Speech.objects.filter(page=bookmark.page, user=request.user)
        matched_speech = next(
            (
                s for s in speeches
                if (s.end_time_sec - s.duration_sec) <= bookmark.timestamp_sec <= s.end_time_sec
            ),
            None
        )

        stt_tts = matched_speech.stt_tts if matched_speech else None

        if stt_tts:
            return JsonResponse({
                "stt_tts": stt_tts,
                "relative_time": bookmark.relative_time,
                "text": bookmark.text,
            }, status=200)
        else:
            return JsonResponse({
                "error": "해당 북마크에 매칭되는 발화를 찾을 수 없습니다."
            }, status=404)
    
    def delete(self, request, bookmarkId):
        try:
            bookmark = Bookmark.objects.get(id=bookmarkId)
        except Bookmark.DoesNotExist:
            return JsonResponse({"error": "해당 북마크를 찾을 수 없습니다."}, status=404)
        self.check_object_permissions(request, bookmark)
        bookmark.delete()
        return JsonResponse({"message": "북마크가 삭제되었습니다."}, status=200)

class NoteView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsLectureMember]

    def get(self, request, pageId):
        try:
            page = Page.objects.get(id=pageId)
        except Page.DoesNotExist:
            return Response({"error": "해당 페이지를 찾을 수 없습니다."}, status=404)


        self.check_object_permissions(request, page)

        user = request.user

        note = Note.objects.filter(page=page, user=user).first()
        if not note:
            return Response({"note": None}, status=200)

        return Response(NoteSerializer(note).data, status=200)   
    
    def post(self, request, pageId):
        try:
            page = Page.objects.get(id=pageId)
        except Page.DoesNotExist:
            return Response({"error": "해당 페이지를 찾을 수 없습니다."}, status=404)
        self.check_object_permissions(request, page)
        user = request.user
        content = request.data.get("content")

        if Note.objects.filter(page=page, user=user).exists():
            return Response({"error": "이미 이 페이지에 작성한 노트가 있습니다."}, status=400)

        note = Note.objects.create(
            page=page,
            user=user,
            content=content.strip()
        )

        return Response(NoteSerializer(note).data, status=201)
    
class NoteDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsLectureMember]

    def patch(self, request, noteId):
        note = Note.objects.filter(id=noteId).first()
        if not note:
            return Response({"error": "해당 노트를 찾을 수 없습니다."}, status=404)

        if note.user != request.user:
            return Response({"error": "본인이 작성한 노트만 수정할 수 있습니다."}, status=403)
        self.check_object_permissions(request, note)
        content = request.data.get("content", "").strip()
        note.content = content

        note.save(update_fields=['content'])

        return Response(NoteSerializer(note).data, status=200)
    
class NoteTTSView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsLectureMember]

    def patch(self, request, noteId):
        note = Note.objects.filter(id=noteId).first()
        if not note:
            return Response({"error": "해당 노트를 찾을 수 없습니다."}, status=404)
        
        if note.user != request.user:
            return Response({"error": "본인이 작성한 노트만 수정할 수 있습니다."}, status=403)
        self.check_object_permissions(request, note)
        
        content = request.data.get("content", "").strip()

        # content가 비어있으면 TTS 변환하지 않음
        if not content:
            return Response({
                "note_id": note.id,
                "note_tts": None
            }, status=200)
        
        try:
            tts_url = text_to_speech(content, request.user, s3_folder="tts/notes/")
        except Exception as e:
            return Response({"error": f"TTS 오류: {e}"}, status=500)
        
        note.content = content
        note.note_tts = tts_url

        note.save(update_fields=['content', 'note_tts'])

        return Response({
            "note_id": note.id,
            "content": note.content,
            "note_tts": tts_url
        }, status=200)

