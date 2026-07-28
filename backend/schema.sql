-- ReHaTo · Supabase schema (v0.3)
-- ─────────────────────────────────────────────────────────────
-- Run this in the Supabase SQL editor. The whole file is IDEMPOTENT:
-- re-running it after updates is safe (existing tables and data are
-- kept, policies are re-created).
-- Designed for anonymous sign-in: every row belongs to auth.uid(),
-- and Row Level Security guarantees users only ever see their own data.
-- Mirrors the frontend store interface in js/store.js 1:1.

-- Reflections: one journal entry per user per day (calendar view)
create table if not exists public.reflections (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date       date not null,
  text       text not null default '',
  mood       smallint check (mood between 0 and 4),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

-- Habits (habits view)
create table if not exists public.habits (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null,
  icon       text,
  created_at timestamptz not null default now(),
  archived   boolean not null default false
);

-- Habit check-ins: one row per habit per day
create table if not exists public.habit_logs (
  habit_id   uuid not null references public.habits(id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date       date not null,
  primary key (habit_id, date)
);

-- Notes & to-dos (notes view; kind = 'todo' | 'thought')
create table if not exists public.items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('todo', 'thought')),
  text       text not null,
  done       boolean not null default false,
  created_at timestamptz not null default now()
);

-- Books (books view; reading progress lives here)
create table if not exists public.books (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title        text not null,
  author       text not null default '',
  total_pages  integer check (total_pages > 0),
  current_page integer not null default 0 check (current_page >= 0),
  cover_url    text,
  rating       smallint check (rating between 1 and 5),
  position     integer,
  created_at   timestamptz not null default now()
);
-- v0.7+: newer columns — safe to re-run on databases created earlier
alter table public.books add column if not exists cover_url text;
alter table public.books add column if not exists rating smallint check (rating between 1 and 5);
alter table public.books add column if not exists position integer;

-- Book entries: quotes & notes captured per book (kind = 'quote' | 'note')
create table if not exists public.book_entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  book_id    uuid not null references public.books(id) on delete cascade,
  kind       text not null check (kind in ('quote', 'note')),
  text       text not null,
  page       integer check (page > 0),
  created_at timestamptz not null default now()
);

-- Row Level Security: each user sees only their own rows.
alter table public.reflections  enable row level security;
alter table public.habits       enable row level security;
alter table public.habit_logs   enable row level security;
alter table public.items        enable row level security;
alter table public.books        enable row level security;
alter table public.book_entries enable row level security;

drop policy if exists "own reflections" on public.reflections;
create policy "own reflections" on public.reflections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own habits" on public.habits;
create policy "own habits" on public.habits
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own habit_logs" on public.habit_logs;
create policy "own habit_logs" on public.habit_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own items" on public.items;
create policy "own items" on public.items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own books" on public.books;
create policy "own books" on public.books
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own book_entries" on public.book_entries;
create policy "own book_entries" on public.book_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Helpful indexes for the app's query patterns
create index if not exists reflections_user_date  on public.reflections (user_id, date desc);
create index if not exists habit_logs_user_date   on public.habit_logs (user_id, date desc);
create index if not exists items_user_created     on public.items (user_id, created_at desc);
create index if not exists books_user_created     on public.books (user_id, created_at);
create index if not exists book_entries_user_book on public.book_entries (user_id, book_id, created_at desc);
