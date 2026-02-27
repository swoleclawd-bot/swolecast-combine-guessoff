import { kv } from '@vercel/kv';
import { MAX_LEADERBOARD_ENTRIES, getLeaderboardKey, isReadGameMode, parseStoredEntry } from './_lib/leaderboard';

type RequestLike = {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
};

type ResponseLike = {
  status: (statusCode: number) => ResponseLike;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

export default async function handler(req: RequestLike, res: ResponseLike): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const rawMode = req.query?.mode;
  const mode = Array.isArray(rawMode) ? rawMode[0] : rawMode || 'all';

  if (!isReadGameMode(mode)) {
    res.status(400).json({ error: 'Invalid mode' });
    return;
  }

  const key = getLeaderboardKey(mode);
  const values = await kv.zrange<string[]>(key, 0, MAX_LEADERBOARD_ENTRIES - 1, { rev: true });

  const scores = values
    .map(parseStoredEntry)
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .map((entry, index) => ({
      playerName: entry.playerName,
      score: entry.score,
      date: entry.date,
      gameMode: entry.gameMode,
      rank: index + 1,
    }));

  res.status(200).json({ scores });
}
