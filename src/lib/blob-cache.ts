import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const CACHE_DIR = path.join(process.cwd(), ".blob-cache");
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

type CacheEntry<T> = {
  updatedAt: string;
  value: T;
};

const inFlight = new Map<string, Promise<unknown>>();

function cachePath(key: string) {
  const safeKey = key.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return path.join(CACHE_DIR, `${safeKey}.json`);
}

function isFresh(updatedAt: string) {
  const timestamp = Date.parse(updatedAt);

  if (!Number.isFinite(timestamp)) {
    return false;
  }

  return Date.now() - timestamp < WEEK_MS;
}

async function readCache<T>(key: string) {
  try {
    const raw = await readFile(cachePath(key), "utf8");
    const parsed = JSON.parse(raw) as CacheEntry<T>;

    if (!parsed || typeof parsed !== "object" || !("updatedAt" in parsed) || !("value" in parsed)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

async function writeCache<T>(key: string, value: T) {
  const entry: CacheEntry<T> = {
    updatedAt: new Date().toISOString(),
    value,
  };

  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(cachePath(key), JSON.stringify(entry, null, 2), "utf8");
}

async function writeCsvCache(key: string, csv: string) {
  const safeKey = key.replace(/[^a-zA-Z0-9._-]+/g, "_");

  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(path.join(CACHE_DIR, `${safeKey}.csv`), csv, "utf8");
}

export async function withWeeklyBlobCache<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const cached = await readCache<T>(key);

  if (cached && isFresh(cached.updatedAt)) {
    return cached.value;
  }

  const existing = inFlight.get(key) as Promise<T> | undefined;

  if (existing) {
    return existing;
  }

  const nextLoad = (async () => {
    try {
      const value = await loader();
      await writeCache(key, value);
      return value;
    } catch (error) {
      if (cached) {
        console.error(`[blob-cache] loader failed for "${key}", serving stale cache from ${cached.updatedAt}:`, error);
        return cached.value;
      }

      throw error;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, nextLoad);
  return nextLoad;
}

export async function withWeeklyBlobArtifacts<T>(
  key: string,
  loader: () => Promise<{ value: T; csv: string }>,
): Promise<T> {
  const cached = await readCache<T>(key);

  if (cached && isFresh(cached.updatedAt)) {
    return cached.value;
  }

  const existing = inFlight.get(key) as Promise<T> | undefined;

  if (existing) {
    return existing;
  }

  const nextLoad = (async () => {
    try {
      const result = await loader();
      await writeCache(key, result.value);
      await writeCsvCache(key, result.csv);
      return result.value;
    } catch (error) {
      if (cached) {
        console.error(`[blob-cache] loader failed for "${key}", serving stale cache from ${cached.updatedAt}:`, error);
        return cached.value;
      }

      throw error;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, nextLoad);
  return nextLoad;
}
