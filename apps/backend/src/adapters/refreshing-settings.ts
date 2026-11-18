/**
 * The settings port over any source (local file, Parameter Store): read at start, then again at most once per
 * `maxAgeMs`, so a change such as the maintenance switch takes effect within a minute without a restart.
 * If a refresh fails, the last values stay in use and the next request tries again.
 */
import type { Clock, Settings, SettingsValues } from "../ports/index.js";

export const SETTINGS_MAX_AGE_MS = 60_000;

export function refreshingSettings(load: () => Promise<SettingsValues>, clock: Clock, maxAgeMs = SETTINGS_MAX_AGE_MS): Settings {
  let current: SettingsValues | undefined;
  let loadedAt = 0;
  let pending: Promise<SettingsValues> | undefined;

  const refresh = () =>
    (pending ??= load()
      .then((v) => {
        current = v;
        loadedAt = clock.now();
        return v;
      })
      .catch((e: unknown) => {
        if (!current) throw e;
        loadedAt = clock.now() - maxAgeMs; // keep the old values, try again on the next request
        return current;
      })
      .finally(() => {
        pending = undefined;
      }));

  return {
    get: async () => (current && clock.now() - loadedAt < maxAgeMs ? current : refresh()),
  };
}
