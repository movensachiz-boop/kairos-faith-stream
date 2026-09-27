import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell, SectionCard } from "@/components/layout/AppShell";
import { eventsQuery } from "@/lib/kairos";

export const Route = createFileRoute("/events")({
  head: () => ({
    meta: [
      { title: "Events — KAIROS APP" },
      { name: "description", content: "Upcoming services, conferences and gatherings from ministries on KAIROS." },
      { property: "og:title", content: "Events — KAIROS APP" },
      { property: "og:description", content: "See what's coming up across churches and ministries." },
    ],
  }),
  component: EventsPage,
});

function EventsPage() {
  const events = useQuery(eventsQuery());

  return (
    <AppShell>
      <SectionCard
        title="Upcoming events"
        icon="📅"
        action={<Link to="/ministries" className="text-xs font-semibold text-azure">Ministries</Link>}
      >
        {events.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (events.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No events yet. Ministry owners and leaders can publish events for their community.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(events.data ?? []).map((e: any) => (
              <article key={e.id} className="glass rounded-2xl p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-gold">
                  {e.ministries?.name}
                </div>
                <h3 className="mt-1 font-display text-base font-semibold">{e.title}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(e.starts_at).toLocaleString()}
                  {e.location ? ` · ${e.location}` : ""}
                </p>
                {e.description ? <p className="mt-2 text-sm text-muted-foreground">{e.description}</p> : null}
              </article>
            ))}
          </div>
        )}
      </SectionCard>
    </AppShell>
  );
}
