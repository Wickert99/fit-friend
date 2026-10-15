-- Fit Friend social + sync schema.
--
-- REVIEW ONLY. Do not apply this file to the live project
-- https://ghdioggstszbtykmlgis.supabase.co
-- Those tables, columns, and RPCs already exist and hold user data.
-- This migration reconstructs them for a fresh database.
--
-- Column names were checked with read-only PostgREST probes (a missing
-- column returns 42703; these names returned permission-denied instead)
-- and with the recovered client bundles. Grants on the live project are
-- not given to `anon`; the signed-in `authenticated` role is the client.
--
-- Kinds written by the sync engine: exercise, program, session, pr,
-- plan_board, planned_session, program_instance, completed_plan, settings.
-- `settings` ids look like `weightUnit`, `profile.name`, `liftMaxes.<id>`,
-- `scheduled.<date>`, `seasonGoals.<key>`, `commitmentDays.<date>`.
-- Older rows may also use activity, profile, or scheduled as kinds.
-- `kind` stays free text so those rows are not rejected.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy profiles_insert_self
  on public.profiles
  for insert
  to authenticated
  with check (id = auth.uid());

create policy profiles_update_self
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- friendships
-- Pair is unordered. The accept RPC stores least(uuid), greatest(uuid).
-- The client selects rows where user_a or user_b is the signed-in user.
-- ---------------------------------------------------------------------------

create table public.friendships (
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  constraint friendships_distinct check (user_a <> user_b)
);

create unique index friendships_pair_uidx
  on public.friendships (least(user_a, user_b), greatest(user_a, user_b));

create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select a is not null
    and b is not null
    and a <> b
    and exists (
      select 1
      from public.friendships f
      where (f.user_a = a and f.user_b = b)
         or (f.user_a = b and f.user_b = a)
    );
$$;

create policy profiles_select_self_or_friend
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid() or public.are_friends(id, auth.uid()));

alter table public.friendships enable row level security;

create policy friendships_select_own
  on public.friendships
  for select
  to authenticated
  using (user_a = auth.uid() or user_b = auth.uid());

-- Inserts go through accept_friend_invite (security definer). No client write policy.

-- ---------------------------------------------------------------------------
-- friend_invites
-- `accepted_by` is on the live table. The client does not write it; the RPC does.
-- ---------------------------------------------------------------------------

create table public.friend_invites (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references auth.users (id) on delete cascade,
  code text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  accepted_by uuid references auth.users (id) on delete set null,
  constraint friend_invites_code_unique unique (code)
);

create index friend_invites_from_status_idx
  on public.friend_invites (from_user, status, created_at desc);

alter table public.friend_invites enable row level security;

create policy friend_invites_select_own
  on public.friend_invites
  for select
  to authenticated
  using (from_user = auth.uid());

create policy friend_invites_insert_own
  on public.friend_invites
  for insert
  to authenticated
  with check (from_user = auth.uid() and status = 'pending');

-- Recipients never select invite rows. accept_friend_invite reads them as definer.

-- ---------------------------------------------------------------------------
-- chat_messages
-- Realtime: the client subscribes to public.chat_messages.
-- ---------------------------------------------------------------------------

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references auth.users (id) on delete cascade,
  to_user uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint chat_messages_not_self check (from_user <> to_user),
  constraint chat_messages_body_len check (char_length(body) between 1 and 2000)
);

create index chat_messages_pair_idx
  on public.chat_messages (from_user, to_user, created_at desc, id desc);

create index chat_messages_inbox_idx
  on public.chat_messages (to_user, created_at desc);

alter table public.chat_messages enable row level security;

create policy chat_messages_select_friends
  on public.chat_messages
  for select
  to authenticated
  using (
    (from_user = auth.uid() or to_user = auth.uid())
    and public.are_friends(from_user, to_user)
  );

create policy chat_messages_insert_friends
  on public.chat_messages
  for insert
  to authenticated
  with check (
    from_user = auth.uid()
    and from_user <> to_user
    and public.are_friends(from_user, to_user)
  );

create policy chat_messages_mark_read
  on public.chat_messages
  for update
  to authenticated
  using (to_user = auth.uid() and public.are_friends(from_user, to_user))
  with check (to_user = auth.uid() and public.are_friends(from_user, to_user));

create or replace function public.chat_messages_read_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is distinct from old.from_user then
    if new.id is distinct from old.id
      or new.from_user is distinct from old.from_user
      or new.to_user is distinct from old.to_user
      or new.body is distinct from old.body
      or new.created_at is distinct from old.created_at
    then
      raise exception 'Only read_at can be updated';
    end if;
  end if;
  return new;
end;
$$;

