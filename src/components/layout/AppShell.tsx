import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { liveStreamsQuery } from "@/lib/kairos";
import type { ReactNode } from "react";
import { Bell, BookOpen, CircleUserRound, House, Plus, Radio, Video } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, initials } from "@/hooks/useAuth";

const desktopNav = [
  { to: "/", label: "Home" },
  { to: "/live", label: "Live" },
  { to: "/bible", label: "Bible" },
  { to: "/discover", label: "Discover" },
  { to: "/create", label: "Create" },
  { to: "/ministries", label: "Ministries" },
  { to: "/events", label: "Events" },
  { to: "/call", label: "Calls" },
  { to: "/giving", label: "Giving" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const streams = useQuery(liveStreamsQuery());
  const liveNow = (streams.data ?? []).find((s: any) => s.is_live) as any;

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen w-full pb-28 lg:pb-8">
      <header className="sticky top-0 z-30 px-4 pt-4">
        <div className="glass-strong mx-auto flex max-w-7xl items-center gap-4 rounded-md px-4 py-3">
          <Link to="/" className="flex shrink-0 items-center gap-2.5">
            <span className="brand-mark grid size-9 place-items-center rounded-md font-display text-lg font-bold text-primary-foreground">
              K
            </span>
            <span className="leading-none">
              <span className="block font-display text-[15px] font-bold tracking-tight">KAIROS APP</span>
              <span className="block text-[10px] tracking-wide text-muted-foreground">
                Connect. Grow. Share. Give.
              </span>
            </span>
          </Link>

          <nav className="ml-6 hidden items-center gap-1 text-sm lg:flex">
            {desktopNav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.to === "/" }}
                activeProps={{ className: "bg-foreground/10 text-foreground font-medium" }}
                inactiveProps={{ className: "text-muted-foreground hover:text-foreground" }}
                className="rounded-lg px-3 py-1.5"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Link
              to="/notifications"
              className="glass grid size-9 place-items-center rounded-full text-muted-foreground"
              aria-label="Notifications"
            >
              <Bell className="size-4" />
            </Link>
            {isAuthenticated ? (
              <>
                <Link
                  to="/profile"
                  className="brand-cool grid size-9 place-items-center rounded-full text-xs font-semibold text-secondary-foreground"
                >
                  {initials(user?.user_metadata?.['display_name'] ?? user?.email)}
                </Link>
                <button
                  onClick={signOut}
                  className="glass hidden rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground sm:block"
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link
                to="/auth"
                className="brand-mark rounded-md px-4 py-2 text-xs font-semibold text-primary-foreground"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      {liveNow ? (
        <div className="mx-auto mt-3 max-w-7xl px-4">
          <Link
            to="/live/$id"
            params={{ id: liveNow.id }}
            className="flex items-center gap-3 rounded-md bg-destructive px-4 py-2.5 text-sm text-destructive-foreground"
          >
            <span className="size-2.5 rounded-full bg-destructive-foreground" />
            <span className="font-bold">LIVE NOW</span>
            <span className="truncate">{liveNow.title}</span>
            <span className="ml-auto shrink-0 font-semibold">Watch ▶</span>
          </Link>
        </div>
      ) : null}

      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-30 px-4 pb-4 lg:hidden">
        <div className="glass-strong flex items-center justify-between rounded-md px-3 py-2">
          <Link to="/" className="flex flex-col items-center gap-0.5 text-[10px] text-muted-foreground" activeProps={{ className: "text-primary" }}>
            <House className="size-4" /><span>Home</span>
          </Link>
          <Link to="/live" className="flex flex-col items-center gap-0.5 text-[10px] text-muted-foreground" activeProps={{ className: "text-destructive" }}>
            <Radio className="size-4" /><span>Live</span>
          </Link>
          <Link to="/bible" className="flex flex-col items-center gap-0.5 text-[10px] text-muted-foreground">
            <BookOpen className="size-4" /><span>Bible</span>
          </Link>
          <Link to="/call" className="flex flex-col items-center gap-0.5 text-[10px] text-muted-foreground" activeProps={{ className: "text-primary" }}>
            <Video className="size-4" /><span>Call</span>
          </Link>
          <Link to="/create" className="flex flex-col items-center gap-0.5 text-[10px]">
            <span className="brand-mark -mt-6 grid size-9 place-items-center rounded-full font-bold text-primary-foreground">
              <Plus className="size-4" />
            </span>
            <span>Create</span>
          </Link>
          <Link to="/profile" className="flex flex-col items-center gap-0.5 text-[10px] text-muted-foreground">
            <CircleUserRound className="size-4" /><span>Profile</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}

export function SectionCard({
  title,
  icon,
  action,
  children,
  tone = "glass",
}: {
  title: string;
  icon?: string;
  action?: ReactNode;
  children: ReactNode;
  tone?: "glass" | "give";
}) {
  return (
    <section className={`${tone === "give" ? "glass-give" : "glass"} rounded-md p-5`}>
      <div className="mb-3 flex items-center gap-2">
        {icon ? <span className="text-base">{icon}</span> : null}
        <h2 className="font-display text-sm font-semibold tracking-wide">{title}</h2>
        {action ? <div className="ml-auto">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}
