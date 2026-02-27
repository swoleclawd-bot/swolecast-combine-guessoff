import { list, getDownloadUrl } from '@vercel/blob';
import type { LeaderboardData, StoredLeaderboardEntry } from './_lib/leaderboard.js';
import { isReadGameMode } from './_lib/leaderboard.js';

import type { VercelRequest, VercelResponse } from '@vercel/node';

const BLOB_NAME = 'leaderboard.json';

async function getLeaderboardData(): Promise<LeaderboardData> {
  try {
    const blobs = await list({ prefix: BLOB_NAME });
    const blob = blobs.blobs.find(b => b.pathname === BLOB_NAME);
    if (!blob) return { entries: [] };
    const res = await fetch(blob.downloadUrl || getDownloadUrl(blob.url));
    return (await res.json()) as LeaderboardData;
  } catch {
    return { entries: [] };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const rawMode = req.query?.mode;
  const mode = Array.isArray(rawMode) ? rawMode[0] : rawMode || 'all';

  if (!mode || !isReadGameMode(mode)) {
    res.status(400).json({ error: 'Invalid mode' });
    return;
  }

  const data = await getLeaderboardData();
  
  let filtered: StoredLeaderboardEntry[];
  if (mode === 'all') {
    filtered = data.entries;
  } else {
    filtered = data.entries.filter(e => e.gameMode === mode);
  }

  // Sort by score descending, take top 50
  filtered.sort((a, b) => b.score - a.score);
  filtered = filtered.slice(0, 50);

  const scores = filtered.map((entry, index) => ({
    playerName: entry.playerName,
    score: entry.score,
    date: entry.date,
    gameMode: entry.gameMode,
    rank: index + 1,
  }));

  res.status(200).json({ scores });
}
