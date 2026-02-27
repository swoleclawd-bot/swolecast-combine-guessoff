import { useCallback, useEffect, useMemo, useState } from 'react';

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
  rank?: number;
}

type LeaderboardTabMode = 'All Games' | LeaderboardGameMode;
type ApiGameMode = 'all' | 'speedsort' | 'benchsort' | 'draftsort' | 'schoolmatch' | 'quick' | 'endless' | 'positionchallenge';

interface LeaderboardApiScore {
  playerName: string;
  score: number;
  date: string;
  rank: number;
  gameMode?: ApiGameMode;
}

const LEADERBOARD_KEY = 'swolecast-leaderboard';
const PLAYER_NAME_KEY = 'swolecast-player-name';

const GAME_MODE_TABS: LeaderboardTabMode[] = [
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

function toApiGameMode(mode: LeaderboardTabMode): ApiGameMode {
  if (mode === 'All Games') return 'all';
  if (mode === 'Speed Sort') return 'speedsort';
  if (mode === 'Bench Sort') return 'benchsort';
  if (mode === 'Draft Sort') return 'draftsort';
  if (mode === 'School Match') return 'schoolmatch';
  if (mode === 'Quick Round') return 'quick';
  if (mode === 'Endless') return 'endless';
  return 'positionchallenge';
}

function fromApiGameMode(mode: string): LeaderboardGameMode {
  if (mode === 'speedsort') return 'Speed Sort';
  if (mode === 'benchsort') return 'Bench Sort';
  if (mode === 'draftsort') return 'Draft Sort';
  if (mode === 'schoolmatch') return 'School Match';
  if (mode === 'quick') return 'Quick Round';
  if (mode === 'endless') return 'Endless';
  return 'Position Challenge';
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
  return 'Player';
}

export function normalizeGameMode(mode: string): LeaderboardGameMode {
  if (mode === 'Speed Sort' || mode === 'speedsort') return 'Speed Sort';
  if (mode === 'Bench Sort' || mode === 'benchsort') return 'Bench Sort';
  if (mode === 'Draft Sort' || mode === 'draftsort') return 'Draft Sort';
  if (mode === 'School Match' || mode === 'schoolmatch') return 'School Match';
  if (mode === 'Quick Round' || mode === 'quick') return 'Quick Round';
  if (mode === 'Endless' || mode === 'endless') return 'Endless';
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

export async function submitLeaderboardScore(entry: LeaderboardEntry): Promise<boolean> {
  try {
    const res = await fetch('/api/leaderboard-submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerName: entry.playerName,
        gameMode: toApiGameMode(entry.gameMode),
        score: entry.score,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function fetchGlobalLeaderboard(mode: LeaderboardTabMode): Promise<LeaderboardEntry[]> {
  const response = await fetch(`/api/leaderboard-get?mode=${encodeURIComponent(toApiGameMode(mode))}`);
  if (!response.ok) {
    throw new Error(`Leaderboard fetch failed: ${response.status}`);
  }

  const payload = (await response.json()) as { scores?: LeaderboardApiScore[] };
  const scores = Array.isArray(payload.scores) ? payload.scores : [];

  return scores
    .filter((row) => typeof row.playerName === 'string' && typeof row.score === 'number' && typeof row.date === 'string')
    .map((row, index) => ({
      id: `${row.playerName}-${row.date}-${index}`,
      playerName: row.playerName,
      score: row.score,
      date: row.date,
      rank: row.rank,
      gameMode: row.gameMode ? fromApiGameMode(row.gameMode) : mode === 'All Games' ? 'Endless' : mode,
    }));
}

export function rankForEntry(entries: LeaderboardEntry[], entry: LeaderboardEntry): number {
  const scoped = entries
    .filter((e) => e.gameMode === entry.gameMode)
    .sort((a, b) => b.score - a.score || new Date(a.date).getTime() - new Date(b.date).getTime());
  return scoped.findIndex((e) => e.id === entry.id) + 1;
}

export async function recordLeaderboardScore(gameMode: LeaderboardGameMode, score: number): Promise<LeaderboardEntry> {
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
  await submitLeaderboardScore(entry);

  return entry;
}

interface LeaderboardProps {
  compact?: boolean;
  mode?: LeaderboardTabMode;
  currentEntryId?: string | null;
  title?: string;
  refreshKey?: number;
}

export default function Leaderboard({ compact = false, mode, currentEntryId, title, refreshKey }: LeaderboardProps) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [activeTab, setActiveTab] = useState<LeaderboardTabMode>(mode || 'All Games');
  const [playerName, setPlayerNameState] = useState('Player');
  const [loading, setLoading] = useState(true);

  const loadLeaderboard = useCallback(async (tab: LeaderboardTabMode) => {
    setLoading(true);
    try {
      const globalEntries = await fetchGlobalLeaderboard(tab);
      setEntries(globalEntries);
    } catch {
      setEntries(readLeaderboard());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setPlayerNameState(getPlayerName());
  }, []);

  useEffect(() => {
    if (mode) {
      setActiveTab(mode);
    }
  }, [mode]);

  useEffect(() => {
    void loadLeaderboard(activeTab);
  }, [activeTab, loadLeaderboard, refreshKey]);

  const sortedAll = useMemo(
    () => [...entries].sort((a, b) => b.score - a.score || new Date(b.date).getTime() - new Date(a.date).getTime()),
    [entries]
  );

  const list = useMemo(() => {
    const source = activeTab === 'All Games' ? sortedAll : sortedAll.filter((e) => e.gameMode === activeTab);
    return source.slice(0, 50);
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
        <h3 className="text-xl lg:text-2xl font-black text-highlight">{title || '🌐 Global Leaderboard'}</h3>
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
        {loading ? (
          <div className="text-gray-500 text-sm">Loading global scores...</div>
        ) : list.length === 0 ? (
          <div className="text-gray-500 text-sm">No scores yet. Finish a game to set the board.</div>
        ) : (
          list.map((entry, i) => {
            const displayedRank = entry.rank || i + 1;
            const isFirst = displayedRank === 1;
            const isTop = displayedRank <= 3;
            const isCurrent = entry.id === currentEntryId;
            return (
              <div
                key={entry.id}
                className={`rounded-lg border px-3 flex items-center justify-between ${
                  isFirst
                    ? 'border-highlight bg-gradient-to-r from-highlight/20 to-highlight/5 py-3 lg:py-4 mb-1'
                    : isCurrent
                      ? 'border-cyan-400 bg-cyan-500/10 py-2'
                      : isTop
                        ? 'border-highlight/50 bg-highlight/10 py-2'
                        : 'border-gray-700 bg-bg/40 py-2'
                } ${isFirst ? 'text-base lg:text-lg' : 'text-sm lg:text-base'}`}
              >
                <div className="min-w-0">
                  <div className={`font-bold truncate ${isFirst ? 'text-highlight text-lg lg:text-xl' : isTop ? 'text-highlight' : 'text-white'}`}>
                    {isFirst ? '🏆 ' : `#${displayedRank} `}{entry.playerName}
                  </div>
                  <div className="text-xs text-gray-400 truncate">
                    {entry.gameMode} · {new Date(entry.date).toLocaleDateString()}
                  </div>
                </div>
                <div className={`font-black text-accent ${isFirst ? 'text-2xl lg:text-3xl' : 'text-lg'}`}>{entry.score}</div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
