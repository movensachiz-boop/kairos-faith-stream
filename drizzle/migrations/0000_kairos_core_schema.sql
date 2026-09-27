-- ============ ENUMS ============
create type public.app_role as enum ('admin', 'moderator', 'user');
create type public.ministry_role as enum ('owner', 'leader', 'member');
create type public.post_kind as enum ('text', 'video', 'sermon', 'testimony');
create type public.gift_kind as enum ('seed', 'tithe', 'offering');
create type public.gift_status as enum ('pending', 'paid', 'failed', 'cancelled');

-- ============ PROFILES ============
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text not null,
  bio text,
  avatar_url text,
  created_at timestamptz not null default now()
);
grant select on public.profiles to anon;
grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "profiles are public" on public.profiles for select using (true);
create policy "users insert own profile" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "users update own profile" on public.profiles for update to authenticated using (auth.uid() = id);
create policy "users delete own profile" on public.profiles for delete to authenticated using (auth.uid() = id);

-- ============ ROLES ============
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "users read own roles" on public.user_roles for select to authenticated using (auth.uid() = user_id);

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

-- ============ AUTO PROFILE ON SIGNUP ============
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', 'kairos_' || substr(replace(new.id::text,'-',''), 1, 10)),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values (new.id, 'user') on conflict do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ MINISTRIES (tenants) ============
create table public.ministries (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  tagline text,
  description text,
  category text,
  logo_url text,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
grant select on public.ministries to anon;
grant select, insert, update, delete on public.ministries to authenticated;
grant all on public.ministries to service_role;
alter table public.ministries enable row level security;
create policy "ministries are public" on public.ministries for select using (true);
create policy "users create ministries" on public.ministries for insert to authenticated with check (auth.uid() = owner_id);
create policy "owners update ministries" on public.ministries for update to authenticated using (auth.uid() = owner_id);
create policy "owners delete ministries" on public.ministries for delete to authenticated using (auth.uid() = owner_id);

create table public.ministry_members (
  id uuid primary key default gen_random_uuid(),
  ministry_id uuid not null references public.ministries(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role ministry_role not null default 'member',
  created_at timestamptz not null default now(),
  unique (ministry_id, user_id)
);
grant select on public.ministry_members to anon;
grant select, insert, update, delete on public.ministry_members to authenticated;
grant all on public.ministry_members to service_role;
alter table public.ministry_members enable row level security;
create policy "memberships are public" on public.ministry_members for select using (true);
create policy "users join ministries" on public.ministry_members for insert to authenticated with check (auth.uid() = user_id);
create policy "users leave ministries" on public.ministry_members for delete to authenticated using (auth.uid() = user_id);

create or replace function public.is_ministry_leader(_ministry_id uuid, _user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.ministries m where m.id = _ministry_id and m.owner_id = _user_id
    union all
    select 1 from public.ministry_members mm
    where mm.ministry_id = _ministry_id and mm.user_id = _user_id and mm.role in ('owner','leader')
  )
$$;

-- ============ FOLLOWS ============
create table public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references auth.users(id) on delete cascade,
  followee_id uuid references auth.users(id) on delete cascade,
  ministry_id uuid references public.ministries(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (num_nonnulls(followee_id, ministry_id) = 1)
);
create unique index follows_user_unique on public.follows (follower_id, followee_id) where followee_id is not null;
create unique index follows_ministry_unique on public.follows (follower_id, ministry_id) where ministry_id is not null;
grant select on public.follows to anon;
grant select, insert, delete on public.follows to authenticated;
grant all on public.follows to service_role;
alter table public.follows enable row level security;
create policy "follows are public" on public.follows for select using (true);
create policy "users follow" on public.follows for insert to authenticated with check (auth.uid() = follower_id);
create policy "users unfollow" on public.follows for delete to authenticated using (auth.uid() = follower_id);

-- ============ POSTS ============
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  ministry_id uuid references public.ministries(id) on delete set null,
  kind post_kind not null default 'text',
  title text,
  body text,
  media_url text,
  scripture_ref text,
  created_at timestamptz not null default now()
);
create index posts_created_idx on public.posts (created_at desc);
grant select on public.posts to anon;
grant select, insert, update, delete on public.posts to authenticated;
grant all on public.posts to service_role;
alter table public.posts enable row level security;
create policy "posts are public" on public.posts for select using (true);
create policy "users create posts" on public.posts for insert to authenticated with check (auth.uid() = author_id);
create policy "authors update posts" on public.posts for update to authenticated using (auth.uid() = author_id);
create policy "authors delete posts" on public.posts for delete to authenticated using (auth.uid() = author_id);

create table public.post_likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);
grant select on public.post_likes to anon;
grant select, insert, delete on public.post_likes to authenticated;
grant all on public.post_likes to service_role;
alter table public.post_likes enable row level security;
create policy "likes are public" on public.post_likes for select using (true);
create policy "users like" on public.post_likes for insert to authenticated with check (auth.uid() = user_id);
create policy "users unlike" on public.post_likes for delete to authenticated using (auth.uid() = user_id);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);
grant select on public.comments to anon;
grant select, insert, update, delete on public.comments to authenticated;
grant all on public.comments to service_role;
alter table public.comments enable row level security;
create policy "comments are public" on public.comments for select using (true);
create policy "users comment" on public.comments for insert to authenticated with check (auth.uid() = author_id);
create policy "authors update comments" on public.comments for update to authenticated using (auth.uid() = author_id);
create policy "authors delete comments" on public.comments for delete to authenticated using (auth.uid() = author_id);

