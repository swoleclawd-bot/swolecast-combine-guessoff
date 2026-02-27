import { put, list, del } from '@vercel/blob';
import type { LeaderboardData } from './leaderboard.js';

const BLOB_PREFIX = 'leaderboard-';

export async function getLeaderboardData(): Promise<LeaderboardData> {
  try {
    // List all leaderboard blobs, get the most recent one
    const blobs = await list({ prefix: BLOB_PREFIX });
    if (blobs.blobs.length === 0) return { entries: [] };
    
    // Sort by uploadedAt descending to get the latest
    const sorted = blobs.blobs.sort((a, b) => 
      new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    );
    const latest = sorted[0];
    
    const res = await fetch(latest.url, { cache: 'no-store' });
    if (!res.ok) return { entries: [] };
    return (await res.json()) as LeaderboardData;
  } catch (e) {
    console.error('getLeaderboardData error:', e);
    return { entries: [] };
  }
}

export async function saveLeaderboardData(data: LeaderboardData): Promise<string> {
  // Write with a unique name (timestamp) so CDN cache is irrelevant
  const blobName = `${BLOB_PREFIX}${Date.now()}.json`;
  const result = await put(blobName, JSON.stringify(data), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
  });
  
  // Clean up old blobs (keep only the latest 2)
  try {
    const blobs = await list({ prefix: BLOB_PREFIX });
    const sorted = blobs.blobs.sort((a, b) => 
      new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    );
    const toDelete = sorted.slice(2);
    if (toDelete.length > 0) {
      await del(toDelete.map(b => b.url));
    }
  } catch {
    // Cleanup failure is non-critical
  }
  
  return result.url;
}
