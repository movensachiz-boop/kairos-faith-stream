// Small-audience WebRTC broadcasting and QR-paired remote cameras.
import { supabase } from "@/integrations/supabase/client";
import { createVerseStage, type VerseSlide } from "@/lib/verse-stage";

const ICE: RTCConfiguration = {
  iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }],
};

type ViewerSignal =
  | { type: "join"; from: string }
  | { type: "host-ready" }
  | { type: "offer"; to: string; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; from: string; sdp: RTCSessionDescriptionInit }
  | { type: "ice"; to?: string; from?: string; candidate: RTCIceCandidateInit }
  | { type: "end" };

export type CameraSlot = 2 | 3;
export type CameraStatus = "waiting" | "connecting" | "connected" | "disconnected";

type CameraSignal =
  | { type: "camera-join"; from: string; slot: CameraSlot; token: string }
  | { type: "camera-offer"; to: string; slot: CameraSlot; sdp: RTCSessionDescriptionInit }
  | { type: "camera-answer"; from: string; slot: CameraSlot; sdp: RTCSessionDescriptionInit }
  | { type: "camera-ice"; to?: string; from?: string; slot: CameraSlot; candidate: RTCIceCandidateInit }
  | { type: "camera-leave"; from: string; slot: CameraSlot }
  | { type: "broadcast-end" };

function viewerChannel(streamId: string) {
  return supabase.channel(`live:${streamId}`, { config: { broadcast: { self: false } } });
}

function cameraChannel(streamId: string) {
  return supabase.channel(`live-cameras:${streamId}`, { config: { broadcast: { self: false } } });
}

// Carry gathered network candidates in the offer/answer too, so pairing does not
// depend on realtime trickle messages arriving in exactly the right order.
function gatheredDescription(pc: RTCPeerConnection): Promise<RTCSessionDescriptionInit> {
  return new Promise((resolve) => {
    const finish = () => {
      pc.removeEventListener("icegatheringstatechange", check);
      clearTimeout(timeout);
      resolve(pc.localDescription ?? { type: "offer", sdp: "" });
    };
    const check = () => { if (pc.iceGatheringState === "complete") finish(); };
    const timeout = setTimeout(finish, 7000);
    pc.addEventListener("icegatheringstatechange", check);
    check();
  });
}

export type HostController = {
  stop: () => void;
  useCamera: (slot: 1 | CameraSlot) => Promise<void>;
  showVerse: (slide: VerseSlide | null) => Promise<void>;
  verseCanvas: HTMLCanvasElement;
  finishRecording: () => Promise<Blob | null>;
  setLogo: (logo: HTMLImageElement | null, position: LogoPosition, size: number) => void;
  setCaption: (text: string) => void;
};

