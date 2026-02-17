import { useState, useEffect, useCallback, useRef } from 'react';
import type { Player, GameMode, Position, GuessResult, HighScore } from './types';
import { scoreGuess, getEasterEgg, getDeltaColor } from './scoring';
import { playSuccess, playFail, playTick } from './sounds';
import SpeedSort from './SpeedSort';
import BenchSort from './BenchSort';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getHighScores(): HighScore[] {
  try { return JSON.parse(localStorage.getItem('swolecast-scores') || '[]'); } catch { return []; }
}
function saveHighScore(s: HighScore) {
  const scores = [...getHighScores(), s].sort((a, b) => b.score - a.score).slice(0, 10);
  localStorage.setItem('swolecast-scores', JSON.stringify(scores));
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
  const [mode, setMode] = useState<GameMode>('menu');
  const [posFilter, setPosFilter] = useState<Position | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [idx, setIdx] = useState(0);
  const [guess, setGuess] = useState(4.50);
  const [revealed, setRevealed] = useState(false);
  const [results, setResults] = useState<GuessResult[]>([]);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [timeLeft, setTimeLeft] = useState(15);
  const [gameOver, setGameOver] = useState(false);
  const [easterEgg, setEasterEgg] = useState<string | null>(null);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [shareText, setShareText] = useState('');
  const [showConfetti, setShowConfetti] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch('/players.json').then(r => r.json()).then((data: Player[]) => {
      const seen = new Set<string>();
      const unique = data.filter(p => { if (seen.has(p.name)) return false; seen.add(p.name); return true; });
      setAllPlayers(unique);
    });
  }, []);

  const startGame = useCallback((m: GameMode, pos?: Position) => {
    let pool = allPlayers;
    if (pos) pool = pool.filter(p => p.position === pos);
    const shuffled = shuffle(pool);
    const list = m === 'quick' ? shuffled.slice(0, 10) : shuffled;
    setPlayers(list);
    setIdx(0);
    setGuess(4.50);
    setRevealed(false);
    setResults([]);
    setScore(0);
    setStreak(0);
    setTimeLeft(15);
    setGameOver(false);
    setEasterEgg(null);
    setShareText('');
    setShowConfetti(false);
    setMode(m);
    setPosFilter(pos || null);
  }, [allPlayers]);

  const endGame = useCallback(() => {
    setGameOver(true);
    const modeLabel = mode === 'quick' ? 'Quick Round' : mode === 'position' ? `${posFilter} Challenge` : 'Endless';
    saveHighScore({ score, mode: modeLabel, date: new Date().toLocaleDateString(), rounds: results.length });
    const maxPossible = results.length * 100;
    setShareText(`I scored ${score}/${maxPossible > 0 ? maxPossible : results.length * 100} on the @Swolecast Combine Guess-Off! 🏈💪\n\nThink you can beat me? #Swolecast #CombineGuessOff`);
  }, [score, mode, posFilter, results]);

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
    if (mode === 'quick' && nextIdx >= 10) {
      endGame();
      return;
    }
    if (nextIdx >= players.length) {
      endGame();
      return;
    }
    setIdx(nextIdx);
    setGuess(4.50);
    setRevealed(false);
    setEasterEgg(null);
    setTimeLeft(15);
    setShowConfetti(false);
  }, [idx, mode, players.length, endGame]);

  // Timer for quick mode
  useEffect(() => {
    if (mode === 'quick' && !revealed && !gameOver) {
      timerRef.current = setInterval(() => {
        setTimeLeft(t => {
          if (t <= 1) {
            handleSubmit();
            return 15;
          }
          if (t <= 4) playTick();
          return t - 1;
        });
      }, 1000);
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, revealed, gameOver, idx]);

  // Keyboard shortcuts: Enter to submit, Space for next
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

  const currentPlayer = players[idx];
  const maxRounds = mode === 'quick' ? 10 : players.length;

  if (!allPlayers.length) return <div className="flex items-center justify-center min-h-screen text-3xl font-bold">Loading players... 🏈</div>;

  // Leaderboard overlay
  if (showLeaderboard) {
    const scores = getHighScores();
    return (
      <div className="min-h-screen p-8 max-w-4xl mx-auto">
        <button onClick={() => setShowLeaderboard(false)} className="mb-6 px-6 py-3 bg-primary rounded-lg text-white font-bold text-lg hover:bg-primary/80 transition-all">← Back</button>
        <h2 className="text-5xl font-black text-center mb-8 text-highlight">🏆 Leaderboard</h2>
        {scores.length === 0 ? <p className="text-center text-gray-400 text-xl">No scores yet. Play a game!</p> :
          <div className="space-y-3">
            {scores.map((s, i) => (
              <div key={i} className="bg-card p-6 rounded-xl flex justify-between items-center">
                <div>
                  <span className="text-2xl font-bold text-highlight">{i === 0 ? '👑' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i+1}`}</span>
                  <span className="ml-4 font-bold text-xl">{s.score} pts</span>
                </div>
                <div className="text-lg text-gray-400">{s.mode} · {s.rounds}r · {s.date}</div>
              </div>
            ))}
          </div>
        }
      </div>
    );
  }

  // Menu — TV game show intro
  if (mode === 'menu') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8">
        <div className="text-center mb-12">
          <img src="/swolecast-logo.png" alt="Swolecast" className="h-24 lg:h-28 mx-auto mb-4" />
          <h1 className="text-5xl lg:text-7xl font-black tracking-tight leading-tight">
            <span className="text-accent">COMBINE GUESS-OFF</span> 💪
          </h1>
          <p className="text-highlight mt-4 text-2xl italic font-medium animate-glow-pulse">No Research, No Filter, All Vibes</p>
        </div>

        <div className="flex flex-col items-center gap-6 w-full max-w-5xl mb-8">
          {/* Speed Sort variants — PRIMARY */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full max-w-2xl">
            <button onClick={() => setMode('speedsort')}
              className="py-12 px-10 bg-card hover:bg-primary/20 rounded-2xl text-center transition-all hover:scale-105 animate-pulse-glow border-2 border-primary/40 hover:border-primary">
              <div className="text-6xl mb-3">🏃</div>
              <div className="text-3xl font-black text-primary mb-2">40 Speed Sort</div>
              <div className="text-gray-400 text-lg">Sort fastest → slowest · 3 lives</div>
            </button>
            <button onClick={() => setMode('benchsort')}
              className="py-12 px-10 bg-card hover:bg-accent/20 rounded-2xl text-center transition-all hover:scale-105 animate-pulse-glow border-2 border-accent/40 hover:border-accent">
              <div className="text-6xl mb-3">💪</div>
              <div className="text-3xl font-black text-accent mb-2">Bench Press Sort</div>
              <div className="text-gray-400 text-lg">Sort most → fewest reps · 3 lives</div>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">
            {/* Endless — secondary */}
            <button onClick={() => startGame('endless')}
              className="py-10 px-8 bg-card hover:bg-accent/20 rounded-2xl text-center transition-all hover:scale-105 border-2 border-accent/40 hover:border-accent">
              <div className="text-5xl mb-3">♾️</div>
              <div className="text-3xl font-black text-accent mb-2">Endless Mode</div>
              <div className="text-gray-400 text-lg">No timer · Pure vibes</div>
            </button>

            {/* Quick Round — COMING SOON */}
            <div className="relative py-10 px-8 bg-card/50 rounded-2xl text-center border-2 border-gray-700 opacity-50 cursor-not-allowed">
              <div className="absolute top-3 right-3 bg-gray-600 text-xs font-bold uppercase px-3 py-1 rounded-full tracking-wider">Coming Soon</div>
              <div className="text-5xl mb-3">⚡</div>
              <div className="text-3xl font-black text-gray-500 mb-2">Quick Round</div>
              <div className="text-gray-600 text-lg">10 players · 15s each</div>
            </div>

            {/* Position Challenge — COMING SOON */}
            <div className="relative bg-card/50 rounded-2xl p-8 border-2 border-gray-700 opacity-50 cursor-not-allowed">
              <div className="absolute top-3 right-3 bg-gray-600 text-xs font-bold uppercase px-3 py-1 rounded-full tracking-wider">Coming Soon</div>
              <p className="text-center font-black mb-5 text-lg uppercase tracking-widest text-gray-500">Position Challenge</p>
              <div className="grid grid-cols-2 gap-3">
                {(['WR', 'RB', 'QB', 'TE'] as Position[]).map(pos => (
                  <div key={pos} className="py-5 bg-bg/50 rounded-xl font-bold text-xl text-gray-600 border-2 border-gray-700 text-center">
                    {pos === 'WR' ? '🏃' : pos === 'RB' ? '🐂' : pos === 'QB' ? '🎯' : '🤚'} {pos}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <button onClick={() => setShowLeaderboard(true)}
          className="px-10 py-4 bg-card hover:bg-card/80 rounded-xl font-bold text-xl text-highlight transition-all hover:scale-105 border border-highlight/30">
          🏆 Leaderboard
        </button>
      </div>
    );
  }

  // Speed Sort mode
  if (mode === 'speedsort') {
    return <SpeedSort allPlayers={allPlayers} onQuit={(s, r) => { saveHighScore({ score: s, mode: 'Speed Sort', date: new Date().toLocaleDateString(), rounds: r }); setMode('menu'); }} />;
  }

  // Bench Press Sort mode
  if (mode === 'benchsort') {
    return <BenchSort onQuit={(s, r) => { saveHighScore({ score: s, mode: 'Bench Sort', date: new Date().toLocaleDateString(), rounds: r }); setMode('menu'); }} />;
  }

  // Game Over — wide layout
  if (gameOver) {
    return (
      <div className="min-h-screen flex flex-col items-center p-8 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-center gap-3 mb-2"><img src="/swolecast-logo.png" alt="Swolecast" className="h-10" /><span className="text-sm uppercase tracking-widest text-gray-500 font-bold">COMBINE GUESS-OFF</span></div>

        <h2 className="text-6xl font-black text-highlight mb-4 mt-4">GAME OVER!</h2>
        <p className="text-8xl font-black text-primary mb-2">{score} pts</p>
        <p className="text-xl text-gray-400 mb-8">{results.length} rounds played</p>

        {shareText && (
          <button onClick={() => navigator.clipboard.writeText(shareText).then(() => alert('Copied to clipboard!'))}
            className="mb-8 px-8 py-4 bg-accent rounded-xl font-bold text-xl hover:bg-accent/80 transition-all hover:scale-105">
            📋 Copy Share Card
          </button>
        )}

        {/* Full-width results table */}
        <div className="w-full mb-8">
          <h3 className="font-bold text-2xl text-center mb-4">Round Summary</h3>
          <div className="bg-card rounded-xl overflow-hidden">
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
        </div>

        <div className="flex gap-4">
          <button onClick={() => startGame(mode, posFilter || undefined)}
            className="px-8 py-4 bg-primary rounded-xl font-bold text-xl hover:bg-primary/80 transition-all hover:scale-105">🔄 Play Again</button>
          <button onClick={() => setMode('menu')}
            className="px-8 py-4 bg-card rounded-xl font-bold text-xl hover:bg-card/80 transition-all hover:scale-105">🏠 Menu</button>
        </div>
      </div>
    );
  }

  // Active Game — 3-column desktop layout
  const lastResult = results.length > 0 ? results[results.length - 1] : null;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top header bar */}
      <div className="flex justify-between items-center px-8 py-3 bg-card/50 border-b border-gray-800">
        <button onClick={() => { if (confirm('Quit game?')) { endGame(); } }}
          className="text-gray-400 hover:text-white text-sm font-bold">✕ Quit</button>
        <div className="flex items-center gap-3"><img src="/swolecast-logo.png" alt="Swolecast" className="h-8" /><span className="text-sm uppercase tracking-widest text-gray-500 font-bold">COMBINE GUESS-OFF</span></div>
        <div className="text-gray-400 text-sm">
          {mode === 'quick' ? '⚡ Quick' : mode === 'position' ? `${posFilter} Challenge` : '♾️ Endless'}
        </div>
      </div>

      {/* Timer bar for quick mode */}
      {mode === 'quick' && !revealed && (
        <div className="w-full h-3 bg-card overflow-hidden">
          <div className="h-full transition-all duration-1000 ease-linear"
            style={{
              width: `${(timeLeft / 15) * 100}%`,
              backgroundColor: timeLeft <= 5 ? '#EF4444' : timeLeft <= 10 ? '#FFD166' : '#10B981',
              boxShadow: timeLeft <= 5 ? '0 0 20px #EF4444' : 'none',
            }} />
        </div>
      )}

      {/* 3-column main layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_1.5fr_1fr] gap-6 p-6 lg:p-8 max-w-[1600px] mx-auto w-full">
        {/* LEFT — Player Card */}
        <div className="flex flex-col items-center justify-center relative">
          {currentPlayer && (
            <div className="bg-card rounded-2xl p-8 text-center border-2 border-primary/30 w-full relative overflow-hidden">
              {showConfetti && <Confetti />}
              <div className="text-xs uppercase tracking-[0.3em] text-gray-400 mb-2">
                {currentPlayer.position} · {currentPlayer.year} NFL Combine
              </div>
              <h2 className="text-5xl lg:text-7xl font-black text-white mb-3 leading-tight">{currentPlayer.name}</h2>
              <p className="text-xl text-gray-400">{currentPlayer.college}</p>
              <p className="text-gray-500">Drafted by {currentPlayer.team}</p>

              {/* The big reveal zone */}
              <div className="mt-8 mb-4">
                {!revealed ? (
                  <div className="text-8xl lg:text-9xl font-black text-primary/20 select-none">?.??</div>
                ) : (
                  <div className="animate-reveal">
                    <div className="text-8xl lg:text-9xl font-black" style={{
                      color: getDeltaColor(lastResult?.delta || 1),
                      textShadow: `0 0 30px ${getDeltaColor(lastResult?.delta || 1)}40`,
                    }}>
                      {currentPlayer.forty.toFixed(2)}s
                    </div>
                    {lastResult && (
                      <div className="mt-4">
                        <div className={`text-3xl font-black ${lastResult.knowsBall ? 'text-success animate-knows-ball' : 'text-red-500 animate-learn-ball'}`}>
                          {lastResult.emoji} {lastResult.label}
                        </div>
                        <div className="text-xl mt-2">
                          <span className="text-gray-400">Guess: {lastResult.guess.toFixed(2)}</span>
                          <span className="mx-3 text-gray-600">·</span>
                          <span style={{ color: getDeltaColor(lastResult.delta) }}>Δ {lastResult.delta.toFixed(2)}s</span>
                          <span className="mx-3 text-gray-600">·</span>
                          <span className="text-highlight font-bold">+{lastResult.points}</span>
                        </div>
                        {easterEgg && <p className="mt-3 text-accent italic">{easterEgg}</p>}
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
            <div className="w-full max-w-xl space-y-6">
              {/* Big guess display */}
              <div className="text-center text-7xl lg:text-8xl font-black text-white">
                {guess.toFixed(2)}<span className="text-4xl text-gray-500">s</span>
              </div>

              {/* Slider with ticks and zones */}
              <SliderWithTicks guess={guess} setGuess={setGuess} onSubmit={handleSubmit} />

              {/* Number input */}
              <input
                type="number" min={4.20} max={5.40} step={0.01} value={guess.toFixed(2)}
                onChange={e => {
                  const v = parseFloat(e.target.value);
                  if (v >= 4.20 && v <= 5.40) setGuess(v);
                }}
                className="w-full p-4 bg-card rounded-xl text-center text-3xl font-bold border-2 border-primary/30 focus:border-primary outline-none"
              />

              {/* Submit button */}
              <button onClick={handleSubmit}
                className="w-full py-6 bg-primary hover:bg-primary/80 rounded-2xl text-3xl font-black transition-all hover:scale-105 active:scale-95 animate-pulse-glow">
                🎯 LOCK IT IN
              </button>
              <p className="text-center text-gray-500 text-sm">Press <kbd className="px-2 py-0.5 bg-card rounded text-gray-400">Enter</kbd> to submit · Arrow keys to adjust · <kbd className="px-2 py-0.5 bg-card rounded text-gray-400">Shift</kbd>+Arrow for ±0.05</p>
            </div>
          ) : (
            <div className="w-full max-w-xl">
              <button onClick={nextPlayer}
                className="w-full py-6 bg-accent hover:bg-accent/80 rounded-2xl text-3xl font-black transition-all hover:scale-105 active:scale-95">
                {idx + 1 >= maxRounds ? '📊 See Results' : '➡️ NEXT PLAYER'}
              </button>
              <p className="text-center text-gray-500 text-sm mt-3">Press <kbd className="px-2 py-0.5 bg-card rounded text-gray-400">Space</kbd> to continue</p>
            </div>
          )}
        </div>

        {/* RIGHT — Score Panel */}
        <div className="flex flex-col gap-4">
          {/* Score display */}
          <div className="bg-card rounded-2xl p-6 text-center border border-primary/20">
            <div className="text-sm uppercase tracking-widest text-gray-500 mb-1">Score</div>
            <div className="text-5xl font-black text-highlight">{score}</div>
          </div>

          {/* Round / Streak */}
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

          {/* Quick mode timer */}
          {mode === 'quick' && !revealed && (
            <div className="bg-card rounded-xl p-4 text-center">
              <div className="text-xs uppercase text-gray-500">Time Left</div>
              <div className={`text-4xl font-black ${timeLeft <= 5 ? 'text-red-500' : timeLeft <= 10 ? 'text-highlight' : 'text-success'}`}>
                {timeLeft}s
              </div>
            </div>
          )}

          {/* Recent results */}
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
