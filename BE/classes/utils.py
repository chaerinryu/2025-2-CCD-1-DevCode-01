from google.cloud import speech
from google.cloud import texttospeech
import boto3
from django.conf import settings
import io, os
import uuid
from datetime import datetime, timedelta
from mutagen import File

from users.models import User

def speech_to_text(audio_file) -> str:
    """
    업로드된 음성 파일을 Google Speech-to-Text로 변환
    짧은 음성(1초 미만) 또는 변환 결과가 없을 경우 예외 처리
    """

    client = speech.SpeechClient()

    # 1️⃣ 메모리에서 파일 내용 바로 읽기
    content = audio_file.read()

    if len(content) < 10000:  # 대략 1초 이하 (10KB 미만)
        raise ValueError("음성 파일이 너무 짧습니다. 1초 이상 길이의 파일을 업로드해주세요.")


    # 2️⃣ 확장자에 따라 인코딩 설정
    filename = audio_file.name.lower()
    if filename.endswith(".mp3"):
        encoding = speech.RecognitionConfig.AudioEncoding.MP3
        sample_rate = 16000
    elif filename.endswith(".wav"):
        encoding = speech.RecognitionConfig.AudioEncoding.LINEAR16
        sample_rate = 16000
    else:
        raise ValueError("지원하지 않는 오디오 형식입니다. (mp3 또는 wav만 가능)")

    # 3️⃣ Google STT 요청
    audio = speech.RecognitionAudio(content=content)

    config = speech.RecognitionConfig(
        encoding=encoding,
        sample_rate_hertz=sample_rate,
        language_code="ko-KR",
        model="default",
        use_enhanced=True,
        enable_automatic_punctuation=True,
    )

    response = client.recognize(config=config, audio=audio)

    # 4️⃣ 결과 텍스트 추출
    if not response.results:
        raise ValueError("음성 인식 결과가 없습니다. 음성이 너무 짧거나 인식되지 않았습니다.")
    
    transcript = response.results[0].alternatives[0].transcript.strip()

    if len(transcript) == 0:
        raise ValueError("인식된 텍스트가 비어 있습니다.")

    return transcript

def text_to_speech(text: str, user: User, s3_folder: str = "tts/") -> str:
    
    if not text or text.strip() == "":
        raise ValueError("TTS 변환할 텍스트가 비어 있습니다.")
    
    voice = (user.voice or "여성")
    rate = (user.rate or "보통")

    # 1️⃣ Google TTS 클라이언트 생성
    client = texttospeech.TextToSpeechClient()

    synthesis_input = texttospeech.SynthesisInput(text=text)
    
    voice_map = {
        "여성": "ko-KR-Neural2-A",
        "남성": "ko-KR-Neural2-C",
    }
    name = voice_map.get(voice)
    
    voice_config = texttospeech.VoiceSelectionParams(
        language_code="ko-KR",
        name=name,
    )

    rate_map = {"느림": 0.8, "보통": 1.0, "빠름": 1.25}
    speaking_rate = rate_map.get(rate)

    audio_config = texttospeech.AudioConfig(
        audio_encoding=texttospeech.AudioEncoding.MP3,
        speaking_rate=speaking_rate,
    )

    # 2️⃣ TTS 변환
    response = client.synthesize_speech(
        input=synthesis_input,
        voice=voice_config,
        audio_config=audio_config
    )

    if not response.audio_content:
        raise ValueError("TTS 변환에 실패했습니다. 응답이 비어 있습니다.")
    

    # 3️⃣ S3 업로드 (메모리 버퍼 사용)
    s3 = boto3.client(
        's3',
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        region_name='ap-northeast-2'
    )

    bucket_name = settings.AWS_BUCKET_NAME
    filename = f"{uuid.uuid4()}.mp3"
    s3_key = f"{s3_folder}{filename}"

    # BytesIO로 메모리 내에서 직접 업로드
    s3.upload_fileobj(
        io.BytesIO(response.audio_content),
        bucket_name,
        s3_key,
        ExtraArgs={'ContentType': 'audio/mpeg'}
    )

    s3_url = f"{settings.AWS_S3_BASE_URL}/{s3_key}"

    return s3_url

def text_to_speech_local(text: str, voice: str, rate: str) -> str:
    """
    Google TTS 변환 후 로컬에만 MP3 저장 (S3 업로드 없음)
    """
    if not text or text.strip() == "":
        raise ValueError("TTS 변환할 텍스트가 비어 있습니다.")

    # 1️⃣ Google TTS 클라이언트 생성
    client = texttospeech.TextToSpeechClient()

    synthesis_input = texttospeech.SynthesisInput(text=text)

    voice_map = {
        "여성": "ko-KR-Neural2-A",
        "남성": "ko-KR-Neural2-C",
    }
    name = voice_map.get(voice)
    
    voice_config = texttospeech.VoiceSelectionParams(
        language_code="ko-KR",
        name=name,
    )

    rate_map = {"느림": 0.8, "보통": 1.0, "빠름": 1.25}
    speaking_rate = rate_map.get(rate)

    audio_config = texttospeech.AudioConfig(
        audio_encoding=texttospeech.AudioEncoding.MP3,
        speaking_rate=speaking_rate,
    )

    # 2️⃣ TTS 변환
    response = client.synthesize_speech(
        input=synthesis_input,
        voice=voice_config,
        audio_config=audio_config
    )

    if not response.audio_content:
        raise ValueError("TTS 변환에 실패했습니다. 응답이 비어 있습니다.")

    # 3️⃣ 로컬에만 저장
    local_dir = os.path.join(settings.BASE_DIR, "tts_local")
    os.makedirs(local_dir, exist_ok=True)

    base_name = text.strip().replace(" ", "")[:6] or "tts"
    gender_label = "(여성)" if "Neural2-A" in voice_config.name else "(남성)"
    safe_name = f"{base_name}{gender_label}.mp3"

    # 🚫 파일명에 파일 시스템 불가 문자 제거
    safe_name = "".join(c for c in safe_name if c.isalnum() or c in "()._")

    local_path = os.path.join(local_dir, safe_name)

    with open(local_path, "wb") as out:
        out.write(response.audio_content)

    return local_path

def time_to_seconds(hhmmss: str) -> float:
    try:
        t = datetime.strptime(hhmmss, "%H:%M:%S")
        return t.hour * 3600 + t.minute * 60 + t.second
    except ValueError:
        raise ValueError("시간 형식이 잘못되었습니다. (예: 00:12:45)")
    
def get_duration(audio):
    audio.seek(0)
    audio_obj = File(audio)

    if not audio_obj or not hasattr(audio_obj, "info") or not hasattr(audio_obj.info, "length"):
        raise ValueError("오디오 파일의 길이를 계산할 수 없습니다.")

    duration_sec = round(audio_obj.info.length, 2)
    duration = str(timedelta(seconds=int(duration_sec)))

    return duration_sec, duration