create trigger chat_messages_read_only
  before update on public.chat_messages
  for each row
  execute function public.chat_messages_read_only();

-- ---------------------------------------------------------------------------
-- program_shares
-- Live columns: program_id, program_name, program_snapshot (not `program`).
-- ---------------------------------------------------------------------------

create table public.program_shares (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references auth.users (id) on delete cascade,
  to_user uuid not null references auth.users (id) on delete cascade,
  program_id text,
  program_name text,
  program_snapshot jsonb,
  message text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  constraint program_shares_not_self check (from_user <> to_user),
  constraint program_shares_status check (status in ('pending', 'accepted', 'declined'))
);

create index program_shares_to_idx
  on public.program_shares (to_user, created_at desc);

create index program_shares_from_idx
  on public.program_shares (from_user, created_at desc);

alter table public.program_shares enable row level security;

create policy program_shares_select_party
  on public.program_shares
  for select
  to authenticated
  using (from_user = auth.uid() or to_user = auth.uid());

create policy program_shares_insert_friend
  on public.program_shares
  for insert
  to authenticated
  with check (
    from_user = auth.uid()
    and from_user <> to_user
    and status = 'pending'
    and public.are_friends(from_user, to_user)
  );

create policy program_shares_update_recipient
  on public.program_shares
  for update
  to authenticated
  using (to_user = auth.uid())
  with check (to_user = auth.uid() and status in ('pending', 'accepted', 'declined'));

create or replace function public.program_shares_status_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() = old.to_user and auth.uid() is distinct from old.from_user then
    if new.from_user is distinct from old.from_user
      or new.to_user is distinct from old.to_user
      or new.program_id is distinct from old.program_id
      or new.program_name is distinct from old.program_name
      or new.program_snapshot is distinct from old.program_snapshot
      or new.message is distinct from old.message
      or new.created_at is distinct from old.created_at
      or new.id is distinct from old.id
    then
      raise exception 'Only status can be updated';
    end if;
  end if;
  return new;
end;
$$;

create trigger program_shares_status_only
  before update on public.program_shares
  for each row
  execute function public.program_shares_status_only();

-- ---------------------------------------------------------------------------
-- progress_posts
-- Upsert conflict target is (user_id, session_local_id).
-- Live columns are title, detail, post_type, snapshot — not summary/payload.
-- Friends (and the author) can select. Writes are author-only.
-- ---------------------------------------------------------------------------

create table public.progress_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_local_id text not null,
  title text,
  detail text,
  post_type text not null default 'workout',
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint progress_posts_session_unique unique (user_id, session_local_id)
);

create index progress_posts_created_idx
  on public.progress_posts (created_at desc);

alter table public.progress_posts enable row level security;

create policy progress_posts_select_friends
  on public.progress_posts
  for select
  to authenticated
  using (user_id = auth.uid() or public.are_friends(user_id, auth.uid()));

create policy progress_posts_insert_self
  on public.progress_posts
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy progress_posts_update_self
  on public.progress_posts
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy progress_posts_delete_self
  on public.progress_posts
  for delete
  to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- user_records
-- Owner-only. The client pulls with `.gt('rev', cursor)` and does not send
-- user_id; RLS supplies that filter. rev is server-assigned and monotonic.
-- upsert_user_records is last-write-wins on updated_at.
-- ---------------------------------------------------------------------------

create sequence public.user_records_rev_seq;

create table public.user_records (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  rev bigint not null default nextval('public.user_records_rev_seq'),
  primary key (user_id, kind, id)
);

create index user_records_user_rev_idx
  on public.user_records (user_id, rev);

alter table public.user_records enable row level security;

create policy user_records_owner_all
  on public.user_records
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- user_backups
-- Insert omits user_id and size_bytes. user_id defaults to auth.uid().
-- size_bytes is generated so the client can list backups without the payload.
-- ---------------------------------------------------------------------------

create table public.user_backups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  payload jsonb not null,
  schema_version integer not null default 5,
  device_label text,
  size_bytes integer generated always as (octet_length(payload::text)) stored
);

create index user_backups_user_created_idx
  on public.user_backups (user_id, created_at desc);

alter table public.user_backups enable row level security;

create policy user_backups_owner_all
  on public.user_backups
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- accept_friend_invite(invite_code text) -> jsonb
-- Client: rpc('accept_friend_invite', { invite_code })
--   { ok: true, already_friends: true }  -> "You're already friends"
--   { ok: false }                         -> "Could not accept invite"
--   anything else truthy                 -> refresh crew
-- Raises (so error.message matches) when the code is missing, no longer
-- pending, or belongs to the caller:
--   Invite not found | Invite is no longer pending | Cannot accept your own invite
-- ---------------------------------------------------------------------------

