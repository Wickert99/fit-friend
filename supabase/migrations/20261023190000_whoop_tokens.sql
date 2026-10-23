-- Whoop OAuth tokens for Fit Friend.
--
-- APPLY this file to https://ghdioggstszbtykmlgis.supabase.co (SQL editor or
-- `supabase db query`). It creates new tables. Do not re-run
-- 20261015120000_inferred_social_sync.sql — that file only reconstructs
-- tables that already exist.
--
-- The browser never reads these rows. The `whoop` Edge Function uses the
-- service role. anon and authenticated have no grants and no policies.
--
-- Supabase change effective 30 Oct 2026: new tables in `public` are not
-- granted to anon, authenticated, or service_role automatically. Grant
-- service_role explicitly. Revoke anon and authenticated even if an older
-- default privilege still adds them.

-- ---------------------------------------------------------------------------
-- whoop_tokens
-- One row per auth user. Access and refresh tokens stay server-side.
-- ---------------------------------------------------------------------------

create table public.whoop_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  scope text,
  token_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whoop_tokens_access_nonempty check (char_length(access_token) > 0),
  constraint whoop_tokens_refresh_nonempty check (char_length(refresh_token) > 0)
);

alter table public.whoop_tokens enable row level security;
alter table public.whoop_tokens force row level security;

-- No policies. Roles that do not bypass RLS cannot read or write tokens.

revoke all on table public.whoop_tokens from public;
revoke all on table public.whoop_tokens from anon;
revoke all on table public.whoop_tokens from authenticated;

grant select, insert, update, delete on table public.whoop_tokens to service_role;

-- ---------------------------------------------------------------------------
-- whoop_oauth_states
-- Short-lived OAuth state for the signed-in user who started Connect Whoop.
-- The edge function deletes a row when it exchanges the code.
-- ---------------------------------------------------------------------------

create table public.whoop_oauth_states (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state text not null,
  redirect_uri text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint whoop_oauth_states_state_nonempty check (char_length(state) >= 16),
  constraint whoop_oauth_states_redirect_nonempty check (char_length(redirect_uri) > 0)
);

alter table public.whoop_oauth_states enable row level security;
alter table public.whoop_oauth_states force row level security;

revoke all on table public.whoop_oauth_states from public;
revoke all on table public.whoop_oauth_states from anon;
revoke all on table public.whoop_oauth_states from authenticated;

grant select, insert, update, delete on table public.whoop_oauth_states to service_role;
