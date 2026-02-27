import { list, put } from '@vercel/blob';
import type { LeaderboardData } from './_lib/leaderboard.js';
import { isStoredGameMode, sanitizePlayerName, sanitizeScore, createEntry, MAX_LEADERBOARD_ENTRIES } from './_lib/leaderboard.js';

import type { VercelRequest, VercelResponse } from '@vercel/node';

const BLOB_NAME = 'leaderboard.json';

async function getLeaderboardData(): Promise<LeaderboardData> {
  try {
    const blobs = await list({ prefix: BLOB_NAME });
    const blob = blobs.blobs.find(b => b.pathname === BLOB_NAME);
    if (!blob) return { entries: [] };
    const res = await fetch(blob.url);
    return (await res.json()) as LeaderboardData;
  } catch {
    return { entries: [] };
  }
}

async function saveLeaderboardData(data: LeaderboardData): Promise<void> {
  await put(BLOB_NAME, JSON.stringify(data), {
    access: 'public',
    addRandomSuffix: false,
    contentType: 'application/json',
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const body = req.body as Record<string, unknown> | undefined;
    if (!body) {
      res.status(400).json({ error: 'Missing body' });
      return;
    }

    const playerName = sanitizePlayerName(body.playerName);
    if (!playerName) {
      res.status(400).json({ error: 'Invalid playerName (1-20 chars)' });
      return;
    }

    const gameMode = typeof body.gameMode === 'string' ? body.gameMode : '';
    if (!isStoredGameMode(gameMode)) {
      res.status(400).json({ error: 'Invalid gameMode' });
      return;
    }

    const score = sanitizeScore(body.score);
    if (score === null) {
      res.status(400).json({ error: 'Invalid score' });
      return;
    }

    const data = await getLeaderboardData();
    const entry = createEntry(playerName, gameMode, score);
    data.entries.push(entry);

    // Keep only top entries per mode to prevent unbounded growth
    const byMode = new Map<string, typeof data.entries>();
    for (const e of data.entries) {
      const arr = byMode.get(e.gameMode) || [];
      arr.push(e);
      byMode.set(e.gameMode, arr);
    }
    
    const trimmed: typeof data.entries = [];
    for (const [, entries] of byMode) {
      entries.sort((a, b) => b.score - a.score);
      trimmed.push(...entries.slice(0, MAX_LEADERBOARD_ENTRIES));
    }
    data.entries = trimmed;

    await saveLeaderboardData(data);

    // Calculate rank
    const modeEntries = trimmed.filter(e => e.gameMode === gameMode);
    modeEntries.sort((a, b) => b.score - a.score);
    const rank = modeEntries.findIndex(e => e.id === entry.id) + 1;

    res.status(200).json({ success: true, rank, entry });
  } catch (err) {
    console.error('Leaderboard submit error:', err);
    res.status(500).json({ error: 'Internal server error', detail: String(err) });
  }
}