create or replace function public.accept_friend_invite(invite_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  inv public.friend_invites%rowtype;
  left_id uuid;
  right_id uuid;
  code_norm text := upper(trim(coalesce(invite_code, '')));
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  if code_norm = '' then
    raise exception 'Invite not found';
  end if;

  select *
    into inv
  from public.friend_invites
  where upper(code) = code_norm
  for update;

  if not found then
    raise exception 'Invite not found';
  end if;
  if inv.from_user = me then
    raise exception 'Cannot accept your own invite';
  end if;
  if inv.status <> 'pending' then
    raise exception 'Invite is no longer pending';
  end if;

  left_id := least(inv.from_user, me);
  right_id := greatest(inv.from_user, me);

  if exists (
    select 1
    from public.friendships f
    where (f.user_a = left_id and f.user_b = right_id)
       or (f.user_a = right_id and f.user_b = left_id)
  ) then
    update public.friend_invites
      set status = 'accepted',
          accepted_by = me
    where id = inv.id
      and status = 'pending';
    return jsonb_build_object('ok', true, 'already_friends', true);
  end if;

  insert into public.friendships (user_a, user_b)
  values (left_id, right_id);

  update public.friend_invites
    set status = 'accepted',
        accepted_by = me
  where id = inv.id;

  return jsonb_build_object('ok', true, 'already_friends', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- upsert_user_records(records jsonb[])
-- Each element: { kind, id, data, updated_at, deleted_at }.
-- user_id is always auth.uid() — a record cannot name another user.
-- When the stored updated_at is strictly newer, the row is left alone.
-- Equal timestamps retry the write. A changed row gets a new rev.
-- ---------------------------------------------------------------------------

create or replace function public.upsert_user_records(records jsonb[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec jsonb;
  incoming timestamptz;
  existing timestamptz;
  kind_text text;
  id_text text;
  deleted timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if records is null then
    return;
  end if;

  foreach rec in array records loop
    kind_text := rec->>'kind';
    id_text := rec->>'id';
    if kind_text is null or id_text is null or rec->>'updated_at' is null then
      raise exception 'Record is missing kind, id, or updated_at';
    end if;
    incoming := (rec->>'updated_at')::timestamptz;
    if rec->>'deleted_at' is null or rec->>'deleted_at' = '' then
      deleted := null;
    else
      deleted := (rec->>'deleted_at')::timestamptz;
    end if;

    select r.updated_at
      into existing
    from public.user_records r
    where r.user_id = auth.uid()
      and r.kind = kind_text
      and r.id = id_text;

    if existing is not null and existing > incoming then
      continue;
    end if;

    insert into public.user_records as r (user_id, kind, id, data, updated_at, deleted_at, rev)
    values (
      auth.uid(),
      kind_text,
      id_text,
      coalesce(rec->'data', '{}'::jsonb),
      incoming,
      deleted,
      nextval('public.user_records_rev_seq')
    )
    on conflict (user_id, kind, id) do update
      set data = excluded.data,
          updated_at = excluded.updated_at,
          deleted_at = excluded.deleted_at,
          rev = nextval('public.user_records_rev_seq')
    where r.updated_at <= excluded.updated_at;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- grants
-- Live anon has no table privileges. The app sends the user JWT after sign-in.
-- ---------------------------------------------------------------------------

revoke all on function public.are_friends(uuid, uuid) from public;
revoke all on function public.accept_friend_invite(text) from public;
revoke all on function public.upsert_user_records(jsonb[]) from public;
revoke all on function public.chat_messages_read_only() from public;
revoke all on function public.program_shares_status_only() from public;

grant execute on function public.are_friends(uuid, uuid) to authenticated;
grant execute on function public.accept_friend_invite(text) to authenticated;
grant execute on function public.upsert_user_records(jsonb[]) to authenticated;
grant execute on function public.chat_messages_read_only() to authenticated;
grant execute on function public.program_shares_status_only() to authenticated;

grant select, insert, update on public.profiles to authenticated;
grant select on public.friendships to authenticated;
grant select, insert on public.friend_invites to authenticated;
grant select, insert, update on public.chat_messages to authenticated;
grant select, insert, update on public.program_shares to authenticated;
grant select, insert, update, delete on public.progress_posts to authenticated;
grant select, insert, update, delete on public.user_records to authenticated;
grant select, insert, delete on public.user_backups to authenticated;

grant usage, select on sequence public.user_records_rev_seq to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'chat_messages'
    ) then
      execute 'alter publication supabase_realtime add table public.chat_messages';
    end if;
  end if;
end;
$$;
