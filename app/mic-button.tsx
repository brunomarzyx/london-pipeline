"use client";
import { useRef, useState } from "react";
import { toWav16k } from "../lib/wav";

export default function MicButton({ onText }: { onText: (t: string) => void }) {
  const [rec, setRec] = useState(false);
  const [busy, setBusy] = useState(false);
  const mr = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  async function toggle() {
    if (rec) {
      mr.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((t) => MediaRecorder.isTypeSupported(t));
      const m = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      m.ondataavailable = (e) => {
        if (e.data.size) chunks.current.push(e.data);
      };
      m.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRec(false);
        setBusy(true);
        try {
          const fd = new FormData();
          const wav = await toWav16k(new Blob(chunks.current, { type: m.mimeType || "audio/webm" }));
          fd.append("audio", wav, "ask.wav");
          const res = await fetch("/api/transcribe", { method: "POST", body: fd });
          const j = (await res.json()) as { text?: string };
          if (j.text) onText(j.text);
        } catch {
          /* leave the typed text untouched */
        }
        setBusy(false);
      };
      mr.current = m;
      m.start();
      setRec(true);
    } catch {
      /* mic unavailable: do nothing */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      title={rec ? "Stop and transcribe" : "Speak instead of typing"}
      aria-label={rec ? "Stop recording" : "Record voice question"}
      className={`rounded-full border px-2 py-1 text-sm ${rec ? "border-red-400 bg-red-50" : "border-slate-300"}`}
    >
      {busy ? "…" : rec ? "● rec" : "🎤"}
    </button>
  );
}
