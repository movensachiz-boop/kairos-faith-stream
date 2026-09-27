import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell, SectionCard } from "@/components/layout/AppShell";
import { feedQuery, ministriesQuery } from "@/lib/kairos";
import { initials } from "@/hooks/useAuth";

export const Route = createFileRoute("/discover")({
  head: () => ({
    meta: [
      { title: "Discover — KAIROS APP" },
      { name: "description", content: "Discover sermons, ministries, teachings and Christian content." },
      { property: "og:title", content: "Discover — KAIROS APP" },
      { property: "og:description", content: "Find ministries, sermons and Bible teaching across KAIROS." },
    ],
  }),
  component: DiscoverPage,
});

function DiscoverPage() {
  const [q, setQ] = useState("");
  const posts = useQuery(feedQuery());
  const ministries = useQuery(ministriesQuery());
  const needle = q.trim().toLowerCase();

  const filteredPosts = (posts.data ?? []).filter((p) =>
    !needle ? true : `${p.title ?? ""} ${p.body ?? ""} ${p.scripture_ref ?? ""}`.toLowerCase().includes(needle),
  );
  const filteredMinistries = (ministries.data ?? []).filter((m: any) =>
    !needle ? true : `${m.name} ${m.category ?? ""}`.toLowerCase().includes(needle),
  );

  return (
    <AppShell>
      <div className="space-y-5">
        <SectionCard title="Discover" icon="✨">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search sermons, ministries, teachings…"
            className="glass w-full rounded-xl px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
          />
        </SectionCard>

        <SectionCard title="Ministries" icon="⛪">
          {filteredMinistries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No ministries match yet.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredMinistries.map((m: any) => (
                <Link key={m.id} to="/ministries" className="glass flex items-center gap-3 rounded-2xl p-4">
                  <span className="brand-cool grid size-10 place-items-center rounded-xl text-xs font-semibold">
                    {initials(m.name)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{m.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {m.follows?.length ?? 0} followers
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Content" icon="🎬">
          {filteredPosts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing published yet.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {filteredPosts.map((p) => (
                <article key={p.id} className="glass rounded-2xl p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-gold">{p.kind}</div>
                  <h3 className="mt-1 font-display text-base font-semibold">{p.title ?? "Untitled"}</h3>
                  <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{p.body}</p>
                </article>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </AppShell>
  );
}
