import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
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
  { to: "/giving", label: "Giving" },
] as const;

const mobileNav = [
  { to: "/", label: "Home", icon: "🏠" },
  { to: "/live", label: "Live", icon: "🔴" },
  { to: "/bible", label: "Bible", icon: "📖" },
  { to: "/profile", label: "Profile", icon: "👤" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen w-full pb-28 lg:pb-8">
      <header className="sticky top-0 z-30 px-4 pt-4">
        <div className="glass-strong mx-auto flex max-w-7xl items-center gap-4 rounded-2xl px-4 py-3">
          <Link to="/" className="flex shrink-0 items-center gap-2.5">
            <span className="brand-mark grid size-9 place-items-center rounded-xl font-display text-lg font-bold text-ink">
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
              🔔
            </Link>
            {isAuthenticated ? (
              <>
                <Link
                  to="/profile"
                  className="brand-cool grid size-9 place-items-center rounded-full text-xs font-semibold"
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
                className="brand-mark rounded-lg px-4 py-2 text-xs font-semibold text-ink"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-30 px-4 pb-4 lg:hidden">
        <div className="glass-strong flex items-center justify-between rounded-2xl px-2 py-2">
          {mobileNav.slice(0, 2).map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="flex flex-col items-center gap-0.5 text-[10px] text-muted-foreground"
              activeProps={{ className: "text-foreground" }}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
          <Link to="/bible" className="flex flex-col items-center gap-0.5 text-[10px] text-muted-foreground">
            <span>📖</span>
            <span>Bible</span>
          </Link>
          <Link to="/create" className="flex flex-col items-center gap-0.5 text-[10px]">
            <span className="brand-mark -mt-6 grid size-9 place-items-center rounded-full font-bold text-ink">
              +
            </span>
            <span>Create</span>
          </Link>
          <Link to="/profile" className="flex flex-col items-center gap-0.5 text-[10px] text-muted-foreground">
            <span>👤</span>
            <span>Profile</span>
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
    <section className={`${tone === "give" ? "glass-give" : "glass"} rounded-3xl p-5`}>
      <div className="mb-3 flex items-center gap-2">
        {icon ? <span className="text-base">{icon}</span> : null}
        <h2 className="font-display text-sm font-semibold tracking-wide">{title}</h2>
        {action ? <div className="ml-auto">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}
