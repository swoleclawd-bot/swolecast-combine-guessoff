import { useState, useEffect, useCallback, useRef } from 'react';
import type { Player, GameMode, Position, GuessResult, BenchPlayer } from './types';
import { scoreGuess, getEasterEgg, getDeltaColor } from './scoring';
import { playSuccess, playFail } from './sounds';
import SpeedSort from './SpeedSort';
import BenchSort from './BenchSort';
import QuickRound from './QuickRound';
import SchoolMatch from './SchoolMatch';
import DraftSort from './DraftSort';
import Leaderboard, { normalizeGameMode, recordLeaderboardScore, getPlayerName, setPlayerName } from './Leaderboard';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Confetti component
function Confetti() {
  const colors = ['#10B981', '#FFD166', '#7C3AED', '#EC4899', '#3B82F6', '#EF4444'];
  const particles = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    left: 40 + Math.random() * 20 + '%',
    color: colors[Math.floor(Math.random() * colors.length)],
    delay: Math.random() * 0.4 + 's',
    angle: (Math.random() - 0.5) * 200 + 'px',
    size: 6 + Math.random() * 8,
  }));
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map(p => (
        <div key={p.id} className="confetti-particle"
          style={{
            left: p.left,
            top: '40%',
            backgroundColor: p.color,
            width: p.size,
            height: p.size,
            animationDelay: p.delay,
            transform: `translateX(${p.angle})`,
          }} />
      ))}
    </div>
  );
}

// Slider tick marks and zone bands
const TICK_VALUES = [4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 5.0, 5.2];
const SLIDER_MIN = 4.20;
const SLIDER_MAX = 5.40;
const ZONES: { label: string; color: string; min: number; max: number }[] = [
  { label: 'WR', color: '#3B82F6', min: 4.28, max: 4.50 },
  { label: 'RB', color: '#10B981', min: 4.38, max: 4.60 },
  { label: 'QB', color: '#FFD166', min: 4.55, max: 4.85 },
  { label: 'TE', color: '#EC4899', min: 4.55, max: 4.80 },
];

