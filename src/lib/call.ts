import { supabase } from "@/integrations/supabase/client";

const ICE: RTCConfiguration = {
  iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }],
};

type Signal =
  | { type: "hello"; from: string; name: string }
  | { type: "offer"; from: string; to: string; name: string; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { type: "ice"; from: string; to: string; candidate: RTCIceCandidateInit }
  | { type: "bye"; from: string };

export type Peer = { id: string; name: string; stream: MediaStream | null };

/** Small group video call (mesh, up to ~4 people) over realtime signalling. */
export function joinCall(
  room: string,
  name: string,
  media: MediaStream,
  onPeers: (peers: Peer[]) => void,
) {
  const me = crypto.randomUUID();
  const pcs = new Map<string, RTCPeerConnection>();
  const peers = new Map<string, Peer>();
  const channel = supabase.channel(`call:${room}`, { config: { broadcast: { self: false } } });
  const emit = () => onPeers([...peers.values()]);
  const send = (payload: Signal) => channel.send({ type: "broadcast", event: "signal", payload });

  function makePc(id: string, peerName: string) {
    pcs.get(id)?.close();
    const pc = new RTCPeerConnection(ICE);
    media.getTracks().forEach((t) => pc.addTrack(t, media));
    peers.set(id, { id, name: peerName, stream: null });
    pc.ontrack = (e) => {
      peers.set(id, { id, name: peerName, stream: e.streams[0] ?? null });
      emit();
    };
    pc.onicecandidate = (e) => {
      if (e.candidate) send({ type: "ice", from: me, to: id, candidate: e.candidate.toJSON() });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") drop(id);
    };
    pcs.set(id, pc);
    emit();
    return pc;
  }

  function drop(id: string) {
    pcs.get(id)?.close();
    pcs.delete(id);
    peers.delete(id);
    emit();
  }

  channel.on("broadcast", { event: "signal" }, async ({ payload }) => {
    const s = payload as Signal;
    if (s.from === me) return;
    if (s.type === "hello") {
      const pc = makePc(s.from, s.name);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      send({ type: "offer", from: me, to: s.from, name, sdp: offer });
    } else if (s.type === "offer" && s.to === me) {
      const pc = makePc(s.from, s.name);
      await pc.setRemoteDescription(s.sdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      send({ type: "answer", from: me, to: s.from, sdp: answer });
    } else if (s.type === "answer" && s.to === me) {
      await pcs.get(s.from)?.setRemoteDescription(s.sdp);
    } else if (s.type === "ice" && s.to === me) {
      await pcs.get(s.from)?.addIceCandidate(s.candidate).catch(() => {});
    } else if (s.type === "bye") {
      drop(s.from);
    }
  });

  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") send({ type: "hello", from: me, name });
  });

  return () => {
    send({ type: "bye", from: me });
    pcs.forEach((pc) => pc.close());
    pcs.clear();
    peers.clear();
    setTimeout(() => supabase.removeChannel(channel), 200);
  };
}