-- ============ PRAYER ============
create table public.prayer_requests (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  ministry_id uuid references public.ministries(id) on delete set null,
  body text not null,
  is_anonymous boolean not null default false,
  created_at timestamptz not null default now()
);
create index prayer_created_idx on public.prayer_requests (created_at desc);
grant select on public.prayer_requests to anon;
grant select, insert, update, delete on public.prayer_requests to authenticated;
grant all on public.prayer_requests to service_role;
alter table public.prayer_requests enable row level security;
create policy "prayers are public" on public.prayer_requests for select using (true);
create policy "users create prayers" on public.prayer_requests for insert to authenticated with check (auth.uid() = author_id);
create policy "authors update prayers" on public.prayer_requests for update to authenticated using (auth.uid() = author_id);
create policy "authors delete prayers" on public.prayer_requests for delete to authenticated using (auth.uid() = author_id);

create table public.prayer_intercessions (
  id uuid primary key default gen_random_uuid(),
  prayer_id uuid not null references public.prayer_requests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (prayer_id, user_id)
);
grant select on public.prayer_intercessions to anon;
grant select, insert, delete on public.prayer_intercessions to authenticated;
grant all on public.prayer_intercessions to service_role;
alter table public.prayer_intercessions enable row level security;
create policy "intercessions are public" on public.prayer_intercessions for select using (true);
create policy "users pray" on public.prayer_intercessions for insert to authenticated with check (auth.uid() = user_id);
create policy "users unpray" on public.prayer_intercessions for delete to authenticated using (auth.uid() = user_id);

