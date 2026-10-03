import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { lookupSpokenVerse, spokenReference } from "@/lib/spoken-scripture";
import type { VerseSlide } from "@/lib/verse-stage";
import mist from "@/assets/mist-and-moss.jpg.asset.json";

type SpeechResult = { isFinal: boolean; 0: { transcript: string } };
type Recognition = {
  continuous: boolean; interimResults: boolean; lang: string;
  onresult: ((event: { resultIndex: number; results: ArrayLike<SpeechResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void; stop: () => void;
};
type RecognitionWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };

export function LiveSpeechControls({ onCaption, onApprove, imageUrl }: {
  onCaption: (text: string) => void;
  onApprove: (slide: VerseSlide) => Promise<void>;
  imageUrl?: string | undefined;
}) {
  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [candidate, setCandidate] = useState<{ text: string; reference: string } | null>(null);
  const [status, setStatus] = useState("");
  const recognitionRef = useRef<Recognition | null>(null);
  const wantedRef = useRef(false);
  const lastRef = useRef("");
  const lastAtRef = useRef(0);
  const recentRef = useRef("");
  const toggleButtonRef = useRef<HTMLButtonElement | null>(null);
  const approveButtonRef = useRef<HTMLButtonElement | null>(null);
  const onCaptionRef = useRef(onCaption);
  onCaptionRef.current = onCaption;

  useEffect(() => {
    const win = window as RecognitionWindow;
    setSupported(Boolean(win.SpeechRecognition ?? win.webkitSpeechRecognition));
    return () => { wantedRef.current = false; recognitionRef.current?.stop(); onCaptionRef.current(""); };
  }, []);

  useEffect(() => {
    if (!candidate) return;
    approveButtonRef.current?.focus();
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setCandidate(null);
      toggleButtonRef.current?.focus();
    };
    window.addEventListener("keydown", dismiss);
    return () => window.removeEventListener("keydown", dismiss);
  }, [candidate]);

  function dismissCandidate() {
    setCandidate(null);
    window.setTimeout(() => toggleButtonRef.current?.focus(), 0);
  }

  async function approveCandidate() {
    if (!candidate) return;
    await onApprove({ ...candidate, imageUrl: imageUrl ?? mist.url });
    setCandidate(null);
    window.setTimeout(() => toggleButtonRef.current?.focus(), 0);
  }

  function toggle() {
    if (wantedRef.current) {
      wantedRef.current = false;
      recognitionRef.current?.stop();
      onCaption("");
      setListening(false);
      return;
    }
    const win = window as RecognitionWindow;
    const Constructor = win.SpeechRecognition ?? win.webkitSpeechRecognition;
    if (!Constructor) return;
    const recognition = new Constructor();
    recognitionRef.current = recognition;
    recognition.continuous = true;
    recognition.interimResults = true;
    // No fixed language: use the device's language so every speaker is picked up.
    recognition.lang = navigator.language || "en-US";
    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result) continue;
        const text = result[0].transcript.trim();
        if (result.isFinal) {
          onCaptionRef.current(text);
          recentRef.current = text;
        } else interim = text;
      }
      if (interim) onCaptionRef.current(interim);
      // Check every heard phrase — final or still-being-spoken — for a reference.
      const heard = `${recentRef.current} ${interim}`.trim();
      const reference = spokenReference(interim) ?? spokenReference(heard);
      if (reference && (reference !== lastRef.current || Date.now() - lastAtRef.current > 20000)) {
        lastRef.current = reference;
        lastAtRef.current = Date.now();
        setStatus(`Looking up ${reference}…`);
        void lookupSpokenVerse(reference).then((verse) => {
          if (verse) { setCandidate(verse); setStatus(""); }
          else setStatus(`Could not find ${reference}. Try the verse search below.`);
        }).catch(() => setStatus("Scripture lookup is unavailable. Try the verse search below."));
      }
    };
    recognition.onerror = ({ error }) => {
      if (error === "not-allowed" || error === "service-not-allowed") {
        wantedRef.current = false;
        setListening(false);
        setStatus("Microphone or speech recognition was blocked.");
      } else if (error !== "no-speech" && error !== "aborted") setStatus("Speech recognition paused. Try again.");
    };
    recognition.onend = () => {
      onCaptionRef.current("");
      if (wantedRef.current) {
        window.setTimeout(() => { if (wantedRef.current) { try { recognition.start(); } catch { setListening(false); } } }, 400);
      } else setListening(false);
    };
    try { recognition.start(); wantedRef.current = true; setListening(true); setStatus(""); }
    catch { setStatus("Could not start speech recognition."); }
  }

  return <section className="space-y-3 border-y border-border py-4" aria-label="Live captions and spoken Scripture">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold">Live captions & spoken Scripture</h3>
      <Button ref={toggleButtonRef} type="button" variant={listening ? "default" : "outline"} onClick={toggle} disabled={!supported}>
        {listening ? <MicOff /> : <Mic />} {listening ? "Stop captions" : "Start captions"}
      </Button>
    </div>
    {!supported ? <p className="text-xs text-muted-foreground">Speech recognition is unavailable in this browser. Try Chrome or Edge, or search verses manually below.</p> :
      <p className="text-xs text-muted-foreground">Captions follow your voice. Say a reference such as “John 3:16” or “Romans chapter 8 verse 28” to review the verse before showing it.</p>}
    {status && <p role="status" className="text-xs text-muted-foreground">{status}</p>}
    {candidate ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) dismissCandidate(); }}>
      <div className="w-full max-w-lg space-y-4 rounded-md border border-primary bg-background p-5" role="alertdialog" aria-modal="true" aria-labelledby="spoken-verse-title" aria-describedby="spoken-verse-text">
        <div>
          <p className="text-xs font-semibold text-primary">Scripture found</p>
          <h3 id="spoken-verse-title" className="mt-1 font-display text-xl font-semibold">{candidate.reference}</h3>
        </div>
        <p id="spoken-verse-text" className="font-verse-heavy text-lg leading-relaxed">{candidate.text}</p>
        <div className="grid grid-cols-2 gap-2">
          <Button ref={approveButtonRef} type="button" onClick={() => void approveCandidate()}><Check /> Show verse</Button>
          <Button type="button" variant="outline" onClick={dismissCandidate}><X /> Dismiss</Button>
        </div>
      </div>
    </div> : null}
  </section>;
}