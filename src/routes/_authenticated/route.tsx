import { createFileRoute, Outlet } from "@tanstack/react-router";

// Open testing mode: sign-in gate removed so every page can be browsed without logging in.
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: () => <Outlet />,
});