export type LogoPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export function startHost(
  streamId: string,
  media: MediaStream,
  tokens: Record<CameraSlot, string>,
  onViewers: (count: number) => void,
  onCamera: (slot: CameraSlot, stream: MediaStream | null, status: CameraStatus) => void,
): HostController {
  const viewers = new Map<string, RTCPeerConnection>();
  const cameraPeers = new Map<CameraSlot, { id: string; pc: RTCPeerConnection; started: number }>();
  const cameraIce = new Map<CameraSlot, RTCIceCandidateInit[]>();
  const remoteCameras = new Map<CameraSlot, MediaStream>();
  const mainVideo = media.getVideoTracks()[0] ?? null;
  let activeVideo = mainVideo;
  let activeSlot: 1 | CameraSlot = 1;
  let verseVisible = false;
  const verseStage = createVerseStage();
  // One fixed 16:9 output for viewers and recordings, even if a phone supplies portrait video.
  const recCanvas = document.createElement("canvas");
  recCanvas.width = 1280;
  recCanvas.height = 720;
  const recCtx = recCanvas.getContext("2d");
  const outputStream = recCanvas.captureStream(30);
  const outputTrack = outputStream.getVideoTracks()[0] ?? null;
  const recVideo = document.createElement("video");
  recVideo.muted = true;
  recVideo.playsInline = true;
  let recTrack: MediaStreamTrack | null = null;
  let logoImage: HTMLImageElement | null = null;
  let logoPosition: LogoPosition = "top-right";
  let logoSize = 16;
  let caption = "";
  const viewersChannel = viewerChannel(streamId);
  const camerasChannel = cameraChannel(streamId);
  const sendViewer = (payload: ViewerSignal) =>
    viewersChannel.send({ type: "broadcast", event: "signal", payload });
  const sendCamera = (payload: CameraSignal) =>
    camerasChannel.send({ type: "broadcast", event: "camera-signal", payload });

  function updateViewerCount() {
    onViewers([...viewers.values()].filter((peer) => peer.connectionState === "connected").length);
  }

  async function addViewer(id: string) {
    viewers.get(id)?.close();
    const pc = new RTCPeerConnection(ICE);
    viewers.set(id, pc);
    if (outputTrack) pc.addTrack(outputTrack, outputStream);
    media.getAudioTracks().forEach((track) => pc.addTrack(track, media));
    pc.onicecandidate = (event) => {
      if (event.candidate) sendViewer({ type: "ice", to: id, candidate: event.candidate.toJSON() });
    };
    pc.onconnectionstatechange = () => {
      if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
        viewers.delete(id);
        pc.close();
      }
      updateViewerCount();
    };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await sendViewer({ type: "offer", to: id, sdp: offer });
  }

  async function addRemoteCamera(id: string, slot: CameraSlot, token: string) {
    if (tokens[slot] !== token) return;
    const previous = cameraPeers.get(slot);
    if (previous?.id === id && Date.now() - previous.started < 25000 && !["failed", "closed", "disconnected"].includes(previous.pc.connectionState)) return;
    if (previous) {
      previous.pc.onconnectionstatechange = null;
      previous.pc.close();
    }
    remoteCameras.delete(slot);
    cameraIce.delete(slot);
    onCamera(slot, null, "connecting");
    const pc = new RTCPeerConnection(ICE);
    cameraPeers.set(slot, { id, pc, started: Date.now() });
    pc.addTransceiver("video", { direction: "recvonly" });
    pc.ontrack = (event) => {
      if (cameraPeers.get(slot)?.pc !== pc) return;
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      remoteCameras.set(slot, stream);
      // ontrack can fire before ICE connects; wait until frames can actually arrive.
      onCamera(slot, stream, pc.connectionState === "connected" ? "connected" : "connecting");
      event.track.onunmute = () => {
        if (cameraPeers.get(slot)?.pc === pc && pc.connectionState === "connected") onCamera(slot, stream, "connected");
      };
      event.track.onended = () => { if (cameraPeers.get(slot)?.pc === pc) disconnectCamera(slot); };
    };
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendCamera({ type: "camera-ice", to: id, slot, candidate: event.candidate.toJSON() });
      }
    };
    pc.onconnectionstatechange = () => {
      if (cameraPeers.get(slot)?.pc === pc && pc.connectionState === "connected") {
        onCamera(slot, remoteCameras.get(slot) ?? null, "connected");
      }
      if (cameraPeers.get(slot)?.pc === pc && ["failed", "closed", "disconnected"].includes(pc.connectionState)) disconnectCamera(slot);
    };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const sdp = await gatheredDescription(pc);
    if (cameraPeers.get(slot)?.pc === pc) await sendCamera({ type: "camera-offer", to: id, slot, sdp });
  }

  function disconnectCamera(slot: CameraSlot) {
    const entry = cameraPeers.get(slot);
    if (entry) entry.pc.onconnectionstatechange = null;
    entry?.pc.close();
    cameraPeers.delete(slot);
    remoteCameras.delete(slot);
    cameraIce.delete(slot);
    onCamera(slot, null, "disconnected");
    if (activeSlot === slot) void useCamera(1);
  }

  async function useCamera(slot: 1 | CameraSlot) {
    const nextTrack = slot === 1 ? mainVideo : remoteCameras.get(slot)?.getVideoTracks()[0];
    if (!nextTrack) return;
    activeVideo = verseVisible ? (verseStage.track ?? nextTrack) : nextTrack;
    activeSlot = slot;
  }

  async function showVerse(slide: VerseSlide | null) {
    if (slide) await verseStage.setSlide(slide);
    verseVisible = !!slide;
    activeVideo = verseVisible ? (verseStage.track ?? mainVideo) : ((activeSlot === 1 ? mainVideo : remoteCameras.get(activeSlot)?.getVideoTracks()[0]) ?? mainVideo);
    if (!slide) await verseStage.setSlide(null);
  }

  viewersChannel
    .on("broadcast", { event: "signal" }, async ({ payload }) => {
      const message = payload as ViewerSignal;
      if (message.type === "join") await addViewer(message.from);
      else if (message.type === "answer") await viewers.get(message.from)?.setRemoteDescription(message.sdp);
      else if (message.type === "ice" && message.from) {
        await viewers.get(message.from)?.addIceCandidate(message.candidate).catch(() => {});
      }
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") void sendViewer({ type: "host-ready" });
    });

  camerasChannel
    .on("broadcast", { event: "camera-signal" }, async ({ payload }) => {
      const message = payload as CameraSignal;
      if (message.type === "camera-join") {
        await addRemoteCamera(message.from, message.slot, message.token);
      } else if (message.type === "camera-answer") {
        const camera = cameraPeers.get(message.slot);
        if (camera?.id === message.from) {
          await camera.pc.setRemoteDescription(message.sdp);
          for (const candidate of cameraIce.get(message.slot) ?? []) await camera.pc.addIceCandidate(candidate).catch(() => {});
          cameraIce.delete(message.slot);
        }
      } else if (message.type === "camera-ice" && message.from) {
        const camera = cameraPeers.get(message.slot);
        if (camera?.id === message.from) {
          if (camera.pc.remoteDescription) await camera.pc.addIceCandidate(message.candidate).catch(() => {});
          else cameraIce.set(message.slot, [...(cameraIce.get(message.slot) ?? []), message.candidate]);
        }
      } else if (message.type === "camera-leave") {
        const camera = cameraPeers.get(message.slot);
        if (camera?.id === message.from) disconnectCamera(message.slot);
      }
    })
    .subscribe();

  // Draw the current camera or scripture into the same landscape output viewers receive.
  const drawTimer = window.setInterval(() => {
    if (activeVideo !== recTrack) {
      recTrack = activeVideo;
      recVideo.srcObject = activeVideo ? new MediaStream([activeVideo]) : null;
      void recVideo.play().catch(() => {});
    }
    if (!recCtx) return;
    recCtx.fillStyle = "#000";
    recCtx.fillRect(0, 0, 1280, 720);
    const w = recVideo.videoWidth, h = recVideo.videoHeight;
    if (w && h) {
      const scale = Math.min(1280 / w, 720 / h);
      recCtx.drawImage(recVideo, (1280 - w * scale) / 2, (720 - h * scale) / 2, w * scale, h * scale);
    }
    if (logoImage?.complete && logoImage.naturalWidth) {
      const width = 1280 * Math.max(8, Math.min(30, logoSize)) / 100;
      const height = width * logoImage.naturalHeight / logoImage.naturalWidth;
      const gap = 30;
      const x = logoPosition.endsWith("right") ? 1280 - width - gap : gap;
      const y = logoPosition.startsWith("bottom") ? 720 - height - gap : gap;
      recCtx.drawImage(logoImage, x, y, width, height);
    }
    if (caption.trim() && !verseVisible) {
      recCtx.font = '700 38px "Mont Verse Heavy", sans-serif';
      const text = caption.trim().slice(0, 160);
      const maxWidth = 1060;
      const metrics = recCtx.measureText(text);
      const width = Math.min(maxWidth, metrics.width + 56);
      recCtx.fillStyle = "rgba(0, 0, 0, 0.82)";
      recCtx.fillRect((1280 - width) / 2, 620, width, 66);
      recCtx.fillStyle = "#fff";
      recCtx.textAlign = "center";
      recCtx.fillText(text, 640, 665, maxWidth - 30);
      recCtx.textAlign = "start";
    }
  }, 1000 / 30);
  const chunks: Blob[] = [];
  let recorder: MediaRecorder | null = null;
  try {
    const recStream = new MediaStream([...outputStream.getVideoTracks(), ...media.getAudioTracks()]);
    const mimeType = ["video/mp4", "video/webm;codecs=vp9,opus", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t));
    recorder = new MediaRecorder(recStream, mimeType ? { mimeType } : undefined);
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.start(1000);
  } catch {
    recorder = null;
  }

  function finishRecording(): Promise<Blob | null> {
    window.clearInterval(drawTimer);
    return new Promise((resolve) => {
      if (!recorder || recorder.state === "inactive") {
        resolve(chunks.length ? new Blob(chunks, { type: chunks[0]?.type || "video/webm" }) : null);
        return;
      }
      const r = recorder;
      r.onstop = () => resolve(chunks.length ? new Blob(chunks, { type: r.mimeType || "video/webm" }) : null);
      r.stop();
    });
  }

  function stop() {
    verseStage.stop();
    window.clearInterval(drawTimer);
    outputStream.getTracks().forEach((track) => track.stop());
    void sendViewer({ type: "end" });
    void sendCamera({ type: "broadcast-end" });
    viewers.forEach((peer) => peer.close());
    cameraPeers.forEach(({ pc }) => pc.close());
    viewers.clear();
    cameraPeers.clear();
    remoteCameras.clear();
    window.setTimeout(() => {
      void supabase.removeChannel(viewersChannel);
      void supabase.removeChannel(camerasChannel);
    }, 300);
  }

  function setLogo(logo: HTMLImageElement | null, position: LogoPosition, size: number) {
    logoImage = logo;
    logoPosition = position;
    logoSize = size;
  }

  function setCaption(text: string) { caption = text; }

  return { stop, useCamera, showVerse, verseCanvas: verseStage.canvas, finishRecording, setLogo, setCaption };
}

