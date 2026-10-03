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
  const onCaptionRef = useRef(onCaption);
  onCaptionRef.current = onCaption;

  useEffect(() => {
    const win = window as RecognitionWindow;
    setSupported(Boolean(win.SpeechRecognition ?? win.webkitSpeechRecognition));
    return () => { wantedRef.current = false; recognitionRef.current?.stop(); onCaptionRef.current(""); };
  }, []);

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
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result) continue;
        const text = result[0].transcript.trim();
        if (result.isFinal) {
          onCaptionRef.current(text);
          const reference = spokenReference(text);
          if (reference && reference !== lastRef.current) {
            lastRef.current = reference;
            setStatus(`Looking up ${reference}…`);
            void lookupSpokenVerse(reference).then((verse) => {
              if (verse) { setCandidate(verse); setStatus(""); }
              else setStatus(`Could not find ${reference}. Try the verse search below.`);
            }).catch(() => setStatus("Scripture lookup is unavailable. Try the verse search below."));
          }
        } else interim = text;
      }
      if (interim) onCaptionRef.current(interim);
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
      <Button type="button" variant={listening ? "default" : "outline"} onClick={toggle} disabled={!supported}>
        {listening ? <MicOff /> : <Mic />} {listening ? "Stop captions" : "Start captions"}
      </Button>
    </div>
    {!supported ? <p className="text-xs text-muted-foreground">Speech recognition is unavailable in this browser. Try Chrome or Edge, or search verses manually below.</p> :
      <p className="text-xs text-muted-foreground">Captions follow your voice. Say a reference such as “John chapter three verse sixteen” to review the verse before showing it.</p>}
    {status && <p role="status" className="text-xs text-muted-foreground">{status}</p>}
    {candidate && <div className="space-y-2 rounded-md border border-primary bg-secondary p-3" role="status">
      <p className="text-sm font-semibold">{candidate.reference}</p>
      <p className="font-verse-heavy text-sm">{candidate.text}</p>
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={() => { void onApprove({ ...candidate, imageUrl: imageUrl ?? mist.url }).then(() => setCandidate(null)); }}><Check /> Show verse</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setCandidate(null)}><X /> Dismiss</Button>
      </div>
    </div>}
  </section>;
}