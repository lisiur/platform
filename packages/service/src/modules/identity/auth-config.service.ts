import { setSessionMaxAgeSeconds } from "#lib/session";
import { getMergedConfigRows } from "#modules/system/public";

const DEFAULT_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

/**
 * Loads `auth`-group defaults into the session module. Resolves
 * `session.maxAge` (in seconds) with DB-authoritative / env-fallback semantics
 * (`AUTH_SESSION_MAX_AGE`). Falls back to the 7-day default when unset/invalid.
 */
export async function loadAuthDefaults(): Promise<void> {
  const map = new Map(
    (await getMergedConfigRows("auth")).map((r) => [r.key, r.value]),
  );
  const raw = Number(map.get("session.maxAge"));
  setSessionMaxAgeSeconds(
    Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_SESSION_MAX_AGE_SECONDS,
  );
}

/** Re-resolves auth defaults after the `auth` config group is updated. */
export function reloadAuthDefaults(): Promise<void> {
  return loadAuthDefaults();
}
