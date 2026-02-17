import { useState, useEffect, useCallback, useRef } from 'react';
import type { Player, GameMode, Position, GuessResult, HighScore } from './types';
import { scoreGuess, getEasterEgg, getDeltaColor } from './scoring';
import { playSuccess, playFail, playTick } from './sounds';

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
  const [revealPhase, setRevealPhase] = useState(0); // 0=hidden, 1=drumroll, 2=revealed
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
    setRevealPhase(0);
    setResults([]);
    setScore(0);
    setStreak(0);
    setTimeLeft(15);
    setGameOver(false);
    setEasterEgg(null);
    setShareText('');
    setMode(m);
    setPosFilter(pos || null);
  }, [allPlayers]);

  // Timer for quick mode
  useEffect(() => {
    if (mode === 'quick' && !revealed && !gameOver && revealPhase === 0) {
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
  }, [mode, revealed, gameOver, idx, revealPhase]);

  const handleSubmit = useCallback(() => {
    if (revealed || gameOver || !players[idx]) return;
    if (timerRef.current) clearInterval(timerRef.current);

    // Drumroll phase
    setRevealPhase(1);
    setTimeout(() => {
      const player = players[idx];
      const result = scoreGuess(player, guess, streak);
      const egg = getEasterEgg(player, guess);

      if (result.knowsBall) {
        playSuccess();
      } else {
        playFail();
      }

      const newStreak = result.knowsBall ? streak + 1 : 0;
      setStreak(newStreak);
      setScore(s => s + result.points);
      setResults(r => [...r, result]);
      setRevealed(true);
      setRevealPhase(2);
      setEasterEgg(egg);
    }, 1200);
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
    setRevealPhase(0);
    setEasterEgg(null);
    setTimeLeft(15);
  }, [idx, mode, players.length]);

  const endGame = useCallback(() => {
    setGameOver(true);
    const modeLabel = mode === 'quick' ? 'Quick Round' : mode === 'position' ? `${posFilter} Challenge` : 'Endless';
    saveHighScore({ score, mode: modeLabel, date: new Date().toLocaleDateString(), rounds: results.length });
    const knowsBallCount = results.filter(r => r.knowsBall).length;
    setShareText(`🏈 Swolecast Combine Guess-Off\n\nScore: ${score} pts | ${knowsBallCount}/${results.length} Knows Ball\n\nThink you know ball? #Swolecast #CombineGuessOff`);
  }, [score, mode, posFilter, results]);

  const currentPlayer = players[idx];
  const maxRounds = mode === 'quick' ? 10 : players.length;

  if (!allPlayers.length) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-5xl font-black animate-pulse text-primary">Loading... 🏈</div>
      </div>
    );
  }

  // ═══════════════════════════════════════
  // LEADERBOARD
  // ═══════════════════════════════════════
  if (showLeaderboard) {
    const scores = getHighScores();
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8">
        <div className="w-full max-w-2xl">
          <button onClick={() => setShowLeaderboard(false)}
            className="mb-8 px-6 py-3 bg-primary/20 border border-primary rounded-xl text-primary font-bold hover:bg-primary/30 transition-all text-lg">
            ← Back
          </button>
          <h2 className="text-6xl font-black text-center mb-10 text-highlight">🏆 LEADERBOARD</h2>
          {scores.length === 0 ? (
            <p className="text-center text-gray-500 text-2xl">No scores yet. Go play!</p>
          ) : (
            <div className="space-y-3">
              {scores.map((s, i) => (
                <div key={i} className="bg-card p-6 rounded-2xl flex justify-between items-center border border-primary/10 hover:border-primary/40 transition-all">
                  <div className="flex items-center gap-4">
                    <span className="text-4xl">{i === 0 ? '👑' : i === 1 ? '🥈' : i === 2 ? '🥉' : ''}</span>
                    <span className="text-3xl font-black text-highlight">{s.score}</span>
                    <span className="text-xl text-gray-400">pts</span>
                  </div>
                  <div className="text-right text-gray-400">
                    <div className="text-lg font-semibold">{s.mode}</div>
                    <div className="text-sm">{s.rounds} rounds · {s.date}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════
  // MAIN MENU
  // ═══════════════════════════════════════
  if (mode === 'menu') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8">
        {/* Big hero title */}
        <div className="text-center mb-16">
          <h1 className="text-7xl md:text-8xl lg:text-9xl font-black tracking-tighter leading-none">
            <span className="text-primary">SWOLECAST</span>
          </h1>
          <h2 className="text-5xl md:text-6xl lg:text-7xl font-black tracking-tight text-accent mt-2">
            COMBINE GUESS-OFF
          </h2>
          <div className="flex items-center justify-center gap-4 mt-6">
            <span className="text-5xl">🏈</span>
            <p className="text-highlight text-2xl italic font-medium">No Research, No Filter, All Vibes</p>
            <span className="text-5xl">💪</span>
          </div>
        </div>

        {/* Mode buttons — big, bold, desktop-friendly */}
        <div className="flex flex-col lg:flex-row gap-6 w-full max-w-5xl mb-10">
          <button onClick={() => startGame('quick')}
            className="flex-1 py-8 px-10 bg-gradient-to-br from-primary to-primary/60 hover:from-primary/90 hover:to-primary/50 rounded-3xl text-3xl font-black transition-all hover:scale-105 animate-pulse-glow border-2 border-primary/50 group">
            <div className="text-5xl mb-2">⚡</div>
            <div>Quick Round</div>
            <div className="text-base opacity-60 font-medium mt-1">10 players · 15 seconds each</div>
          </button>
          <button onClick={() => startGame('endless')}
            className="flex-1 py-8 px-10 bg-gradient-to-br from-accent to-accent/60 hover:from-accent/90 hover:to-accent/50 rounded-3xl text-3xl font-black transition-all hover:scale-105 border-2 border-accent/50">
            <div className="text-5xl mb-2">♾️</div>
            <div>Endless Mode</div>
            <div className="text-base opacity-60 font-medium mt-1">No timer · go until you quit</div>
          </button>
        </div>

        {/* Position challenge */}
        <div className="bg-card rounded-3xl p-8 w-full max-w-5xl border border-primary/20 mb-10">
          <p className="text-center font-black mb-6 text-xl uppercase tracking-widest text-gray-400">Position Challenge</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {(['WR', 'RB', 'QB', 'TE'] as Position[]).map(pos => (
              <button key={pos} onClick={() => startGame('position', pos)}
                className="py-6 bg-bg hover:bg-primary/20 rounded-2xl font-black text-2xl transition-all border-2 border-primary/20 hover:border-primary hover:scale-105">
                <div className="text-4xl mb-1">{pos === 'WR' ? '🏃' : pos === 'RB' ? '🐂' : pos === 'QB' ? '🎯' : '🤚'}</div>
                {pos} Only
              </button>
            ))}
          </div>
        </div>

        <button onClick={() => setShowLeaderboard(true)}
          className="px-10 py-4 bg-card hover:bg-card/80 rounded-2xl font-bold text-xl text-highlight transition-all border border-highlight/30 hover:border-highlight">
          🏆 Leaderboard
        </button>
      </div>
    );
  }

  // ═══════════════════════════════════════
  // GAME OVER
  // ═══════════════════════════════════════
  if (gameOver) {
    const knowsBallCount = results.filter(r => r.knowsBall).length;
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8">
        <div className="w-full max-w-4xl">
          <h2 className="text-7xl font-black text-highlight text-center mb-4 animate-reveal">GAME OVER</h2>
          <div className="text-center mb-8">
            <div className="text-8xl font-black text-primary">{score}</div>
            <div className="text-2xl text-gray-400 mt-2">
              {knowsBallCount}/{results.length} Knows Ball 🏈 · {results.length - knowsBallCount} Learn Ball 💀
            </div>
          </div>

          {shareText && (
            <div className="text-center mb-8">
              <button onClick={() => navigator.clipboard.writeText(shareText).then(() => alert('Copied to clipboard! Share it!'))}
                className="px-10 py-4 bg-accent rounded-2xl font-black text-2xl hover:bg-accent/80 transition-all hover:scale-105">
                📋 Share Results
              </button>
            </div>
          )}

          {/* Results table */}
          <div className="bg-card rounded-3xl p-6 border border-primary/20 mb-8">
            <div className="grid gap-2">
              {results.map((r, i) => (
                <div key={i} className={`p-4 rounded-xl flex items-center justify-between ${r.knowsBall ? 'bg-success/10 border border-success/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                  <div className="flex items-center gap-4">
                    <span className="text-3xl w-12 text-center">{r.knowsBall ? '🏈' : '💀'}</span>
                    <div>
                      <div className="font-black text-xl">{r.player.name}</div>
                      <div className="text-gray-400 text-sm">{r.player.position} · {r.player.year}</div>
                    </div>
                  </div>
                  <div className="text-right flex items-center gap-6">
                    <div>
                      <div className="text-gray-400 text-sm">Guess</div>
                      <div className="font-bold text-lg">{r.guess.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-gray-400 text-sm">Actual</div>
                      <div className="font-black text-lg">{r.player.forty.toFixed(2)}</div>
                    </div>
                    <div className="w-20 text-right">
                      <div className="text-sm" style={{ color: getDeltaColor(r.delta) }}>Δ {r.delta.toFixed(2)}</div>
                      <div className="font-black text-highlight text-lg">+{r.points}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-center gap-6">
            <button onClick={() => startGame(mode, posFilter || undefined)}
              className="px-10 py-4 bg-primary rounded-2xl font-black text-2xl hover:bg-primary/80 transition-all hover:scale-105">
              🔄 Play Again
            </button>
            <button onClick={() => setMode('menu')}
              className="px-10 py-4 bg-card border border-primary/30 rounded-2xl font-black text-2xl hover:bg-card/80 transition-all">
              🏠 Menu
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════
  // ACTIVE GAME — Desktop-first layout
  // ═══════════════════════════════════════
  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-8 py-4 bg-card/50 border-b border-primary/10">
        <button onClick={() => { if (confirm('Quit game?')) endGame(); }}
          className="text-gray-500 hover:text-white text-lg font-bold transition-all">✕ Quit</button>
        <div className="text-center">
          <span className="text-sm uppercase tracking-widest text-gray-500 font-bold">
            {mode === 'quick' ? 'Quick Round' : mode === 'position' ? `${posFilter} Challenge` : 'Endless'}
          </span>
        </div>
        <div className="text-lg text-gray-400 font-bold">{idx + 1} / {maxRounds}</div>
      </div>

      {/* Main content — desktop 3-column layout */}
      <div className="flex-1 flex">
        {/* Left sidebar — Score & Streak */}
        <div className="hidden lg:flex w-72 flex-col items-center justify-center bg-card/30 border-r border-primary/10 p-8">
          <div className="text-center mb-8">
            <div className="text-sm uppercase tracking-widest text-gray-500 font-bold mb-2">Score</div>
            <div className="text-7xl font-black text-highlight">{score}</div>
          </div>
          {streak > 0 && (
            <div className="text-center mb-8 animate-pulse">
              <div className="text-sm uppercase tracking-widest text-gray-500 font-bold mb-2">Streak</div>
              <div className="text-5xl font-black text-accent">🔥 {streak}</div>
            </div>
          )}
          {mode === 'quick' && !revealed && revealPhase === 0 && (
            <div className="text-center">
              <div className="text-sm uppercase tracking-widest text-gray-500 font-bold mb-2">Time</div>
              <div className={`text-6xl font-black ${timeLeft <= 5 ? 'text-red-500 animate-pulse' : timeLeft <= 10 ? 'text-highlight' : 'text-success'}`}>
                {timeLeft}
              </div>
            </div>
          )}
        </div>

        {/* Center — Main game area */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 lg:p-12">
          {/* Mobile score bar */}
          <div className="lg:hidden flex items-center justify-between w-full mb-4">
            <div className="text-highlight font-black text-2xl">{score} pts</div>
            {streak > 0 && <div className="text-accent font-bold text-lg">🔥 x{streak}</div>}
            {mode === 'quick' && !revealed && revealPhase === 0 && (
              <div className={`font-black text-2xl ${timeLeft <= 5 ? 'text-red-500' : 'text-success'}`}>{timeLeft}s</div>
            )}
          </div>

          {/* Timer bar for quick mode */}
          {mode === 'quick' && !revealed && revealPhase === 0 && (
            <div className="w-full max-w-3xl h-3 bg-card rounded-full mb-8 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-1000 ease-linear"
                style={{
                  width: `${(timeLeft / 15) * 100}%`,
                  backgroundColor: timeLeft <= 5 ? '#EF4444' : timeLeft <= 10 ? '#FFD166' : '#10B981'
                }} />
            </div>
          )}

          {/* Player Card */}
          {currentPlayer && (
            <div className="w-full max-w-3xl">
              <div className="bg-card rounded-3xl p-8 lg:p-12 text-center border-2 border-primary/20 mb-8 relative overflow-hidden">
                {/* Position badge */}
                <div className="absolute top-6 right-6 bg-primary/20 border border-primary/40 rounded-full px-4 py-1 text-lg font-bold text-primary">
                  {currentPlayer.position}
                </div>

                <div className="text-sm uppercase tracking-[0.3em] text-gray-500 font-bold mb-3">
                  {currentPlayer.year} NFL Combine
                </div>
                <h2 className="text-5xl lg:text-7xl font-black text-white mb-4 tracking-tight">
                  {currentPlayer.name}
                </h2>
                <p className="text-xl text-gray-400 mb-1">{currentPlayer.college}</p>
                <p className="text-gray-600">Drafted by {currentPlayer.team}</p>

                {/* The 40 time — THE BIG REVEAL */}
                <div className="mt-10 mb-4">
                  {revealPhase === 0 && (
                    <div className="text-8xl lg:text-9xl font-black text-primary/20 select-none">?.??</div>
                  )}
                  {revealPhase === 1 && (
                    <div className="text-8xl lg:text-9xl font-black text-primary/40 animate-pulse">
                      ?.??
                    </div>
                  )}
                  {revealPhase === 2 && results.length > 0 && (() => {
                    const r = results[results.length - 1];
                    return (
                      <div className="animate-reveal">
                        <div className="text-8xl lg:text-[10rem] font-black leading-none"
                          style={{ color: getDeltaColor(r.delta) }}>
                          {currentPlayer.forty.toFixed(2)}
                        </div>
                        <div className={`mt-6 text-5xl lg:text-6xl font-black ${r.knowsBall ? 'text-success' : 'text-red-500'}`}>
                          {r.emoji} {r.label}
                        </div>
                        <div className="mt-4 flex items-center justify-center gap-6 text-xl">
                          <span className="text-gray-400">
                            Your guess: <span className="text-white font-bold">{r.guess.toFixed(2)}</span>
                          </span>
                          <span className="text-3xl font-black" style={{ color: getDeltaColor(r.delta) }}>
                            Δ {r.delta.toFixed(2)}s
                          </span>
                          <span className="text-highlight font-black text-3xl">+{r.points}</span>
                        </div>
                        {easterEgg && (
                          <p className="mt-4 text-accent italic text-lg">{easterEgg}</p>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Guess controls */}
              {!revealed && revealPhase === 0 ? (
                <div className="space-y-6">
                  <div className="text-center text-6xl lg:text-7xl font-black text-white">
                    {guess.toFixed(2)}<span className="text-3xl text-gray-500 ml-1">s</span>
                  </div>
                  <div className="px-4">
                    <input
                      type="range" min="4.20" max="5.40" step="0.01" value={guess}
                      onChange={e => setGuess(parseFloat(e.target.value))}
                      className="w-full h-4"
                    />
                    <div className="flex justify-between text-sm text-gray-500 mt-2 font-bold">
                      <span>4.20 🚀 Blazing</span>
                      <span>Lineman 🐌 5.40</span>
                    </div>
                  </div>
                  <div className="flex justify-center gap-4">
                    <input
                      type="number" min={4.20} max={5.40} step={0.01} value={guess.toFixed(2)}
                      onChange={e => {
                        const v = parseFloat(e.target.value);
                        if (v >= 4.20 && v <= 5.40) setGuess(v);
                      }}
                      className="w-40 p-4 bg-card rounded-xl text-center text-2xl font-bold border-2 border-primary/30 focus:border-primary outline-none"
                    />
                    <button onClick={handleSubmit}
                      className="px-12 py-4 bg-gradient-to-r from-primary to-accent rounded-xl text-3xl font-black transition-all hover:scale-105 active:scale-95 hover:shadow-[0_0_40px_rgba(124,58,237,0.5)]">
                      🎯 LOCK IT IN
                    </button>
                  </div>
                </div>
              ) : revealPhase === 1 ? (
                <div className="text-center py-8">
                  <div className="text-4xl font-black text-primary animate-pulse tracking-widest">
                    REVEALING...
                  </div>
                </div>
              ) : (
                <div className="text-center">
                  <button onClick={nextPlayer}
                    className="px-16 py-5 bg-gradient-to-r from-accent to-primary rounded-xl text-3xl font-black transition-all hover:scale-105 active:scale-95 hover:shadow-[0_0_40px_rgba(236,72,153,0.5)]">
                    {idx + 1 >= maxRounds ? '📊 See Results' : '➡️ NEXT PLAYER'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right sidebar — Recent guesses */}
        <div className="hidden lg:flex w-80 flex-col bg-card/30 border-l border-primary/10 p-6">
          <div className="text-sm uppercase tracking-widest text-gray-500 font-bold mb-4 text-center">History</div>
          <div className="space-y-2 flex-1 overflow-y-auto">
            {results.slice().reverse().map((r, i) => (
              <div key={i}
                className={`p-4 rounded-xl border ${r.knowsBall ? 'bg-success/5 border-success/20' : 'bg-red-500/5 border-red-500/20'}`}
                style={{ opacity: Math.max(0.3, 1 - i * 0.1) }}>
                <div className="flex justify-between items-center">
                  <span className="font-bold">{r.player.name}</span>
                  <span className="text-xl">{r.emoji}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-400 mt-1">
                  <span>{r.guess.toFixed(2)} → {r.player.forty.toFixed(2)}</span>
                  <span className="text-highlight font-bold">+{r.points}</span>
                </div>
              </div>
            ))}
            {results.length === 0 && (
              <p className="text-gray-600 text-center text-sm italic mt-8">Guesses will appear here</p>
            )}
          </div>
        </div>
      </div>

      {/* Mobile history */}
      {results.length > 0 && (
        <div className="lg:hidden px-4 pb-4">
          <div className="space-y-1">
            {results.slice(-3).reverse().map((r, i) => (
              <div key={i} className="bg-card/50 p-3 rounded-xl flex justify-between text-sm" style={{ opacity: 1 - i * 0.2 }}>
                <span className="font-bold">{r.player.name}</span>
                <span>{r.emoji} +{r.points}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
