import { put, head } from '@vercel/blob';
import type { LeaderboardData } from './leaderboard.js';

const BLOB_NAME = 'leaderboard.json';

export async function getLeaderboardData(): Promise<LeaderboardData> {
  try {
    // Use head to get current blob metadata, then fetch with cache-busting
    const meta = await head(BLOB_NAME);
    if (!meta) return { entries: [] };
    const res = await fetch(meta.url + '?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return { entries: [] };
    return (await res.json()) as LeaderboardData;
  } catch {
    return { entries: [] };
  }
}

export async function saveLeaderboardData(data: LeaderboardData): Promise<void> {
  await put(BLOB_NAME, JSON.stringify(data), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    cacheControlMaxAge: 0,
  });
}
