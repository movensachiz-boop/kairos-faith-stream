import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell, SectionCard } from "@/components/layout/AppShell";
import { ministriesQuery } from "@/lib/kairos";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/create")({
  head: () => ({
    meta: [
      { title: "Create — KAIROS APP" },
      { name: "description", content: "Share a word, a sermon, a testimony or a prayer request." },
      { property: "og:title", content: "Create — KAIROS APP" },
      { property: "og:description", content: "Publish Christian content to the KAIROS community." },
    ],
  }),
  component: CreatePage,
});

const kinds = ["text", "sermon", "testimony", "video"] as const;

function CreatePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const ministries = useQuery(ministriesQuery());

  const [tab, setTab] = useState<"post" | "prayer">("post");
  const [kind, setKind] = useState<(typeof kinds)[number]>("text");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [scripture, setScripture] = useState("");
  const [ministryId, setMinistryId] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    if (tab === "post") {
      const { error } = await supabase.from("posts").insert({
        author_id: user.id,
        ministry_id: ministryId || null,
        kind,
        title: title || null,
        body: body || null,
        scripture_ref: scripture || null,
      });
      setBusy(false);
      if (error) return toast.error(error.message);
      toast.success("Published to your feed.");
      queryClient.invalidateQueries({ queryKey: ["feed"] });
    } else {
      const { error } = await supabase.from("prayer_requests").insert({
        author_id: user.id,
        ministry_id: ministryId || null,
        body,
        is_anonymous: anonymous,
      });
      setBusy(false);
      if (error) return toast.error(error.message);
      toast.success("Prayer request shared.");
      queryClient.invalidateQueries({ queryKey: ["prayers"] });
    }
    navigate({ to: "/" });
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-5">
        <SectionCard title="Create" icon="➕">
          <div className="mb-4 flex gap-2">
            {(["post", "prayer"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 rounded-xl py-2 text-xs font-semibold capitalize ${
                  tab === t ? "bg-gold text-ink" : "glass text-muted-foreground"
                }`}
              >
                {t === "post" ? "Post / Sermon" : "Prayer request"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-3">
            {tab === "post" ? (
              <>
                <div className="flex flex-wrap gap-2">
                  {kinds.map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setKind(k)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize ${
                        kind === k ? "bg-foreground/15" : "glass text-muted-foreground"
                      }`}
                    >
                      {k}
                    </button>
                  ))}
                </div>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Title"
                  className="glass w-full rounded-xl px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
                />
              </>
            ) : null}

            <textarea
              required
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              placeholder={tab === "post" ? "Share the word God gave you…" : "What can the community pray with you about?"}
              className="glass w-full rounded-xl px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
            />

            {tab === "post" ? (
              <input
                value={scripture}
                onChange={(e) => setScripture(e.target.value)}
                placeholder="Scripture reference (e.g. Psalm 46:10)"
                className="glass w-full rounded-xl px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
              />
            ) : (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
                Post anonymously
              </label>
            )}

            <select
              value={ministryId}
              onChange={(e) => setMinistryId(e.target.value)}
              className="glass w-full rounded-xl bg-card px-4 py-3 text-sm outline-none"
            >
              <option value="">No ministry (personal)</option>
              {(ministries.data ?? []).map((m: any) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>

            <button
              disabled={busy}
              className="brand-mark w-full rounded-xl py-3 text-sm font-semibold text-ink disabled:opacity-60"
            >
              {busy ? "Publishing…" : "Publish"}
            </button>
          </form>
        </SectionCard>

        <SectionCard title="Video recording" icon="🎥">
          <p className="text-sm text-muted-foreground">
            In-app video recording with background music, voice balancing, noise removal and automatic captions is
            not built yet. For now you can publish written posts, sermons and testimonies.
          </p>
        </SectionCard>
      </div>
    </AppShell>
  );
}
