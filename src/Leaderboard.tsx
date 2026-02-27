import { useEffect, useMemo, useState } from 'react';

export type LeaderboardGameMode =
  | 'Speed Sort'
  | 'Bench Sort'
  | 'Draft Sort'
  | 'School Match'
  | 'Quick Round'
  | 'Endless'
  | 'Position Challenge';

export interface LeaderboardEntry {
  id: string;
  playerName: string;
  gameMode: LeaderboardGameMode;
  score: number;
  date: string;
}

const LEADERBOARD_KEY = 'swolecast-leaderboard';
const PLAYER_NAME_KEY = 'swolecast-player-name';

const GAME_MODE_TABS: Array<'All Games' | LeaderboardGameMode> = [
  'All Games',
  'Speed Sort',
  'Bench Sort',
  'Draft Sort',
  'School Match',
  'Quick Round',
  'Endless',
  'Position Challenge',
];

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

export function getPlayerName(): string {
  if (!isBrowser()) return 'Player';
  return localStorage.getItem(PLAYER_NAME_KEY) || 'Player';
}

export function setPlayerName(name: string): string {
  const trimmed = name.trim() || 'Player';
  if (isBrowser()) {
    localStorage.setItem(PLAYER_NAME_KEY, trimmed);
  }
  return trimmed;
}

export function ensurePlayerName(): string {
  if (!isBrowser()) return 'Player';
  const existing = localStorage.getItem(PLAYER_NAME_KEY);
  if (existing && existing.trim()) return existing;
  const entered = window.prompt('Enter your player name for the leaderboard:', 'Player') || 'Player';
  return setPlayerName(entered);
}

export function normalizeGameMode(mode: string): LeaderboardGameMode {
  if (mode === 'Speed Sort') return 'Speed Sort';
  if (mode === 'Bench Sort') return 'Bench Sort';
  if (mode === 'Draft Sort') return 'Draft Sort';
  if (mode === 'School Match') return 'School Match';
  if (mode === 'Quick Round') return 'Quick Round';
  if (mode === 'Endless') return 'Endless';
  return 'Position Challenge';
}

export function readLeaderboard(): LeaderboardEntry[] {
  if (!isBrowser()) return [];
  const raw = localStorage.getItem(LEADERBOARD_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as LeaderboardEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((e) =>
      e &&
      typeof e.id === 'string' &&
      typeof e.playerName === 'string' &&
      typeof e.gameMode === 'string' &&
      typeof e.score === 'number' &&
      typeof e.date === 'string'
    );
  } catch {
    return [];
  }
}

function writeLeaderboard(entries: LeaderboardEntry[]): void {
  if (!isBrowser()) return;
  localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(entries));
}

export function rankForEntry(entries: LeaderboardEntry[], entry: LeaderboardEntry): number {
  const scoped = entries
    .filter((e) => e.gameMode === entry.gameMode)
    .sort((a, b) => b.score - a.score || new Date(a.date).getTime() - new Date(b.date).getTime());
  return scoped.findIndex((e) => e.id === entry.id) + 1;
}

export function recordLeaderboardScore(gameMode: LeaderboardGameMode, score: number): LeaderboardEntry {
  const playerName = ensurePlayerName();
  const entry: LeaderboardEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    playerName,
    gameMode,
    score,
    date: new Date().toISOString(),
  };
  const entries = readLeaderboard();
  entries.push(entry);
  writeLeaderboard(entries);
  return entry;
}

interface LeaderboardProps {
  compact?: boolean;
  mode?: 'All Games' | LeaderboardGameMode;
  currentEntryId?: string | null;
  title?: string;
}

export default function Leaderboard({ compact = false, mode, currentEntryId, title }: LeaderboardProps) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'All Games' | LeaderboardGameMode>(mode || 'All Games');
  const [playerName, setPlayerNameState] = useState('Player');

  useEffect(() => {
    setEntries(readLeaderboard());
    setPlayerNameState(getPlayerName());
  }, []);

  useEffect(() => {
    if (mode) setActiveTab(mode);
  }, [mode]);

  const sortedAll = useMemo(
    () => [...entries].sort((a, b) => b.score - a.score || new Date(b.date).getTime() - new Date(a.date).getTime()),
    [entries]
  );

  const list = useMemo(() => {
    const source = activeTab === 'All Games' ? sortedAll : sortedAll.filter((e) => e.gameMode === activeTab);
    return source.slice(0, 10);
  }, [activeTab, sortedAll]);

  const currentEntry = useMemo(() => entries.find((e) => e.id === currentEntryId) || null, [entries, currentEntryId]);
  const currentRank = useMemo(() => {
    if (!currentEntry) return null;
    return rankForEntry(entries, currentEntry);
  }, [entries, currentEntry]);

  const handleRename = () => {
    const entered = window.prompt('Change player name:', playerName) || playerName;
    const saved = setPlayerName(entered);
    setPlayerNameState(saved);
  };

  return (
    <div className="w-full bg-card/90 border border-primary/30 rounded-2xl p-4 lg:p-6">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-xl lg:text-2xl font-black text-highlight">{title || 'Leaderboard'}</h3>
        <button
          onClick={handleRename}
          className="px-3 py-1.5 rounded-lg border border-accent/40 text-xs lg:text-sm font-bold text-accent hover:bg-accent/10 min-h-[36px]"
        >
          {playerName} · Change
        </button>
      </div>

      {!compact && (
        <div className="flex flex-wrap gap-2 mb-3">
          {GAME_MODE_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border min-h-[34px] ${
                activeTab === tab
                  ? 'bg-primary/20 border-primary text-white'
                  : 'bg-bg/40 border-gray-700 text-gray-400 hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      )}

      {currentEntry && (
        <div className="mb-3 rounded-lg border border-cyan-400/40 bg-cyan-500/10 p-2 text-sm">
          <span className="font-bold text-cyan-300">Your latest {currentEntry.gameMode} score:</span>{' '}
          <span className="text-white">{currentEntry.score}</span>
          {currentRank ? <span className="text-cyan-300"> · Rank #{currentRank}</span> : null}
        </div>
      )}

      <div className="space-y-2">
        {list.length === 0 ? (
          <div className="text-gray-500 text-sm">No scores yet. Finish a game to set the board.</div>
        ) : (
          list.map((entry, i) => {
            const isTop = i < 3;
            const isCurrent = entry.id === currentEntryId;
            return (
              <div
                key={entry.id}
                className={`rounded-lg border px-3 py-2 flex items-center justify-between text-sm lg:text-base ${
                  isCurrent
                    ? 'border-cyan-400 bg-cyan-500/10'
                    : isTop
                      ? 'border-highlight/50 bg-highlight/10'
                      : 'border-gray-700 bg-bg/40'
                }`}
              >
                <div className="min-w-0">
                  <div className={`font-bold truncate ${isTop ? 'text-highlight' : 'text-white'}`}>
                    #{i + 1} {entry.playerName}
                  </div>
                  <div className="text-xs text-gray-400 truncate">
                    {entry.gameMode} · {new Date(entry.date).toLocaleDateString()}
                  </div>
                </div>
                <div className="font-black text-lg text-accent">{entry.score}</div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
