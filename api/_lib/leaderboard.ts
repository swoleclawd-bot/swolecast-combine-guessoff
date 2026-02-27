export const MAX_LEADERBOARD_ENTRIES = 50;

export const VALID_GAME_MODES = [
  'speedsort',
  'benchsort',
  'draftsort',
  'schoolmatch',
  'quick',
  'endless',
  'positionchallenge',
] as const;

export type StoredGameMode = (typeof VALID_GAME_MODES)[number];
export type ReadGameMode = StoredGameMode | 'all';

export interface StoredLeaderboardEntry {
  id: string;
  playerName: string;
  gameMode: StoredGameMode;
  score: number;
  date: string;
}

export function isStoredGameMode(value: string): value is StoredGameMode {
  return VALID_GAME_MODES.includes(value as StoredGameMode);
}

export function isReadGameMode(value: string): value is ReadGameMode {
  return value === 'all' || isStoredGameMode(value);
}

export function getLeaderboardKey(mode: ReadGameMode): string {
  return `leaderboard:${mode}`;
}

export function sanitizePlayerName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 20) return null;
  return trimmed;
}

export function sanitizeScore(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.round(value));
}

export function parseStoredEntry(value: unknown): StoredLeaderboardEntry | null {
  if (!value || typeof value !== 'string') return null;

  try {
    const parsed = JSON.parse(value) as Partial<StoredLeaderboardEntry>;
    if (
      typeof parsed.id !== 'string' ||
      typeof parsed.playerName !== 'string' ||
      typeof parsed.gameMode !== 'string' ||
      typeof parsed.score !== 'number' ||
      typeof parsed.date !== 'string' ||
      !isStoredGameMode(parsed.gameMode)
    ) {
      return null;
    }

    return {
      id: parsed.id,
      playerName: parsed.playerName,
      gameMode: parsed.gameMode,
      score: parsed.score,
      date: parsed.date,
    };
  } catch {
    return null;
  }
}

export function createStoredEntry(playerName: string, gameMode: StoredGameMode, score: number): StoredLeaderboardEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    playerName,
    gameMode,
    score,
    date: new Date().toISOString(),
  };
}
