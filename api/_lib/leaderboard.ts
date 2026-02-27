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

export interface LeaderboardData {
  entries: StoredLeaderboardEntry[];
}

export function isStoredGameMode(value: string): value is StoredGameMode {
  return VALID_GAME_MODES.includes(value as StoredGameMode);
}

export function isReadGameMode(value: string): value is ReadGameMode {
  return value === 'all' || isStoredGameMode(value);
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

export function createEntry(playerName: string, gameMode: StoredGameMode, score: number): StoredLeaderboardEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    playerName,
    gameMode,
    score,
    date: new Date().toISOString(),
  };
}
