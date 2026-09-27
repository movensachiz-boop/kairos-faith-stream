import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell, SectionCard } from "@/components/layout/AppShell";
import { ministriesQuery } from "@/lib/kairos";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, initials } from "@/hooks/useAuth";

export const Route = createFileRoute("/ministries")({
  head: () => ({
    meta: [
      { title: "Ministries — KAIROS APP" },
      { name: "description", content: "Browse churches and ministries, follow them and create your own." },
      { property: "og:title", content: "Ministries — KAIROS APP" },
      { property: "og:description", content: "Every church and ministry keeps its own space on KAIROS." },
    ],
  }),
  component: MinistriesPage,
});

function MinistriesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const ministries = useQuery(ministriesQuery());
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [tagline, setTagline] = useState("");
  const [busy, setBusy] = useState(false);

  async function createMinistry(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return toast.error("Sign in to create a ministry.");
    setBusy(true);
    const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    const { error } = await supabase
      .from("ministries")
      .insert({ name, slug, category: category || null, tagline: tagline || null, owner_id: user.id });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Ministry created.");
    setName("");
    setCategory("");
    setTagline("");
    queryClient.invalidateQueries({ queryKey: ["ministries"] });
  }

  async function follow(ministryId: string, following: boolean) {
    if (!user) return toast.error("Sign in to follow ministries.");
    if (following) {
      await supabase.from("follows").delete().eq("ministry_id", ministryId).eq("follower_id", user.id);
    } else {
      await supabase.from("follows").insert({ ministry_id: ministryId, follower_id: user.id });
    }
    queryClient.invalidateQueries({ queryKey: ["ministries"] });
  }

  return (
    <AppShell>
      <div className="grid grid-cols-12 gap-5">
        <section className="col-span-12 lg:col-span-8">
          <SectionCard title="Ministries on KAIROS" icon="⛪">
            {ministries.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (ministries.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No ministries yet — create the first one.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {(ministries.data ?? []).map((m: any) => {
                  const following = !!m.follows?.some((f: any) => f.follower_id === user?.id);
                  return (
                    <article key={m.id} className="glass rounded-2xl p-4">
                      <div className="flex items-center gap-3">
                        <span className="brand-cool grid size-11 place-items-center rounded-xl text-xs font-semibold">
                          {initials(m.name)}
                        </span>
                        <div className="min-w-0">
                          <h3 className="truncate font-display text-base font-semibold">{m.name}</h3>
                          <p className="truncate text-xs text-muted-foreground">
                            {m.follows?.length ?? 0} followers{m.category ? ` · ${m.category}` : ""}
                          </p>
                        </div>
                      </div>
                      {m.tagline ? <p className="mt-3 text-sm text-muted-foreground">{m.tagline}</p> : null}
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => follow(m.id, following)}
                          className="rounded-lg bg-foreground/10 px-3 py-1.5 text-xs font-semibold hover:bg-foreground/20"
                        >
                          {following ? "Following" : "Follow"}
                        </button>
                        <Link to="/giving" className="glass-give rounded-lg px-3 py-1.5 text-xs font-semibold">
                          Give
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </section>

        <aside className="col-span-12 lg:col-span-4">
          <SectionCard title="Start a ministry" icon="✨">
            {!user ? (
              <p className="text-sm text-muted-foreground">
                <Link to="/auth" className="text-azure">Sign in</Link> to register your church or ministry.
              </p>
            ) : (
              <form onSubmit={createMinistry} className="space-y-3">
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ministry name"
                  className="glass w-full rounded-xl px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
                />
                <input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="Category (Worship, Teaching…)"
                  className="glass w-full rounded-xl px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
                />
                <input
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  placeholder="Tagline"
                  className="glass w-full rounded-xl px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
                />
                <button
                  disabled={busy}
                  className="brand-mark w-full rounded-xl py-2.5 text-sm font-semibold text-ink disabled:opacity-60"
                >
                  {busy ? "Creating…" : "Create ministry"}
                </button>
              </form>
            )}
          </SectionCard>
        </aside>
      </div>
    </AppShell>
  );
}
