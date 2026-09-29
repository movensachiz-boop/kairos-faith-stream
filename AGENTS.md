<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules

- Ministries are the tenant boundary: every shared record (posts, events, streams, gifts) carries `ministry_id`, and leader-only writes go through the `public.is_ministry_leader()` security-definer function so RLS stays non-recursive.
- Roles live in `public.user_roles` + `public.has_role()`, never on `profiles`, to prevent privilege escalation.
- Data access is client-side: routes call the browser Supabase client through TanStack Query helpers in `src/lib/kairos.ts`; RLS is the only authorization layer.
- All pages render inside `src/components/layout/AppShell.tsx`; visual styling uses the white/soft-green/red semantic tokens in `src/styles.css`, with flat surfaces and no decorative effects.
- Multi-camera live uses ephemeral Realtime/WebRTC pairing: Camera 1 owns audio, Cameras 2–3 send video only, and no pairing state is persisted.
- Live scripture slides are rendered to a canvas video track and substituted for the outgoing video track; the host audio track remains untouched so viewers receive the full slide without changing sound.
