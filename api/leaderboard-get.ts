import type { StoredLeaderboardEntry } from './_lib/leaderboard.js';
import { isReadGameMode } from './_lib/leaderboard.js';
import { getLeaderboardData } from './_lib/blob-store.js';

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
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

  try {
    const data = await getLeaderboardData();
    
    let filtered: StoredLeaderboardEntry[];
    if (mode === 'all') {
      filtered = data.entries;
    } else {
      filtered = data.entries.filter(e => e.gameMode === mode);
    }

    filtered.sort((a, b) => b.score - a.score);
    filtered = filtered.slice(0, 25);

    const scores = filtered.map((entry, index) => ({
      playerName: entry.playerName,
      score: entry.score,
      date: entry.date,
      gameMode: entry.gameMode,
      rank: index + 1,
    }));

    res.status(200).json({ scores });
  } catch (err) {
    console.error('Leaderboard get error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
