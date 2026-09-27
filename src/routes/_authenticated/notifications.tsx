import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell, SectionCard } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — KAIROS APP" },
      { name: "description", content: "Your KAIROS notifications." },
      { property: "og:title", content: "Notifications — KAIROS APP" },
      { property: "og:description", content: "Activity from the ministries and believers you follow." },
    ],
  }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const { user } = useAuth();
  const notifications = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        <SectionCard title="Notifications" icon="🔔">
          {(notifications.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing here yet. Notifications for likes, comments, follows and live services will appear here once
              those alerts are switched on.
            </p>
          ) : (
            <ul className="space-y-2">
              {(notifications.data ?? []).map((n: any) => (
                <li key={n.id} className="glass rounded-xl px-4 py-3">
                  <div className="text-sm font-semibold">{n.title}</div>
                  {n.body ? <div className="text-xs text-muted-foreground">{n.body}</div> : null}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </AppShell>
  );
}
