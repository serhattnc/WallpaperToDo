create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_username_idx on public.profiles (username);

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    lower(regexp_replace(split_part(coalesce(new.email, 'kullanici@example.com'), '@', 1), '[^a-zA-Z0-9_.]', '', 'g'))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user_profile();

insert into public.profiles (id, username)
select
  u.id,
  lower(regexp_replace(split_part(coalesce(u.email, 'kullanici@example.com'), '@', 1), '[^a-zA-Z0-9_.]', '', 'g'))
from auth.users u
on conflict (id) do nothing;

alter table public.profiles enable row level security;

drop policy if exists "profiles_public_select" on public.profiles;
create policy "profiles_public_select"
on public.profiles
for select
using (auth.role() = 'authenticated');

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self"
on public.profiles
for insert
with check (auth.uid() = id);

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users (id) on delete cascade,
  receiver_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  constraint friend_requests_sender_receiver_uniq unique (sender_id, receiver_id),
  constraint friend_requests_no_self_request check (sender_id <> receiver_id)
);

create index if not exists friend_requests_sender_id_idx on public.friend_requests (sender_id);
create index if not exists friend_requests_receiver_id_idx on public.friend_requests (receiver_id);
create index if not exists friend_requests_status_idx on public.friend_requests (status);

alter table public.friend_requests enable row level security;

drop policy if exists "friend_requests_select_participants" on public.friend_requests;
create policy "friend_requests_select_participants"
on public.friend_requests
for select
using (auth.uid() = sender_id or auth.uid() = receiver_id);

drop policy if exists "friend_requests_insert_sender" on public.friend_requests;
create policy "friend_requests_insert_sender"
on public.friend_requests
for insert
with check (auth.uid() = sender_id and auth.uid() <> receiver_id);

drop policy if exists "friend_requests_update_receiver_accept" on public.friend_requests;
create policy "friend_requests_update_receiver_accept"
on public.friend_requests
for update
using (auth.uid() = receiver_id)
with check (
  auth.uid() = receiver_id
  and sender_id <> receiver_id
  and status in ('pending', 'accepted')
);

drop policy if exists "friend_requests_delete_participants" on public.friend_requests;
create policy "friend_requests_delete_participants"
on public.friend_requests
for delete
using (auth.uid() = sender_id or auth.uid() = receiver_id);

create table if not exists public.todos (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  creator_id uuid references auth.users (id) on delete cascade,
  assigned_id uuid references auth.users (id) on delete cascade,
  task text not null,
  description text,
  subtask text,
  category text,
  is_completed boolean not null default false,
  created_at timestamptz not null default now()
);

alter table if exists public.todos
  add column if not exists creator_id uuid references auth.users (id) on delete cascade,
  add column if not exists assigned_id uuid references auth.users (id) on delete cascade,
  add column if not exists is_completed boolean not null default false;

create index if not exists todos_user_id_idx on public.todos (user_id);
create index if not exists todos_creator_id_idx on public.todos (creator_id);
create index if not exists todos_assigned_id_idx on public.todos (assigned_id);
create index if not exists todos_created_at_idx on public.todos (created_at desc);

create or replace function public.handle_todo_assignment_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.creator_id is null then
    new.creator_id := new.user_id;
  end if;

  if new.user_id is null then
    new.user_id := new.creator_id;
  end if;

  return new;
end;
$$;

drop trigger if exists on_todos_assignment_fields on public.todos;
create trigger on_todos_assignment_fields
  before insert on public.todos
  for each row execute function public.handle_todo_assignment_fields();

alter table public.todos enable row level security;

drop policy if exists "todos_select_participants" on public.todos;
create policy "todos_select_participants"
on public.todos
for select
using (
  auth.uid() = user_id
  or auth.uid() = creator_id
  or auth.uid() = assigned_id
);

drop policy if exists "todos_insert_creator" on public.todos;
create policy "todos_insert_creator"
on public.todos
for insert
with check (
  auth.uid() = coalesce(creator_id, user_id)
);

drop policy if exists "todos_update_participants" on public.todos;
create policy "todos_update_participants"
on public.todos
for update
using (
  auth.uid() = user_id
  or auth.uid() = creator_id
  or auth.uid() = assigned_id
)
with check (
  auth.uid() = user_id
  or auth.uid() = creator_id
  or auth.uid() = assigned_id
);

drop policy if exists "todos_delete_participants" on public.todos;
create policy "todos_delete_participants"
on public.todos
for delete
using (
  auth.uid() = user_id
  or auth.uid() = creator_id
  or auth.uid() = assigned_id
);

create table if not exists public.friend_task_permissions (
  owner_id uuid not null references auth.users (id) on delete cascade,
  friend_id uuid not null references auth.users (id) on delete cascade,
  can_send boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (owner_id, friend_id)
);

alter table public.friend_task_permissions enable row level security;

drop policy if exists "friend_task_permissions_select_own" on public.friend_task_permissions;
create policy "friend_task_permissions_select_own"
on public.friend_task_permissions
for select
using (auth.uid() = owner_id);

drop policy if exists "friend_task_permissions_insert_own" on public.friend_task_permissions;
create policy "friend_task_permissions_insert_own"
on public.friend_task_permissions
for insert
with check (auth.uid() = owner_id);

drop policy if exists "friend_task_permissions_update_own" on public.friend_task_permissions;
create policy "friend_task_permissions_update_own"
on public.friend_task_permissions
for update
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists "friend_task_permissions_delete_own" on public.friend_task_permissions;
create policy "friend_task_permissions_delete_own"
on public.friend_task_permissions
for delete
using (auth.uid() = owner_id);

insert into storage.buckets (id, name, public)
values ('profile-avatars', 'profile-avatars', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "profile_avatars_insert_own" on storage.objects;
create policy "profile_avatars_insert_own"
on storage.objects
for insert
with check (
  bucket_id = 'profile-avatars'
  and auth.uid() is not null
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "profile_avatars_update_own" on storage.objects;
create policy "profile_avatars_update_own"
on storage.objects
for update
using (
  bucket_id = 'profile-avatars'
  and auth.uid() is not null
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'profile-avatars'
  and auth.uid() is not null
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "profile_avatars_delete_own" on storage.objects;
create policy "profile_avatars_delete_own"
on storage.objects
for delete
using (
  bucket_id = 'profile-avatars'
  and auth.uid() is not null
  and auth.uid()::text = (storage.foldername(name))[1]
);