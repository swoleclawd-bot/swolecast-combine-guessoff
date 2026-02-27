import { put, list } from '@vercel/blob';
import type { LeaderboardData } from './leaderboard.js';

const BLOB_NAME = 'leaderboard.json';

export async function getLeaderboardData(): Promise<LeaderboardData> {
  try {
    // Use list() to get metadata, then download directly with no-store
    const blobs = await list({ prefix: BLOB_NAME, limit: 1 });
    const blob = blobs.blobs.find(b => b.pathname === BLOB_NAME);
    if (!blob) return { entries: [] };
    
    // Use downloadUrl which bypasses CDN caching
    const dlUrl = blob.downloadUrl + '&_=' + Date.now();
    const res = await fetch(dlUrl, { cache: 'no-store' });
    if (!res.ok) return { entries: [] };
    return (await res.json()) as LeaderboardData;
  } catch (e) {
    console.error('getLeaderboardData error:', e);
    return { entries: [] };
  }
}

export async function saveLeaderboardData(data: LeaderboardData): Promise<string> {
  const result = await put(BLOB_NAME, JSON.stringify(data), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    cacheControlMaxAge: 0,
  });
  return result.url;
}
