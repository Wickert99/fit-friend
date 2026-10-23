# Deploy Whoop heart rate

Fit Friend talks to Whoop only through the `whoop` Edge Function. The browser never sees `WHOOP_CLIENT_SECRET`. Do not put that secret in `.env`, GitHub Actions, or the Vite build.

This repo does not apply the migration or deploy the function. Run the steps below against project `ghdioggstszbtykmlgis` after `supabase login`.

The app keeps working if you skip this. Completed workouts still save on the device, and the Whoop card explains that heart rate is not available.

## 1. Register the redirect in the Whoop dashboard

In the app at [developer.whoop.com](https://developer.whoop.com), set:

- Redirect URI (exact, including `.html`):

  `https://wickert99.github.io/fit-friend/whoop-callback.html`

- Scopes:

  `read:workout` `read:recovery` `read:cycles` `offline`

`offline` is what issues the refresh token. GitHub Pages serves `public/whoop-callback.html` at that URL. The page sends `code` and `state` into the hash `#/whoop-callback` so they are not confused with a Supabase magic-link `?code=`. The service worker does not cache that page as the offline app shell.

Optional, only if you also connect from the local dev server:

`http://127.0.0.1:41731/whoop-callback.html`

## 2. Set function secrets

From the repo root:

```bash
supabase link --project-ref ghdioggstszbtykmlgis

supabase secrets set --project-ref ghdioggstszbtykmlgis \
  WHOOP_CLIENT_ID="paste-the-client-id" \
  WHOOP_CLIENT_SECRET="paste-the-client-secret"
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are already provided to Edge Functions. Do not paste the client secret into a command you commit, and do not add it to the frontend `VITE_` variables.

## 3. Deploy the function

```bash
supabase functions deploy whoop --project-ref ghdioggstszbtykmlgis
```

Leave JWT verification on (the CLI default). Do not pass `--no-verify-jwt`. The function checks the signed-in user again and writes tokens with the service role.

Whoop returns 403 for a Python-like User-Agent. The function sends `FitFriend/1.0` on the token request and on `GET /developer/v2/activity/workout`.

## 4. Apply only the new migration

`supabase/migrations/20261015120000_inferred_social_sync.sql` is a review copy of tables that already exist. Do not run it again.

Apply `supabase/migrations/20261023190000_whoop_tokens.sql` only. It creates `whoop_tokens` and `whoop_oauth_states`.

```bash
supabase db query --linked -f supabase/migrations/20261023190000_whoop_tokens.sql
```

If this CLI has no `db query` command, open the Supabase SQL editor for `ghdioggstszbtykmlgis`, paste that file, and run it.

New tables in `public` need explicit grants (Supabase change effective 30 Oct 2026). The migration:

- grants `select, insert, update, delete` on both tables to `service_role`
- revokes those tables from `public`, `anon`, and `authenticated`
- turns on row level security and forces it, with no policies

`anon` and `authenticated` cannot read tokens through the Data API. The Edge Function uses the service role, which bypasses RLS.

Check the grants after it runs:

```sql
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('whoop_tokens', 'whoop_oauth_states')
order by table_name, grantee, privilege_type;
```

`service_role` should be listed. `anon` and `authenticated` should not.

## 5. Try it

1. Open https://wickert99.github.io/fit-friend/#/friends and sign in.
2. Tap **Connect Whoop** and approve the scopes.
3. Whoop should return to the Friends tab with “Whoop is connected.”
4. Open a completed workout whose start and finish overlap a Whoop workout. The session shows average heart rate, max heart rate, time in zones, and strain when Whoop scored it.
5. A session with no overlapping Whoop workout, or an account that is not connected, shows a short empty state. The workout log itself is unchanged.

On a Bristol Method session, time in the 80–85% max-heart-rate band is highlighted only when it can be derived (a zone that is exactly that band, or heart-rate samples plus a known max heart rate). Whoop’s normal zones are 10% wide, so zone 4 (80–90%) is labeled as zone 4 and is not presented as the 80–85% band.