-- ============ EVENTS ============
create table public.events (
  id uuid primary key default gen_random_uuid(),
  ministry_id uuid not null references public.ministries(id) on delete cascade,
  title text not null,
  description text,
  location text,
  starts_at timestamptz not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
grant select on public.events to anon;
grant select, insert, update, delete on public.events to authenticated;
grant all on public.events to service_role;
alter table public.events enable row level security;
create policy "events are public" on public.events for select using (true);
create policy "leaders create events" on public.events for insert to authenticated with check (public.is_ministry_leader(ministry_id, auth.uid()));
create policy "leaders update events" on public.events for update to authenticated using (public.is_ministry_leader(ministry_id, auth.uid()));
create policy "leaders delete events" on public.events for delete to authenticated using (public.is_ministry_leader(ministry_id, auth.uid()));

-- ============ LIVE STREAMS ============
create table public.live_streams (
  id uuid primary key default gen_random_uuid(),
  ministry_id uuid not null references public.ministries(id) on delete cascade,
  title text not null,
  speaker text,
  scripture_ref text,
  thumbnail_url text,
  stream_url text,
  is_live boolean not null default false,
  viewer_count integer not null default 0,
  started_at timestamptz,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
grant select on public.live_streams to anon;
grant select, insert, update, delete on public.live_streams to authenticated;
grant all on public.live_streams to service_role;
alter table public.live_streams enable row level security;
create policy "streams are public" on public.live_streams for select using (true);
create policy "leaders create streams" on public.live_streams for insert to authenticated with check (public.is_ministry_leader(ministry_id, auth.uid()));
create policy "leaders update streams" on public.live_streams for update to authenticated using (public.is_ministry_leader(ministry_id, auth.uid()));
create policy "leaders delete streams" on public.live_streams for delete to authenticated using (public.is_ministry_leader(ministry_id, auth.uid()));

-- ============ GIVING ============
create table public.gifts (
  id uuid primary key default gen_random_uuid(),
  giver_id uuid not null references auth.users(id) on delete cascade,
  ministry_id uuid not null references public.ministries(id) on delete cascade,
  kind gift_kind not null default 'seed',
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'USD',
  status gift_status not null default 'pending',
  note text,
  created_at timestamptz not null default now()
);
grant select, insert on public.gifts to authenticated;
grant all on public.gifts to service_role;
alter table public.gifts enable row level security;
create policy "givers read own gifts" on public.gifts for select to authenticated using (auth.uid() = giver_id);
create policy "leaders read ministry gifts" on public.gifts for select to authenticated using (public.is_ministry_leader(ministry_id, auth.uid()));
create policy "users give" on public.gifts for insert to authenticated with check (auth.uid() = giver_id);

-- ============ BIBLE ============
create table public.bible_verses (
  id uuid primary key default gen_random_uuid(),
  book text not null,
  chapter integer not null,
  verse integer not null,
  text text not null,
  translation text not null default 'WEB',
  unique (translation, book, chapter, verse)
);
create index bible_lookup_idx on public.bible_verses (book, chapter, verse);
grant select on public.bible_verses to anon, authenticated;
grant all on public.bible_verses to service_role;
alter table public.bible_verses enable row level security;
create policy "bible is public" on public.bible_verses for select using (true);

create table public.bible_bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reference text not null,
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, reference)
);
grant select, insert, update, delete on public.bible_bookmarks to authenticated;
grant all on public.bible_bookmarks to service_role;
alter table public.bible_bookmarks enable row level security;
create policy "users read own bookmarks" on public.bible_bookmarks for select to authenticated using (auth.uid() = user_id);
create policy "users create bookmarks" on public.bible_bookmarks for insert to authenticated with check (auth.uid() = user_id);
create policy "users update bookmarks" on public.bible_bookmarks for update to authenticated using (auth.uid() = user_id);
create policy "users delete bookmarks" on public.bible_bookmarks for delete to authenticated using (auth.uid() = user_id);

-- ============ NOTIFICATIONS ============
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text,
  link text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
grant select, update, delete on public.notifications to authenticated;
grant all on public.notifications to service_role;
alter table public.notifications enable row level security;
create policy "users read own notifications" on public.notifications for select to authenticated using (auth.uid() = user_id);
create policy "users update own notifications" on public.notifications for update to authenticated using (auth.uid() = user_id);
create policy "users delete own notifications" on public.notifications for delete to authenticated using (auth.uid() = user_id);

-- ============ SEED BIBLE SAMPLE ============
insert into public.bible_verses (book, chapter, verse, text) values
('Psalms', 46, 10, 'Be still, and know that I am God.'),
('Psalms', 119, 105, 'Your word is a lamp to my feet, and a light for my path.'),
('Isaiah', 40, 31, 'But those who wait for Yahweh will renew their strength. They will mount up with wings like eagles.'),
('Ecclesiastes', 3, 1, 'For everything there is a season, and a time for every purpose under heaven.'),
('Romans', 8, 28, 'We know that all things work together for good for those who love God.'),
('Philippians', 4, 13, 'I can do all things through Christ, who strengthens me.'),
('John', 3, 16, 'For God so loved the world, that he gave his one and only Son.'),
('Joshua', 1, 9, 'Be strong and courageous. Don''t be afraid. Yahweh your God is with you wherever you go.'),
('Proverbs', 3, 5, 'Trust in Yahweh with all your heart, and don''t lean on your own understanding.'),
('Matthew', 6, 33, 'But seek first God''s Kingdom and his righteousness; and all these things will be given to you as well.'),
('Lamentations', 3, 23, 'They are new every morning. Great is your faithfulness.'),
('Habakkuk', 2, 3, 'For the vision is yet for the appointed time. Though it takes time, wait for it.');
