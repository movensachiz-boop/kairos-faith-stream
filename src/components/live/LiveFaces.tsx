import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

// Small face thumbnails shared over realtime so everyone in the live sees who joined.
type FaceSignal =
  | { type: "face"; id: string; name: string; data: string }
  | { type: "leave"; id: string }
  | { type: "settings"; allowed: boolean };

type Face = { name: string; data: string; at: number };

export function LiveFaces({ streamId, isHost = false, allowed: hostAllowed = true }: {
  streamId: string;
  isHost?: boolean;
  allowed?: boolean;
}) {
  const me = useRef(crypto.randomUUID()).current;
  const [faces, setFaces] = useState<Record<string, Face>>({});
  const [allowed, setAllowed] = useState(isHost ? hostAllowed : false);
  const [sharing, setSharing] = useState(false);
  const [myFace, setMyFace] = useState("");
  const [error, setError] = useState("");
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const nameRef = useRef("Guest");

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      const meta = data.user?.user_metadata ?? {};
      nameRef.current = (meta["display_name"] as string | undefined) || data.user?.email?.split("@")[0] || "Guest";
    });
  }, []);

  useEffect(() => { if (isHost) setAllowed(hostAllowed); }, [isHost, hostAllowed]);

  useEffect(() => {
    const channel = supabase.channel(`live-faces:${streamId}`, { config: { broadcast: { self: false } } });
    channelRef.current = channel;
    channel
      .on("broadcast", { event: "face" }, ({ payload }) => {
        const msg = payload as FaceSignal;
        if (msg.type === "face") setFaces((f) => ({ ...f, [msg.id]: { name: msg.name, data: msg.data, at: Date.now() } }));
        else if (msg.type === "leave") setFaces((f) => { const n = { ...f }; delete n[msg.id]; return n; });
        else if (msg.type === "settings" && !isHost) setAllowed(msg.allowed);
      })
      .subscribe();
    const sweep = window.setInterval(() => {
      setFaces((f) => Object.fromEntries(Object.entries(f).filter(([, v]) => Date.now() - v.at < 8000)));
    }, 3000);
    return () => {
      window.clearInterval(sweep);
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [streamId, isHost]);

  // The host repeats the setting so late joiners learn whether faces are allowed.
  useEffect(() => {
    if (!isHost) return;
    const send = () => void channelRef.current?.send({ type: "broadcast", event: "face", payload: { type: "settings", allowed: hostAllowed } satisfies FaceSignal });
    send();
    const timer = window.setInterval(send, 3000);
    return () => window.clearInterval(timer);
  }, [isHost, hostAllowed]);

  useEffect(() => { if (!allowed && sharing) stopSharing(); }, [allowed]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => stopSharing(), []); // eslint-disable-line react-hooks/exhaustive-deps

  async function startSharing() {
    try {
      setError("");
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 320 }, height: { ideal: 240 } }, audio: false });
      streamRef.current = media;
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.srcObject = media;
      await video.play().catch(() => {});
      const canvas = document.createElement("canvas");
      canvas.width = 160;
      canvas.height = 160;
      const ctx = canvas.getContext("2d");
      const tick = () => {
        if (!ctx || !video.videoWidth) return;
        const side = Math.min(video.videoWidth, video.videoHeight);
        ctx.drawImage(video, (video.videoWidth - side) / 2, (video.videoHeight - side) / 2, side, side, 0, 0, 160, 160);
        const data = canvas.toDataURL("image/jpeg", 0.5);
        setMyFace(data);
        void channelRef.current?.send({ type: "broadcast", event: "face", payload: { type: "face", id: me, name: nameRef.current, data } satisfies FaceSignal });
      };
      tick();
      timerRef.current = window.setInterval(tick, 1000);
      setSharing(true);
    } catch {
      setError("Camera access was not allowed.");
    }
  }

  function stopSharing() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setMyFace("");
    setSharing(false);
    void channelRef.current?.send({ type: "broadcast", event: "face", payload: { type: "leave", id: me } satisfies FaceSignal });
  }

  const list = Object.entries(faces);
  if (!allowed && !isHost) return null;

  return (
    <aside className="space-y-3 rounded-md border border-border bg-background p-3" aria-label="People with cameras on">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Users className="size-4 text-primary" /> People here ({list.length + (sharing ? 1 : 0)})</h3>
        {allowed ? (
          <Button type="button" size="sm" variant={sharing ? "outline" : "default"} onClick={() => (sharing ? stopSharing() : void startSharing())}>
            {sharing ? <CameraOff /> : <Camera />} {sharing ? "Hide my face" : "Show my face"}
          </Button>
        ) : null}
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {!allowed ? <p className="text-xs text-muted-foreground">Faces are turned off for this live.</p> : null}
      {list.length === 0 && !sharing && allowed ? <p className="text-xs text-muted-foreground">No one has turned on their camera yet.</p> : null}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-2">
        {sharing && myFace ? <FaceTile name="You" data={myFace} /> : null}
        {list.map(([id, f]) => <FaceTile key={id} name={f.name} data={f.data} />)}
      </div>
    </aside>
  );
}

function FaceTile({ name, data }: { name: string; data: string }) {
  return (
    <figure className="overflow-hidden rounded-md border border-border bg-secondary">
      <img src={data} alt={name} className="aspect-square w-full object-cover" />
      <figcaption className="truncate px-1.5 py-1 text-[11px] font-medium">{name}</figcaption>
    </figure>
  );
}
