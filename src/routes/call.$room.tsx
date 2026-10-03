import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Copy, Mic, MicOff, PhoneOff, Video, VideoOff } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { joinCall, type Peer } from "@/lib/call";

export const Route = createFileRoute("/call/$room")({
  head: () => ({
    meta: [
      { title: "In a call — KAIROS APP" },
      { name: "description", content: "Join this KAIROS video call." },
      { property: "og:title", content: "Join my video call — KAIROS APP" },
      { property: "og:description", content: "Tap to join a face-to-face video call on KAIROS APP." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CallRoom,
});

function Tile({ stream, name, muted }: { stream: MediaStream | null; name: string; muted?: boolean }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (ref.current && stream) {
      ref.current.srcObject = stream;
      ref.current.play().catch(() => {});
    }
  }, [stream]);
  return (
    <div className="relative overflow-hidden rounded-md border border-border bg-secondary">
      <video ref={ref} autoPlay playsInline muted={muted} className="aspect-video w-full object-cover" />
      {!stream ? (
        <div className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">Connecting…</div>
      ) : null}
      <span className="absolute bottom-2 left-2 rounded-md bg-background px-2 py-0.5 text-xs font-medium">{name}</span>
    </div>
  );
}

function CallRoom() {
  const { room } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [local, setLocal] = useState<MediaStream | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [error, setError] = useState("");
  const leaveRef = useRef<(() => void) | null>(null);
  const name = (user?.user_metadata?.["display_name"] as string | undefined) ?? user?.email?.split("@")[0] ?? "Guest";

  useEffect(() => {
    let media: MediaStream | null = null;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user" }, audio: { echoCancellation: true, noiseSuppression: true } })
      .then((m) => {
        if (cancelled) { m.getTracks().forEach((t) => t.stop()); return; }
        media = m;
        setLocal(m);
        leaveRef.current = joinCall(room, name, m, setPeers);
      })
      .catch(() => setError("Camera or microphone access was not allowed."));
    return () => {
      cancelled = true;
      leaveRef.current?.();
      leaveRef.current = null;
      media?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  function toggleMic() {
    local?.getAudioTracks().forEach((t) => (t.enabled = !micOn));
    setMicOn(!micOn);
  }
  function toggleCam() {
    local?.getVideoTracks().forEach((t) => (t.enabled = !camOn));
    setCamOn(!camOn);
  }
  async function copyLink() {
    await navigator.clipboard.writeText(`${window.location.origin}/call/${room}`).catch(() => {});
    toast.success("Call link copied — send it to who you want to call.");
  }
  function hangUp() {
    navigate({ to: "/call" });
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
          <h1 className="font-display text-lg font-semibold">Video call</h1>
          <span className="text-xs text-muted-foreground">
            {peers.length === 0 ? "Waiting for others to join…" : `${peers.length + 1} in call`}
          </span>
          <Button variant="outline" size="sm" className="ml-auto" onClick={copyLink}>
            <Copy /> Invite
          </Button>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className={`grid gap-3 ${peers.length > 0 ? "sm:grid-cols-2" : ""}`}>
          <Tile stream={local} name={`${name} (you)`} muted />
          {peers.map((p) => (
            <Tile key={p.id} stream={p.stream} name={p.name} />
          ))}
        </div>
        <div className="flex justify-center gap-3">
          <Button variant="outline" onClick={toggleMic} aria-label="Microphone">
            {micOn ? <Mic /> : <MicOff />}
          </Button>
          <Button variant="outline" onClick={toggleCam} aria-label="Camera">
            {camOn ? <Video /> : <VideoOff />}
          </Button>
          <Button variant="destructive" onClick={hangUp}>
            <PhoneOff /> Leave
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
