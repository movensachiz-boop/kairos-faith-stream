alter table public.posts
  add constraint posts_author_profile_fkey foreign key (author_id) references public.profiles(id) on delete cascade;
alter table public.prayer_requests
  add constraint prayer_author_profile_fkey foreign key (author_id) references public.profiles(id) on delete cascade;
alter table public.comments
  add constraint comments_author_profile_fkey foreign key (author_id) references public.profiles(id) on delete cascade;
