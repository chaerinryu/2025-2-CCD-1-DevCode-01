import { useCallback, useEffect, useRef, useState } from "react";

/* Safari 호환 */
declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

export type RecorderState = "idle" | "recording" | "paused" | "stopped";

export interface AudioRecorder {
  state: RecorderState;
  seconds: number;
  start: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => Promise<Blob>; // WAV Blob (16kHz)
}

/** 서버 STT가 16kHz를 요구하므로 타깃 샘플레이트를 16000으로 고정 */
const TARGET_SR = 16000;

export function useAudioRecorder(): AudioRecorder {
  const [state, setState] = useState<RecorderState>("idle");
  const [seconds, setSeconds] = useState(0);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const procRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);

  const buffersRef = useRef<Float32Array[]>([]);
  const pausedRef = useRef(false);
  const sampleRateRef = useRef(44100);

  const tickStart = () => {
    if (timerRef.current) return;
    timerRef.current = window.setInterval(() => {
      setSeconds((s) => s + 1);
    }, 1000);
  };
  const tickStop = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const start = useCallback(async () => {
    if (state === "recording") return;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const AudioCtx = window.AudioContext || window.webkitAudioContext!;
    const ctx = new AudioCtx();
    const source = ctx.createMediaStreamSource(stream);

    const proc = ctx.createScriptProcessor(4096, 1, 1); // mono
    sampleRateRef.current = ctx.sampleRate; // 보통 48000 혹은 44100

    buffersRef.current = [];
    pausedRef.current = false;

    proc.onaudioprocess = (e) => {
      if (pausedRef.current) return;
      const input = e.inputBuffer.getChannelData(0);
      // 복사 저장 (원본 버퍼는 재사용됨)
      buffersRef.current.push(new Float32Array(input));
    };

    source.connect(proc);
    proc.connect(ctx.destination); // (일부 브라우저 필요)

    audioCtxRef.current = ctx;
    sourceRef.current = source;
    procRef.current = proc;
    streamRef.current = stream;

    setSeconds(0);
    setState("recording");
    tickStart();
  }, [state]);

  const pause = useCallback(() => {
    if (state !== "recording") return;
    pausedRef.current = true;
    tickStop();
    setState("paused");
  }, [state]);

  const resume = useCallback(() => {
    if (state !== "paused") return;
    pausedRef.current = false;
    tickStart();
    setState("recording");
  }, [state]);

  const stop = useCallback(async (): Promise<Blob> => {
    if (state === "idle" || state === "stopped") {
      return new Blob([], { type: "audio/wav" });
    }
    pausedRef.current = true;
    tickStop();

    try {
      procRef.current?.disconnect();
      sourceRef.current?.disconnect();
      await audioCtxRef.current?.close();
    } catch {
      /* noop */
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());

    const wavBlob = encodeWAV(
      buffersRef.current,
      sampleRateRef.current,
      TARGET_SR
    );

    // 정리
    audioCtxRef.current = null;
    sourceRef.current = null;
    procRef.current = null;
    streamRef.current = null;
    buffersRef.current = [];

    setState("stopped");
    return wavBlob;
  }, [state]);

  useEffect(() => {
    return () => {
      try {
        procRef.current?.disconnect();
        sourceRef.current?.disconnect();
        audioCtxRef.current?.close();
      } catch {
        /* noop */
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      tickStop();
    };
  }, []);

  return { state, seconds, start, pause, resume, stop };
}

/* ---------- WAV 인코딩 with 리샘플링(선형 보간) ---------- */
function encodeWAV(
  buffers: Float32Array[],
  inSampleRate: number,
  targetSampleRate: number
): Blob {
  // 1) Float32Array[] -> Float32Array 하나로 병합
  let length = 0;
  for (const b of buffers) length += b.length;
  const mono = new Float32Array(length);
  let offset = 0;
  for (const b of buffers) {
    mono.set(b, offset);
    offset += b.length;
  }

  // 2) 필요 시 리샘플링 (예: 48000 -> 16000)
  const resampled =
    inSampleRate === targetSampleRate
      ? mono
      : resampleFloat32(mono, inSampleRate, targetSampleRate);

  // 3) Float32 -> PCM16 + WAV 헤더
  const bytesPerSample = 2;
  const numChannels = 1;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = targetSampleRate * blockAlign;
  const dataSize = resampled.length * bytesPerSample;

  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (dv: DataView, off: number, s: string) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i));
  };

  // RIFF
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  // fmt
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, targetSampleRate, true); // ✅ 16000으로 기록
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample
  // data
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  // samples
  let pos = 44;
  for (let i = 0; i < resampled.length; i++, pos += 2) {
    const s = Math.max(-1, Math.min(1, resampled[i]));
    view.setInt16(pos, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Blob([view], { type: "audio/wav" });
}

/** 선형 보간 리샘플러 (모노) */
function resampleFloat32(
  input: Float32Array,
  inRate: number,
  outRate: number
): Float32Array {
  const ratio = outRate / inRate;
  const newLen = Math.round(input.length * ratio);
  const out = new Float32Array(newLen);

  let idxFloat = 0;
  for (let i = 0; i < newLen; i++) {
    const idx = idxFloat | 0;
    const frac = idxFloat - idx;

    const s0 = input[idx] ?? 0;
    const s1 = input[idx + 1] ?? s0; // 마지막 샘플 보간 보호

    out[i] = s0 + (s1 - s0) * frac;
    idxFloat += 1 / ratio;
  }
  return out;
}
