/** Current localStorage document. Legacy blobs live on the v1–v4 keys and migrate on load. */
export const STATE_KEY = 'fit-friend-v5'
export const CATALOG_KEY = 'fit-friend-v5-catalog'
export const PREMIGRATE_KEY = 'fit-friend-v5-premigrate'
export const SEED_VERSION_KEY = 'fit-friend-seed-version'
export const FORMAT_KEY = 'fit-friend-storage-format'
export const CORRUPT_PREFIX = 'fit-friend-corrupt-'
export const FOCUS_MUTED_KEY = 'fit-friend-focus-muted'
export const HOT_DB_NAME = 'fit-friend-hot'
export const HOT_DB_VERSION = 2

export const SYNC_KEYS = {
  state: 'fit-friend-sync-v1',
  outbox: 'fit-friend-sync-outbox-v1',
  clock: 'fit-friend-sync-clock-v1',
  gen: 'fit-friend-sync-gen-v1',
  force: 'fit-friend-sync-force-v1',
  status: 'fit-friend-sync-status-v1',
  leader: 'fit-friend-sync-leader',
  channel: 'fit-friend-sync',
} as const

export const PENDING_INVITE_KEY = 'fitfriend.pendingInvite'
export const POST_AUTH_NAV_KEY = 'fitfriend.postAuthNav'

export const LEGACY_STATE_KEYS = [
  'fit-friend-v4',
  'fit-friend-v3',
  'fit-friend-v2',
  'fit-friend-v1',
] as const

/** Bump when the on-disk shape changes. Migrations in migrate.ts run up to this. */
export const FORMAT_VERSION = 3

/**
 * Catalog stamp. A mismatch merges bundled exercises and program templates into the
 * library already saved on the device, without wiping logs or programs the person owns.
 * Bump this whenever a built-in template or exercise is added or edited. A phone that
 * already saved the previous stamp will otherwise keep that older library forever.
 */
export const SEED_VERSION = '2026-10-23.1'

export const HOT_SEQ_FIELD = '__hotSeq'
