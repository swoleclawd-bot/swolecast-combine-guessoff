import { kv } from '@vercel/kv';
import {
  MAX_LEADERBOARD_ENTRIES,
  createStoredEntry,
  getLeaderboardKey,
  isStoredGameMode,
  sanitizePlayerName,
  sanitizeScore,
} from './_lib/leaderboard.js';

type RequestLike = {
  method?: string;
  body?: unknown;
};

type ResponseLike = {
  status: (statusCode: number) => ResponseLike;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

async function trimSortedSet(key: string): Promise<void> {
  const total = await kv.zcard(key);
  if (total <= MAX_LEADERBOARD_ENTRIES) return;

  const stop = total - MAX_LEADERBOARD_ENTRIES - 1;
  await kv.zremrangebyrank(key, 0, stop);
}

export default async function handler(req: RequestLike, res: ResponseLike): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const parsedBody =
    typeof req.body === 'string'
      ? (() => {
          try {
            return JSON.parse(req.body) as unknown;
          } catch {
            return {};
          }
        })()
      : req.body;

  const body = (parsedBody && typeof parsedBody === 'object' ? parsedBody : {}) as {
    playerName?: unknown;
    gameMode?: unknown;
    score?: unknown;
  };

  const playerName = sanitizePlayerName(body.playerName);
  const score = sanitizeScore(body.score);
  const rawMode = typeof body.gameMode === 'string' ? body.gameMode : '';

  if (!playerName) {
    res.status(400).json({ error: 'Invalid playerName (required, max 20 chars)' });
    return;
  }

  if (score === null) {
    res.status(400).json({ error: 'Invalid score' });
    return;
  }

  if (!isStoredGameMode(rawMode)) {
    res.status(400).json({ error: 'Invalid gameMode' });
    return;
  }

  const entry = createStoredEntry(playerName, rawMode, score);
  const member = JSON.stringify(entry);

  const modeKey = getLeaderboardKey(rawMode);
  const allKey = getLeaderboardKey('all');

  await Promise.all([
    kv.zadd(modeKey, { score: entry.score, member }),
    kv.zadd(allKey, { score: entry.score, member }),
  ]);

  await Promise.all([trimSortedSet(modeKey), trimSortedSet(allKey)]);

  res.status(200).json({ ok: true, entry });
}
