import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, CheckCircle2, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { joinAsRemoteCamera, type CameraSlot, type CameraStatus } from "@/lib/broadcast";

type CameraSearch = { slot: number | undefined; token: string | undefined };

export const Route = createFileRoute("/camera/$id")({
  validateSearch: (search: Record<string, unknown>): CameraSearch => ({
    slot: Number(search["slot"]) || undefined,
    token: typeof search["token"] === "string" ? search["token"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Connect camera — KAIROS APP" },
      { name: "description", content: "Connect this phone as a video camera for a KAIROS live broadcast." },
      { property: "og:title", content: "Connect camera — KAIROS APP" },
      { property: "og:description", content: "Use this secure link to join a KAIROS live broadcast as a camera." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RemoteCameraPage,
});

function RemoteCameraPage() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const slot = search.slot === 2 || search.slot === 3 ? (search.slot as CameraSlot) : null;
  const token = search.token ?? "";
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const leaveRef = useRef<(() => void) | null>(null);
  const rotateCleanupRef = useRef<(() => void) | null>(null);
  const [status, setStatus] = useState<CameraStatus | "ready" | "ended">("ready");
  const [error, setError] = useState("");

  useEffect(
    () => () => {
      leaveRef.current?.();
      rotateCleanupRef.current?.();
      rotateCleanupRef.current = null;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  async function connect() {
    if (!slot || !token) {
      setError("This camera link is incomplete. Scan the QR code again.");
      return;
    }
    try {
      setError("");
      leaveRef.current?.();
      leaveRef.current = null;
      rotateCleanupRef.current?.();
      rotateCleanupRef.current = null;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setStatus("connecting");
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 }, aspectRatio: { ideal: 16 / 9 } },
        audio: false,
      });
      streamRef.current = media;
      // Phones held upright deliver a portrait picture even when landscape is
      // requested. Rotate it into a fixed 1280x720 landscape stream so the
      // main broadcast always receives a wide picture.
      const track = media.getVideoTracks()[0];
      const settings = track?.getSettings() ?? {};
      let outgoing = media;
      if ((settings.height ?? 0) > (settings.width ?? 0)) {
        const probe = document.createElement("video");
        probe.muted = true;
        probe.playsInline = true;
        probe.srcObject = media;
        await probe.play().catch(() => {});
        const srcW = probe.videoWidth || settings.width || 720;
        const srcH = probe.videoHeight || settings.height || 1280;
        const canvas = document.createElement("canvas");
        canvas.width = 1280;
        canvas.height = 720;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const draw = () => {
            // Rotate the portrait frame 90° so it fills the landscape canvas.
            ctx.save();
            ctx.translate(1280 / 2, 720 / 2);
            ctx.rotate(Math.PI / 2);
            const scale = Math.max(720 / srcW, 1280 / srcH);
            ctx.drawImage(probe, (-srcW * scale) / 2, (-srcH * scale) / 2, srcW * scale, srcH * scale);
            ctx.restore();
          };
          const timer = window.setInterval(draw, 1000 / 30);
          draw();
          rotateCleanupRef.current = () => {
            window.clearInterval(timer);
            probe.srcObject = null;
          };
          outgoing = canvas.captureStream(30);
        }
      }
      if (videoRef.current) {
        videoRef.current.srcObject = outgoing;
        void videoRef.current.play().catch(() => {});
      }
      leaveRef.current = joinAsRemoteCamera(id, slot, token, outgoing, setStatus);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Camera access was not allowed.");
      setStatus("disconnected");
    }
  }

  function disconnect() {
    leaveRef.current?.();
    leaveRef.current = null;
    rotateCleanupRef.current?.();
    rotateCleanupRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStatus("disconnected");
  }

  const connected = status === "connected";

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col px-4 py-6">
      <div className="mb-5 flex items-center gap-3 border-b border-border pb-4">
        <span className="grid size-9 place-items-center rounded-md bg-primary font-display font-bold text-primary-foreground">
          K
        </span>
        <div>
          <p className="font-display text-sm font-bold">KAIROS LIVE</p>
          <p className="text-xs text-muted-foreground">Camera {slot ?? "—"} · video only</p>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-md border border-border bg-secondary">
        <video ref={videoRef} muted playsInline className="aspect-video w-full object-cover" />
        {status === "ready" || status === "disconnected" ? (
          <div className="absolute inset-0 grid place-items-center text-muted-foreground">
            <CameraOff className="size-8" />
          </div>
        ) : null}
        {connected ? (
          <div className="absolute left-3 top-3 flex items-center gap-2 rounded-md bg-destructive px-2 py-1 text-xs font-semibold text-destructive-foreground">
            <Radio className="size-3" /> CONNECTED
          </div>
        ) : null}
      </div>

      <div className="mt-5 border-b border-border pb-5">
        <div className="flex items-start gap-3">
          {connected ? <CheckCircle2 className="mt-0.5 size-5 text-primary" /> : <Camera className="mt-0.5 size-5" />}
          <div>
            <h1 className="font-display text-xl font-semibold">Camera {slot ?? "link"}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {status === "ready"
                ? "This phone will send video only. Camera 1 remains the sound source."
                : status === "connecting"
                    ? "Connecting to the main broadcast… Keep this phone open while it connects."
                  : connected
                    ? "Your video is ready. The broadcaster can select this shot."
                    : status === "ended"
                      ? "The live broadcast has ended."
                      : "Camera disconnected. Tap Connect camera to try again."}
            </p>
          </div>
        </div>
        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      </div>

      <div className="mt-5 flex gap-2">
        {status === "ready" || status === "disconnected" ? (
          <Button onClick={connect} className="flex-1">
            <Camera /> Connect camera
          </Button>
        ) : status !== "ended" ? (
          <Button onClick={disconnect} variant="outline" className="flex-1">
            Disconnect
          </Button>
        ) : (
          <Button asChild variant="outline" className="flex-1">
            <Link to="/live">Return to Live</Link>
          </Button>
        )}
      </div>
    </main>
  );
}