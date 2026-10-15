# Fit Friend

Phone-first strength and conditioning app. Plan a block, log the session, and keep the library on the device when you are offline. This repository is the foundation rebuild: design system, hash routing, local storage, and the screen shell. Later packages fill in the library, workouts, plans, progress, and friends.

## Run

```bash
npm install
npm run dev
```

The dev server is [http://127.0.0.1:41731](http://127.0.0.1:41731). Open `#/today`.

```bash
npm test
npm run build
npm run preview
```

`npm run build` typechecks, bundles, and injects the service-worker precache list into `dist/sw.js`.

## Local only, unless you opt into Supabase

With no `.env`, the app never opens a Supabase connection. Copy `.env.example` to `.env` to configure the client recovered from the original project (`ghdioggstszbtykmlgis`). Auth, chat, and sync are not in this package.

## Data

Seed JSON lives in `data/` (exercises, programs, lift families, muscles, set types). Exercise photos are in `public/exercise-images/`. Fonts and the original PWA icons are in `public/`. The first launch writes `fit-friend-v5` plus a catalog document. Older `fit-friend-v1` … `v4` blobs are migrated on load.

## Layout

`src/app` is the shell and the route registry. `src/ui` is the kit. `src/store` is persistence and `useStore()`. `src/types.ts` is the shared model. `src/lib/supabase` is the optional client. Feature screens beyond the placeholders are not here yet — see `CONTRIBUTING.md`.
