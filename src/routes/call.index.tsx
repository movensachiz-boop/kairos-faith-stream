import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Video } from "lucide-react";
import { AppShell, SectionCard } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/call/")({
  head: () => ({
    meta: [
      { title: "Video calls — KAIROS APP" },
      { name: "description", content: "Start a free video call with friends, prayer partners or your ministry team." },
      { property: "og:title", content: "Video calls — KAIROS APP" },
      { property: "og:description", content: "Face-to-face video calls for fellowship and prayer." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CallHome,
});

function CallHome() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");

  function start() {
    const room = crypto.randomUUID().slice(0, 8);
    navigate({ to: "/call/$room", params: { room } });
  }

  function join() {
    const raw = code.trim();
    const room = raw.includes("/call/") ? (raw.split("/call/")[1] ?? "").split(/[?#]/)[0] : raw;
    if (room) navigate({ to: "/call/$room", params: { room } });
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-lg space-y-5">
        <SectionCard title="Video call">
          <p className="mb-4 text-sm text-muted-foreground">
            Start a call and share the link. Works best for up to 4 people.
          </p>
          <Button onClick={start} className="w-full">
            <Video /> Start a new call
          </Button>
          <div className="mt-4 flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Paste a call link or code"
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <Button variant="outline" onClick={join}>Join</Button>
          </div>
        </SectionCard>
      </div>
    </AppShell>
  );
}