export function joinAsViewer(streamId: string, onStream: (stream: MediaStream) => void, onEnd: () => void) {
  const me = crypto.randomUUID();
  let pc: RTCPeerConnection | null = null;
  const channel = viewerChannel(streamId);
  const send = (payload: ViewerSignal) => channel.send({ type: "broadcast", event: "signal", payload });

  channel
    .on("broadcast", { event: "signal" }, async ({ payload }) => {
      const message = payload as ViewerSignal;
      if (message.type === "host-ready") void send({ type: "join", from: me });
      else if (message.type === "end") onEnd();
      else if (message.type === "offer" && message.to === me) {
        pc?.close();
        pc = new RTCPeerConnection(ICE);
        pc.ontrack = (event) => {
          const stream = event.streams[0];
          if (stream) onStream(stream);
        };
        pc.onicecandidate = (event) => {
          if (event.candidate) void send({ type: "ice", from: me, candidate: event.candidate.toJSON() });
        };
        await pc.setRemoteDescription(message.sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await send({ type: "answer", from: me, sdp: answer });
      } else if (message.type === "ice" && message.to === me) {
        await pc?.addIceCandidate(message.candidate).catch(() => {});
      }
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") void send({ type: "join", from: me });
    });

  return () => {
    pc?.close();
    void supabase.removeChannel(channel);
  };
}

export function joinAsRemoteCamera(
  streamId: string,
  slot: CameraSlot,
  token: string,
  media: MediaStream,
  onStatus: (status: CameraStatus | "ended") => void,
) {
  const me = `camera-${slot}-${crypto.randomUUID()}`;
  let pc: RTCPeerConnection | null = null;
  let closed = false;
  let connected = false;
  let joinTimer: ReturnType<typeof setInterval> | null = null;
  let connectionTimer: ReturnType<typeof setTimeout> | null = null;
  const pendingIce: RTCIceCandidateInit[] = [];
  const channel = cameraChannel(streamId);
  const send = (payload: CameraSignal) => channel.send({ type: "broadcast", event: "camera-signal", payload });
  const requestJoin = () => {
    if (!closed && !connected) void send({ type: "camera-join", from: me, slot, token });
  };

  channel
    .on("broadcast", { event: "camera-signal" }, async ({ payload }) => {
      const message = payload as CameraSignal;
      if (message.type === "broadcast-end") {
        if (joinTimer) clearInterval(joinTimer);
        if (connectionTimer) clearTimeout(connectionTimer);
        onStatus("ended");
      } else if (message.type === "camera-offer" && message.to === me && message.slot === slot) {
        pc?.close();
        pc = new RTCPeerConnection(ICE);
        const peer = pc;
        const track = media.getVideoTracks()[0];
        if (!track) return;
        peer.addTrack(track, media);
        peer.onicecandidate = (event) => {
          if (event.candidate) {
            void send({ type: "camera-ice", from: me, slot, candidate: event.candidate.toJSON() });
          }
        };
        peer.onconnectionstatechange = () => {
          if (closed || peer !== pc) return;
          if (peer.connectionState === "connected") {
            connected = true;
            if (joinTimer) clearInterval(joinTimer);
            if (connectionTimer) clearTimeout(connectionTimer);
            onStatus("connected");
          } else if (["failed", "closed", "disconnected"].includes(peer.connectionState)) {
            connected = false;
            onStatus("disconnected");
            if (peer.connectionState === "failed") requestJoin();
          }
        };
        await peer.setRemoteDescription(message.sdp);
        for (const candidate of pendingIce.splice(0)) await peer.addIceCandidate(candidate).catch(() => {});
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        const sdp = await gatheredDescription(peer);
        if (closed || peer !== pc) return;
        await send({ type: "camera-answer", from: me, slot, sdp });
        if (connectionTimer) clearTimeout(connectionTimer);
        connectionTimer = setTimeout(() => {
          if (closed || peer !== pc || connected) return;
          peer.close();
          onStatus("connecting");
          requestJoin();
        }, 20000);
      } else if (message.type === "camera-ice" && message.to === me && message.slot === slot) {
        if (pc?.remoteDescription) await pc.addIceCandidate(message.candidate).catch(() => {});
        else pendingIce.push(message.candidate);
      }
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        onStatus("connecting");
        requestJoin();
        joinTimer = setInterval(requestJoin, 2000);
      }
    });

  return () => {
    closed = true;
    if (joinTimer) clearInterval(joinTimer);
    if (connectionTimer) clearTimeout(connectionTimer);
    void send({ type: "camera-leave", from: me, slot });
    pc?.close();
    void supabase.removeChannel(channel);
  };
}