function SliderWithTicks({ guess, setGuess, onSubmit }: { guess: number; setGuess: (v: number) => void; onSubmit: () => void }) {
  const pct = (v: number) => ((v - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN)) * 100;

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.shiftKey ? 0.05 : 0.01;
      setGuess(Math.min(SLIDER_MAX, Math.round((guess + step) * 100) / 100));
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      const step = e.shiftKey ? 0.05 : 0.01;
      setGuess(Math.max(SLIDER_MIN, Math.round((guess - step) * 100) / 100));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      onSubmit();
    }
  }, [guess, setGuess, onSubmit]);

  return (
    <div className="slider-container w-full">
      {/* Zone bands */}
      <div className="relative h-6 mb-1 rounded-lg overflow-hidden bg-card/30">
        {ZONES.map(z => (
          <div key={z.label} className="zone-band" style={{
            left: pct(z.min) + '%',
            width: (pct(z.max) - pct(z.min)) + '%',
            backgroundColor: z.color,
            opacity: 0.2,
          }}>
            <span className="absolute top-0.5 left-1/2 -translate-x-1/2 text-xs font-bold" style={{ color: z.color, opacity: 0.8 }}>
              {z.label}
            </span>
          </div>
        ))}
      </div>

      <input
        type="range" min={SLIDER_MIN} max={SLIDER_MAX} step="0.01" value={guess}
        onChange={e => setGuess(parseFloat(e.target.value))}
        onKeyDown={handleKeyDown}
        className="w-full cursor-pointer"
      />

      {/* Tick marks */}
      <div className="slider-ticks">
        {TICK_VALUES.map(v => (
          <div key={v} className="slider-tick" style={{ left: pct(v) + '%' }}>
            {v.toFixed(1)}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [benchPlayers, setBenchPlayers] = useState<BenchPlayer[]>([]);
  const [mode, setMode] = useState<GameMode>('menu');
  const [posFilter, setPosFilter] = useState<Position | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [idx, setIdx] = useState(0);
  const [guess, setGuess] = useState(4.75);
  const [revealed, setRevealed] = useState(false);
  const [results, setResults] = useState<GuessResult[]>([]);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [easterEgg, setEasterEgg] = useState<string | null>(null);
  const [shareText, setShareText] = useState('');
  const [showConfetti, setShowConfetti] = useState(false);
  const [copied, setCopied] = useState(false);
  const [positionSelectMode, setPositionSelectMode] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [currentLeaderboardEntryId, setCurrentLeaderboardEntryId] = useState<string | null>(null);
  const [playerName, setPlayerNameState] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load player name from localStorage on mount
  useEffect(() => {
    const saved = getPlayerName();
    setPlayerNameState(saved);
    // If no name set yet, prompt for one
    if (!saved || saved === 'Player') {
      setEditingName(true);
    }
  }, []);

  useEffect(() => {
    fetch('/players.json').then(r => r.json()).then((data: Player[]) => {
      const seen = new Set<string>();
      const unique = data.filter(p => { if (seen.has(p.name)) return false; seen.add(p.name); return true; });
      setAllPlayers(unique);
    });
    fetch('/players-bench.json').then(r => r.json()).then((data: BenchPlayer[]) => {
      const seen = new Set<string>();
      const unique = data.filter(p => { if (seen.has(p.name)) return false; seen.add(p.name); return true; });
      setBenchPlayers(unique);
    });
  }, []);

  const startGame = useCallback((m: GameMode, pos?: Position) => {
    let pool = allPlayers;
    if (pos) pool = pool.filter(p => p.position === pos);
    const shuffled = shuffle(pool);
    const list = m === 'quick' ? shuffled.slice(0, 10) : shuffled;
    setPlayers(list);
    setIdx(0);
    setGuess(4.75);
    setRevealed(false);
    setResults([]);
    setScore(0);
    setStreak(0);
    setGameOver(false);
    setEasterEgg(null);
    setShareText('');
    setShowConfetti(false);
    setCopied(false);
    setCurrentLeaderboardEntryId(null);
    setMode(m);
    setPosFilter(pos || null);
  }, [allPlayers]);

  const endGame = useCallback(() => {
    setGameOver(true);
    const modeLabel = mode === 'quick' ? 'Quick Round' : mode === 'position' ? `${posFilter} Challenge` : 'Endless';
    setShareText(`I scored ${score} points on the Swolecast Combine Games ${modeLabel}! 🏋️ Think you Know Ball? swolecast.com`);
    recordLeaderboardScore('Endless', score).then(entry => {
      setCurrentLeaderboardEntryId(entry.id);
    });
  }, [score, mode, posFilter]);

  const handleSubmit = useCallback(() => {
    if (revealed || gameOver || !players[idx]) return;
    const player = players[idx];
    const result = scoreGuess(player, guess, streak);
    const egg = getEasterEgg(player, guess);

    if (result.points >= 50) {
      playSuccess();
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 1500);
    } else {
      playFail();
    }

    const newStreak = result.points >= 50 ? streak + 1 : 0;
    setStreak(newStreak);
    setScore(s => s + result.points);
    setResults(r => [...r, result]);
    setRevealed(true);
    setEasterEgg(egg);
    if (timerRef.current) clearInterval(timerRef.current);
  }, [revealed, gameOver, players, idx, guess, streak]);

  const nextPlayer = useCallback(() => {
    const nextIdx = idx + 1;
    if (nextIdx >= players.length) {
      endGame();
      return;
    }
    setIdx(nextIdx);
    setGuess(4.75);
    setRevealed(false);
    setEasterEgg(null);
    setShowConfetti(false);
  }, [idx, players.length, endGame]);

  // Keyboard shortcuts
  useEffect(() => {
    if (mode === 'menu' || gameOver) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !revealed) {
        e.preventDefault();
        handleSubmit();
      } else if (e.key === ' ' && revealed) {
        e.preventDefault();
        nextPlayer();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [mode, gameOver, revealed, handleSubmit, nextPlayer]);

  const handleShare = async () => {
    if (navigator.share) {
      try { await navigator.share({ text: shareText }); } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const currentPlayer = players[idx];
  const maxRounds = mode === 'quick' ? 10 : players.length;

  if (!allPlayers.length) return <div className="flex items-center justify-center min-h-screen text-xl lg:text-3xl font-bold px-4 text-center">Loading players... 🏈</div>;

  // Position Challenge — position selection screen
  if (positionSelectMode) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 lg:p-8">
        <div className="text-center mb-6 lg:mb-8">
          <img src="/swolecast-logo.png" alt="Swolecast" className="h-14 lg:h-20 mx-auto mb-3 lg:mb-4" />
          <h2 className="text-3xl lg:text-5xl font-black text-accent mb-2">POSITION CHALLENGE</h2>
          <p className="text-gray-400 text-base lg:text-xl">Pick a position, then prove you Know Ball</p>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:gap-6 max-w-lg w-full">
          {(['QB', 'RB', 'WR', 'TE'] as Position[]).map(pos => (
            <button key={pos} onClick={() => { setPositionSelectMode(false); setPosFilter(pos); setMode('position'); }}
              className="py-6 px-4 lg:py-10 lg:px-8 bg-card hover:bg-primary/20 rounded-2xl text-center transition-all hover:scale-105 border-2 border-primary/40 hover:border-primary">
              <div className="text-3xl lg:text-5xl mb-2">{pos === 'QB' ? '🎯' : pos === 'RB' ? '🐂' : pos === 'WR' ? '🏃' : '🤚'}</div>
              <div className="text-2xl lg:text-3xl font-black text-white">{pos}</div>
            </button>
          ))}
        </div>
        <button onClick={() => setPositionSelectMode(false)} className="mt-6 lg:mt-8 text-gray-500 hover:text-white transition-colors min-h-[44px]">← Back to Menu</button>
      </div>
    );
  }

  // Menu
  if (mode === 'menu') {
    if (showLeaderboard) {
      return (
        <div className="min-h-screen flex flex-col items-center p-4 lg:p-8 max-w-5xl mx-auto w-full">
          <div className="w-full flex justify-between items-center mb-4 lg:mb-6">
            <div className="flex items-center gap-2">
              <img src="/swolecast-logo.png" alt="Swolecast" className="h-10 lg:h-12" />
              <span className="text-sm uppercase tracking-widest text-gray-500 font-bold">COMBINE GAMES</span>
            </div>
            <button onClick={() => setShowLeaderboard(false)} className="px-4 py-2 bg-card rounded-lg font-bold hover:bg-card/80 min-h-[44px]">← Back</button>
          </div>
          <Leaderboard title="Swolecast Leaderboard" />
        </div>
      );
    }

    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 lg:p-8">
        <div className="text-center mb-6 lg:mb-12">
          <a href="https://www.youtube.com/channel/UCRUA9P6vB_O9sEKrEluPETQ" target="_blank" rel="noopener noreferrer">
            <img src="/swolecast-logo.png" alt="Swolecast" className="h-16 lg:h-28 mx-auto mb-3 lg:mb-4 hover:opacity-80 transition-opacity" />
          </a>
          <h1 className="text-3xl lg:text-7xl font-black tracking-tight leading-tight">
            <span className="text-accent">COMBINE GAMES</span> 💪
          </h1>
          <p className="text-highlight mt-2 lg:mt-4 text-lg lg:text-2xl italic font-medium animate-glow-pulse">No Research, No Filter, All Vibes</p>
        </div>

        {/* Player Name Bar */}
        <div className="w-full max-w-md mb-4 lg:mb-6">
          {editingName ? (
            <div className="flex gap-2 items-center bg-card border-2 border-accent/50 rounded-xl p-3">
              <span className="text-gray-400 text-sm shrink-0">Your name:</span>
              <input
                type="text"
                value={nameInput}
                onChange={e => setNameInput(e.target.value.slice(0, 20))}
                onKeyDown={e => {
                  if (e.key === 'Enter' && nameInput.trim()) {
                    const saved = setPlayerName(nameInput.trim());
                    setPlayerNameState(saved);
                    setEditingName(false);
                  }
                }}
                placeholder="Enter your name..."
                autoFocus
                className="flex-1 bg-transparent border-none outline-none text-white font-bold text-lg placeholder-gray-600"
                maxLength={20}
              />
              <button
                onClick={() => {
                  if (nameInput.trim()) {
                    const saved = setPlayerName(nameInput.trim());
                    setPlayerNameState(saved);
                    setEditingName(false);
                  }
                }}
                className="px-4 py-2 bg-accent rounded-lg font-bold text-sm hover:bg-accent/80 min-h-[36px]"
              >
                Save
              </button>
            </div>
          ) : (
            <button
              onClick={() => { setNameInput(playerName); setEditingName(true); }}
              className="w-full flex items-center justify-center gap-2 bg-card/50 border border-gray-700 rounded-xl px-4 py-2 hover:border-accent/50 transition-colors"
            >
              <span className="text-gray-400 text-sm">Playing as</span>
              <span className="text-white font-bold">{playerName}</span>
              <span className="text-gray-500 text-xs">✏️</span>
            </button>
          )}
        </div>

        <div className="flex flex-col items-center gap-4 lg:gap-6 w-full max-w-5xl mb-6 lg:mb-8">
          {/* Sort Games — PRIMARY */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 lg:gap-6 w-full max-w-5xl">
            <button onClick={() => setMode('schoolmatch')}
              className="py-8 px-6 lg:py-12 lg:px-8 bg-card hover:bg-highlight/20 rounded-2xl text-center transition-all hover:scale-105 animate-pulse-glow border-2 border-highlight/40 hover:border-highlight flex flex-col items-center">
              <div className="text-5xl lg:text-6xl font-black text-white mb-2 lg:mb-3 leading-none w-full text-center">🎓</div>
              <div className="text-xl lg:text-2xl font-black text-highlight mb-1 lg:mb-2">School Match</div>
              <div className="text-gray-400 text-sm lg:text-base">Match players to colleges</div>
            </button>
            <button onClick={() => setMode('speedsort')}
              className="py-8 px-6 lg:py-12 lg:px-8 bg-card hover:bg-primary/20 rounded-2xl text-center transition-all hover:scale-105 animate-pulse-glow border-2 border-primary/40 hover:border-primary flex flex-col items-center">
              <div className="text-5xl lg:text-6xl font-black text-white mb-2 lg:mb-3 leading-none w-full text-center">40</div>
              <div className="text-xl lg:text-2xl font-black text-primary mb-1 lg:mb-2">Speed Sort</div>
              <div className="text-gray-400 text-sm lg:text-base">Sort fastest → slowest</div>
            </button>
            <button onClick={() => setMode('benchsort')}
              className="py-8 px-6 lg:py-12 lg:px-8 bg-card hover:bg-accent/20 rounded-2xl text-center transition-all hover:scale-105 animate-pulse-glow border-2 border-accent/40 hover:border-accent flex flex-col items-center">
              <div className="text-5xl lg:text-6xl font-black text-white mb-2 lg:mb-3 leading-none w-full text-center">225</div>
              <div className="text-xl lg:text-2xl font-black text-accent mb-1 lg:mb-2">Bench Sort</div>
              <div className="text-gray-400 text-sm lg:text-base">Sort most → fewest reps</div>
            </button>
            <button onClick={() => setMode('draftsort')}
              className="py-8 px-6 lg:py-12 lg:px-8 bg-card hover:bg-green-500/20 rounded-2xl text-center transition-all hover:scale-105 animate-pulse-glow border-2 border-green-500/40 hover:border-green-500 flex flex-col items-center">
              <div className="text-5xl lg:text-6xl font-black text-white mb-2 lg:mb-3 leading-none w-full text-center">📋</div>
              <div className="text-xl lg:text-2xl font-black text-green-400 mb-1 lg:mb-2">Draft Sort</div>
              <div className="text-gray-400 text-sm lg:text-base">Sort by draft round</div>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6 w-full">
            {/* Endless */}
            <button onClick={() => startGame('endless')}
              className="py-6 px-6 lg:py-10 lg:px-8 bg-card hover:bg-accent/20 rounded-2xl text-center transition-all hover:scale-105 border-2 border-accent/40 hover:border-accent">
              <div className="text-4xl lg:text-5xl mb-2 lg:mb-3">♾️</div>
              <div className="text-2xl lg:text-3xl font-black text-accent mb-1 lg:mb-2">Endless Mode</div>
              <div className="text-gray-400 text-base lg:text-lg">No timer · Pure vibes</div>
            </button>

            {/* Quick Round */}
            <button onClick={() => setMode('quick')}
              className="py-6 px-6 lg:py-10 lg:px-8 bg-card hover:bg-primary/20 rounded-2xl text-center transition-all hover:scale-105 border-2 border-primary/40 hover:border-primary">
              <div className="text-4xl lg:text-5xl mb-2 lg:mb-3">⚡</div>
              <div className="text-2xl lg:text-3xl font-black text-primary mb-1 lg:mb-2">Quick Round</div>
              <div className="text-gray-400 text-base lg:text-lg">10 mini-games · Timed</div>
            </button>

            {/* Position Challenge */}
            <button onClick={() => setPositionSelectMode(true)}
              className="bg-card hover:bg-accent/20 rounded-2xl p-5 lg:p-8 transition-all hover:scale-105 border-2 border-accent/40 hover:border-accent">
              <p className="text-center font-black mb-3 lg:mb-5 text-base lg:text-lg uppercase tracking-widest text-accent">Position Challenge</p>
              <div className="grid grid-cols-2 gap-2 lg:gap-3">
                {(['WR', 'RB', 'QB', 'TE'] as Position[]).map(pos => (
                  <div key={pos} className="py-3 lg:py-5 bg-bg/50 rounded-xl font-bold text-base lg:text-xl text-gray-300 border-2 border-gray-700 text-center hover:border-accent/50 transition-colors">
                    {pos === 'WR' ? '🏃' : pos === 'RB' ? '🐂' : pos === 'QB' ? '🎯' : '🤚'} {pos}
                  </div>
                ))}
              </div>
            </button>
          </div>

          <div className="w-full">
            <button onClick={() => setShowLeaderboard(true)}
              className="w-full py-4 px-6 bg-card hover:bg-primary/20 rounded-2xl border-2 border-primary/30 hover:border-primary transition-all hover:scale-[1.01]">
              <div className="text-xl lg:text-2xl font-black text-highlight mb-1">Leaderboard</div>
              <div className="text-gray-400 text-sm lg:text-base">Top 10 by mode + All Games combined</div>
            </button>
          </div>
        </div>

        <p className="text-center text-gray-600 text-xs lg:text-sm max-w-md mt-2 lg:mt-4 px-4">
          Wanna thank Kitchen? Find out more about prospects with the{' '}
          <a href="https://lateround.com/#guides" target="_blank" rel="noopener noreferrer" className="text-gray-400 underline hover:text-white transition-colors">Late-Round Prospect Guide</a>
          {' '}and become a{' '}
          <a href="https://www.youtube.com/channel/UCRUA9P6vB_O9sEKrEluPETQ/join" target="_blank" rel="noopener noreferrer" className="text-gray-400 underline hover:text-white transition-colors">Swolie on YouTube</a>.
        </p>
      </div>
    );
  }

  // Quick Round mode
  if (mode === 'quick') {
    return <QuickRound fortyPlayers={allPlayers} benchPlayers={benchPlayers} onQuit={() => setMode('menu')} onRecordScore={async (gameMode, finalScore) => (await recordLeaderboardScore(normalizeGameMode(gameMode), finalScore)).id} />;
  }

  // Position Challenge mode
  if (mode === 'position') {
    return <QuickRound fortyPlayers={allPlayers} benchPlayers={benchPlayers} posFilter={posFilter || undefined} onQuit={() => setMode('menu')} onRecordScore={async (gameMode, finalScore) => (await recordLeaderboardScore(normalizeGameMode(gameMode), finalScore)).id} />;
  }

  // Speed Sort mode
  if (mode === 'speedsort') {
    return <SpeedSort allPlayers={allPlayers} onQuit={() => setMode('menu')} onRecordScore={async (finalScore) => (await recordLeaderboardScore('Speed Sort', finalScore)).id} />;
  }

  // Bench Sort mode
  if (mode === 'benchsort') {
    return <BenchSort onQuit={() => setMode('menu')} onRecordScore={async (finalScore) => (await recordLeaderboardScore('Bench Sort', finalScore)).id} />;
  }

  // School Match mode
  if (mode === 'schoolmatch') {
    return <SchoolMatch allPlayers={allPlayers} onQuit={() => setMode('menu')} onRecordScore={async (finalScore) => (await recordLeaderboardScore('School Match', finalScore)).id} />;
  }

  // Draft Sort mode
  if (mode === 'draftsort') {
    return <DraftSort onQuit={() => setMode('menu')} onRecordScore={async (finalScore) => (await recordLeaderboardScore('Draft Sort', finalScore)).id} />;
  }

  // Game Over — wide layout (for endless mode)
  if (gameOver) {
    return (
      <div className="min-h-screen flex flex-col items-center p-4 lg:p-8 max-w-6xl mx-auto">
        <div className="flex items-center justify-center gap-3 mb-2"><img src="/swolecast-logo.png" alt="Swolecast" className="h-8 lg:h-10" /><span className="text-xs lg:text-sm uppercase tracking-widest text-gray-500 font-bold">COMBINE GAMES</span></div>

        <h2 className="text-4xl lg:text-6xl font-black text-highlight mb-3 lg:mb-4 mt-3 lg:mt-4">GAME OVER!</h2>
        <p className="text-5xl lg:text-8xl font-black text-primary mb-2">{score} pts</p>
        <p className="text-lg lg:text-xl text-gray-400 mb-6 lg:mb-8">{results.length} rounds played</p>

        {shareText && (
          <button onClick={handleShare}
            className="mb-6 lg:mb-8 px-6 py-3 lg:px-8 lg:py-4 bg-accent rounded-xl font-bold text-lg lg:text-xl hover:bg-accent/80 transition-all hover:scale-105 min-h-[44px]">
            {copied ? '✅ Copied!' : '📤 Share'}
          </button>
        )}

        {/* Results — table on desktop, cards on mobile */}
        <div className="w-full mb-6 lg:mb-8">
          <h3 className="font-bold text-xl lg:text-2xl text-center mb-4">Round Summary</h3>
          {/* Desktop table */}
          <div className="hidden lg:block bg-card rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="text-left text-gray-400 text-sm uppercase border-b border-gray-700">
                  <th className="p-4">#</th>
                  <th className="p-4">Player</th>
                  <th className="p-4">Pos</th>
                  <th className="p-4 text-right">Your Guess</th>
                  <th className="p-4 text-right">Actual</th>
                  <th className="p-4 text-right">Delta</th>
                  <th className="p-4 text-right">Points</th>
                  <th className="p-4 text-center">Result</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className="border-b border-gray-800 hover:bg-bg/50 transition-colors">
                    <td className="p-4 text-gray-500">{i + 1}</td>
                    <td className="p-4 font-bold">{r.player.name}</td>
                    <td className="p-4 text-gray-400">{r.player.position}</td>
                    <td className="p-4 text-right text-gray-300">{r.guess.toFixed(2)}</td>
                    <td className="p-4 text-right font-bold">{r.player.forty.toFixed(2)}</td>
                    <td className="p-4 text-right" style={{ color: getDeltaColor(r.delta) }}>{r.delta.toFixed(2)}s</td>
                    <td className="p-4 text-right font-bold text-highlight">+{r.points}</td>
                    <td className="p-4 text-center text-xl">{r.emoji}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile cards */}
          <div className="lg:hidden space-y-2">
            {results.map((r, i) => (
              <div key={i} className="bg-card rounded-xl p-3 flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate">{r.player.name} <span className="text-gray-500 font-normal">{r.player.position}</span></div>
                  <div className="text-xs text-gray-400">
                    Guess {r.guess.toFixed(2)} · Actual {r.player.forty.toFixed(2)} · <span style={{ color: getDeltaColor(r.delta) }}>Δ{r.delta.toFixed(2)}s</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-bold text-highlight text-sm">+{r.points}</span>
                  <span className="text-lg">{r.emoji}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3 lg:gap-4">
          <button onClick={() => startGame(mode, posFilter || undefined)}
            className="px-6 py-3 lg:px-8 lg:py-4 bg-primary rounded-xl font-bold text-lg lg:text-xl hover:bg-primary/80 transition-all hover:scale-105 min-h-[44px]">🔄 Play Again</button>
          <button onClick={() => setMode('menu')}
            className="px-6 py-3 lg:px-8 lg:py-4 bg-card rounded-xl font-bold text-lg lg:text-xl hover:bg-card/80 transition-all hover:scale-105 min-h-[44px]">🏠 Menu</button>
        </div>

        <div className="w-full mt-6 lg:mt-8">
          <Leaderboard compact mode="Endless" currentEntryId={currentLeaderboardEntryId} title="Endless Leaderboard" />
        </div>
      </div>
    );
  }

  // Active Game — 3-column desktop layout (Endless mode)
  const lastResult = results.length > 0 ? results[results.length - 1] : null;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top header bar */}
      <div className="flex justify-between items-center px-4 lg:px-8 py-2 lg:py-3 bg-card/50 border-b border-gray-800">
        <button onClick={() => { if (confirm('Quit game?')) { endGame(); } }}
          className="text-gray-400 hover:text-white text-sm font-bold min-h-[44px] min-w-[44px] flex items-center">✕ Quit</button>
        <div className="flex items-center gap-2 lg:gap-3"><img src="/swolecast-logo.png" alt="Swolecast" className="h-6 lg:h-8" /><span className="text-xs lg:text-sm uppercase tracking-widest text-gray-500 font-bold">COMBINE GAMES</span></div>
        <div className="text-gray-400 text-xs lg:text-sm">♾️ Endless</div>
      </div>

      {/* Score bar on mobile */}
      <div className="lg:hidden flex justify-around items-center px-4 py-2 bg-card/30 border-b border-gray-800">
        <div className="text-center">
          <div className="text-xs uppercase text-gray-500">Score</div>
          <div className="text-2xl font-black text-highlight">{score}</div>
        </div>
        <div className="text-center">
          <div className="text-xs uppercase text-gray-500">Round</div>
          <div className="text-lg font-bold">{idx + 1}/{maxRounds}</div>
        </div>
        <div className="text-center">
          <div className="text-xs uppercase text-gray-500">Streak</div>
          <div className="text-lg font-bold text-accent">{streak > 0 ? `🔥 x${streak}` : '-'}</div>
        </div>
      </div>

      {/* 3-column main layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_1.5fr_1fr] gap-4 lg:gap-6 p-4 lg:p-8 max-w-[1600px] mx-auto w-full">
        {/* LEFT — Player Card */}
        <div className="flex flex-col items-center justify-center relative">
          {currentPlayer && (
            <div className="bg-card rounded-2xl p-5 lg:p-8 text-center border-2 border-primary/30 w-full relative overflow-hidden">
              {showConfetti && <Confetti />}
              <div className="text-xs uppercase tracking-[0.3em] text-gray-400 mb-1 lg:mb-2">
                {currentPlayer.position} · {currentPlayer.year} NFL Combine
              </div>
              <h2 className="text-3xl lg:text-7xl font-black text-white mb-2 lg:mb-3 leading-tight">{currentPlayer.name}</h2>
              <p className="text-base lg:text-xl text-gray-400">{currentPlayer.college}</p>
              <p className="text-sm lg:text-base text-gray-500">Drafted by {currentPlayer.team}</p>

              <div className="mt-4 lg:mt-8 mb-2 lg:mb-4">
                {!revealed ? (
                  <div className="text-6xl lg:text-9xl font-black text-primary/20 select-none">?.??</div>
                ) : (
                  <div className="animate-reveal">
                    <div className="text-6xl lg:text-9xl font-black" style={{
                      color: getDeltaColor(lastResult?.delta || 1),
                      textShadow: `0 0 30px ${getDeltaColor(lastResult?.delta || 1)}40`,
                    }}>
                      {currentPlayer.forty.toFixed(2)}s
                    </div>
                    {lastResult && (
                      <div className="mt-3 lg:mt-4">
                        <div className={`text-2xl lg:text-3xl font-black ${lastResult.knowsBall ? 'text-success animate-knows-ball' : 'text-red-500 animate-learn-ball'}`}>
                          {lastResult.emoji} {lastResult.label}
                        </div>
                        <div className="text-base lg:text-xl mt-2">
                          <span className="text-gray-400">Guess: {lastResult.guess.toFixed(2)}</span>
                          <span className="mx-2 lg:mx-3 text-gray-600">·</span>
                          <span style={{ color: getDeltaColor(lastResult.delta) }}>Δ {lastResult.delta.toFixed(2)}s</span>
                          <span className="mx-2 lg:mx-3 text-gray-600">·</span>
                          <span className="text-highlight font-bold">+{lastResult.points}</span>
                        </div>
                        {easterEgg && <p className="mt-2 lg:mt-3 text-accent italic text-sm lg:text-base">{easterEgg}</p>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* CENTER — Guess Controls */}
        <div className="flex flex-col items-center justify-center">
          {!revealed ? (
            <div className="w-full max-w-xl space-y-4 lg:space-y-6">
              <div className="text-center text-5xl lg:text-8xl font-black text-white">
                {guess.toFixed(2)}<span className="text-2xl lg:text-4xl text-gray-500">s</span>
              </div>
              <SliderWithTicks guess={guess} setGuess={setGuess} onSubmit={handleSubmit} />
              <input
                type="number" min={4.20} max={5.40} step={0.01} value={guess.toFixed(2)}
                onChange={e => {
                  const v = parseFloat(e.target.value);
                  if (v >= 4.20 && v <= 5.40) setGuess(v);
                }}
                className="w-full p-3 lg:p-4 bg-card rounded-xl text-center text-2xl lg:text-3xl font-bold border-2 border-primary/30 focus:border-primary outline-none"
              />
              <button onClick={handleSubmit}
                className="w-full py-4 lg:py-6 bg-primary hover:bg-primary/80 rounded-2xl text-2xl lg:text-3xl font-black transition-all hover:scale-105 active:scale-95 animate-pulse-glow min-h-[52px]">
                🎯 LOCK IT IN
              </button>
              <p className="hidden lg:block text-center text-gray-500 text-sm">Press <kbd className="px-2 py-0.5 bg-card rounded text-gray-400">Enter</kbd> to submit · Arrow keys to adjust · <kbd className="px-2 py-0.5 bg-card rounded text-gray-400">Shift</kbd>+Arrow for ±0.05</p>
            </div>
          ) : (
            <div className="w-full max-w-xl">
              <button onClick={nextPlayer}
                className="w-full py-4 lg:py-6 bg-accent hover:bg-accent/80 rounded-2xl text-2xl lg:text-3xl font-black transition-all hover:scale-105 active:scale-95 min-h-[52px]">
                {idx + 1 >= maxRounds ? '📊 See Results' : '➡️ NEXT PLAYER'}
              </button>
              <p className="hidden lg:block text-center text-gray-500 text-sm mt-3">Press <kbd className="px-2 py-0.5 bg-card rounded text-gray-400">Space</kbd> to continue</p>
            </div>
          )}
        </div>

        {/* RIGHT — Score Panel (desktop only) */}
        <div className="hidden lg:flex flex-col gap-4">
          <div className="bg-card rounded-2xl p-6 text-center border border-primary/20">
            <div className="text-sm uppercase tracking-widest text-gray-500 mb-1">Score</div>
            <div className="text-5xl font-black text-highlight">{score}</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-card rounded-xl p-4 text-center">
              <div className="text-xs uppercase text-gray-500">Round</div>
              <div className="text-2xl font-bold">{idx + 1}/{maxRounds}</div>
            </div>
            <div className="bg-card rounded-xl p-4 text-center">
              <div className="text-xs uppercase text-gray-500">Streak</div>
              <div className="text-2xl font-bold text-accent">{streak > 0 ? `🔥 x${streak}` : '-'}</div>
            </div>
          </div>
          {results.length > 0 && (
            <div className="bg-card rounded-xl p-4">
              <div className="text-xs uppercase text-gray-500 mb-3">Recent</div>
              <div className="space-y-2">
                {results.slice(-8).reverse().map((r, i) => (
                  <div key={i} className="flex justify-between text-sm py-1 border-b border-gray-800 last:border-0" style={{ opacity: 1 - i * 0.1 }}>
                    <span className="truncate mr-2">{r.player.name}</span>
                    <span className="whitespace-nowrap">{r.emoji} +{r.points}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
