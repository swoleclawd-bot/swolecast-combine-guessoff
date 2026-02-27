import { put } from '@vercel/blob';
import type { LeaderboardData } from './leaderboard.js';

const BLOB_NAME = 'leaderboard.json';
// Stable blob URL — doesn't change since we use addRandomSuffix: false
const BLOB_BASE_URL = 'https://jjegmhibiqvzgfu2.public.blob.vercel-storage.com/leaderboard.json';

export async function getLeaderboardData(): Promise<LeaderboardData> {
  try {
    const res = await fetch(BLOB_BASE_URL + '?download=1&_=' + Date.now(), { 
      cache: 'no-store',
    });
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
