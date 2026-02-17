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
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch('/players.json').then(r => r.json()).then((data: Player[]) => {
      // dedupe by name
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
    setMode(m);
    setPosFilter(pos || null);
  }, [allPlayers]);

  // Timer for quick mode
  useEffect(() => {
    if (mode === 'quick' && !revealed && !gameOver) {
      timerRef.current = setInterval(() => {
        setTimeLeft(t => {
          if (t <= 1) {
            // auto-submit
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

  const handleSubmit = useCallback(() => {
    if (revealed || gameOver || !players[idx]) return;
    const player = players[idx];
    const result = scoreGuess(player, guess, streak);
    const egg = getEasterEgg(player, guess);

    if (result.points >= 50) {
      playSuccess();
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
  }, [idx, mode, players.length]);

  const endGame = useCallback(() => {
    setGameOver(true);
    const maxPossible = results.length * 100 + (revealed ? 100 : 0);
    void maxPossible;
    const modeLabel = mode === 'quick' ? 'Quick Round' : mode === 'position' ? `${posFilter} Challenge` : 'Endless';
    saveHighScore({ score, mode: modeLabel, date: new Date().toLocaleDateString(), rounds: results.length });
    setShareText(`I scored ${score}/${maxPossible > 0 ? maxPossible : results.length * 100} on the @Swolecast Combine Guess-Off! 🏈💪\n\nThink you can beat me? #Swolecast #CombineGuessOff`);
  }, [score, mode, posFilter, results, revealed]);

  const currentPlayer = players[idx];
  const maxRounds = mode === 'quick' ? 10 : players.length;

  if (!allPlayers.length) return <div className="flex items-center justify-center min-h-screen text-2xl">Loading players... 🏈</div>;

  // Leaderboard overlay
  if (showLeaderboard) {
    const scores = getHighScores();
    return (
      <div className="min-h-screen p-4 max-w-lg mx-auto">
        <button onClick={() => setShowLeaderboard(false)} className="mb-4 px-4 py-2 bg-primary rounded-lg text-white font-bold">← Back</button>
        <h2 className="text-3xl font-bold text-center mb-6 text-highlight">🏆 Leaderboard</h2>
        {scores.length === 0 ? <p className="text-center text-gray-400">No scores yet. Play a game!</p> :
          <div className="space-y-2">
            {scores.map((s, i) => (
              <div key={i} className="bg-card p-4 rounded-lg flex justify-between items-center">
                <div>
                  <span className="text-xl font-bold text-highlight">{i === 0 ? '👑' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i+1}`}</span>
                  <span className="ml-2 font-semibold">{s.score} pts</span>
                </div>
                <div className="text-sm text-gray-400">{s.mode} · {s.rounds}r · {s.date}</div>
              </div>
            ))}
          </div>
        }
      </div>
    );
  }

  // Menu
  if (mode === 'menu') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-6xl font-black tracking-tight">
            <span className="text-primary">🏈 SWOLECAST</span>
            <br />
            <span className="text-accent">COMBINE GUESS-OFF</span> 💪
          </h1>
          <p className="text-highlight mt-2 text-lg italic font-medium">No Research, No Filter, All Vibes</p>
        </div>

        <div className="space-y-4 w-full max-w-sm">
          <button onClick={() => startGame('quick')}
            className="w-full py-4 px-6 bg-primary hover:bg-primary/80 rounded-xl text-xl font-bold transition-all hover:scale-105 animate-pulse-glow">
            ⚡ Quick Round <span className="text-sm opacity-70">(10 players, 15s each)</span>
          </button>
          <button onClick={() => startGame('endless')}
            className="w-full py-4 px-6 bg-accent hover:bg-accent/80 rounded-xl text-xl font-bold transition-all hover:scale-105">
            ♾️ Endless Mode <span className="text-sm opacity-70">(no timer)</span>
          </button>

          <div className="bg-card rounded-xl p-4">
            <p className="text-center font-bold mb-3 text-sm uppercase tracking-wide text-gray-400">Position Challenge</p>
            <div className="grid grid-cols-2 gap-2">
              {(['WR', 'RB', 'QB', 'TE'] as Position[]).map(pos => (
                <button key={pos} onClick={() => startGame('position', pos)}
                  className="py-3 bg-bg hover:bg-primary/30 rounded-lg font-bold text-lg transition-all border border-primary/30 hover:border-primary">
                  {pos === 'WR' ? '🏃' : pos === 'RB' ? '🐂' : pos === 'QB' ? '🎯' : '🤚'} {pos} Only
                </button>
              ))}
            </div>
          </div>

          <button onClick={() => setShowLeaderboard(true)}
            className="w-full py-3 bg-card hover:bg-card/80 rounded-xl font-bold text-highlight transition-all">
            🏆 Leaderboard
          </button>
        </div>
      </div>
    );
  }

  // Game Over
  if (gameOver) {
    return (
      <div className="min-h-screen flex flex-col items-center p-4 max-w-2xl mx-auto">
        <h2 className="text-4xl font-black text-highlight mb-2 mt-8">GAME OVER!</h2>
        <p className="text-6xl font-black text-primary mb-4">{score} pts</p>
        <p className="text-gray-400 mb-6">{results.length} rounds played</p>

        {shareText && (
          <button onClick={() => navigator.clipboard.writeText(shareText).then(() => alert('Copied to clipboard!'))}
            className="mb-6 px-6 py-3 bg-accent rounded-xl font-bold hover:bg-accent/80 transition-all">
            📋 Copy Share Card
          </button>
        )}

        <div className="w-full space-y-2 mb-6">
          <h3 className="font-bold text-lg text-center mb-3">Round Summary</h3>
          {results.map((r, i) => (
            <div key={i} className="bg-card p-3 rounded-lg flex justify-between items-center text-sm">
              <div className="flex-1">
                <span className="font-bold">{r.player.name}</span>
                <span className="text-gray-400 ml-2">{r.player.position}</span>
              </div>
              <div className="text-right">
                <span className="text-gray-400">Guess: {r.guess.toFixed(2)}</span>
                <span className="mx-2">|</span>
                <span className="font-bold">{r.player.forty.toFixed(2)}</span>
                <span className="ml-2" style={{ color: getDeltaColor(r.delta) }}>
                  {r.emoji} +{r.points}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button onClick={() => startGame(mode, posFilter || undefined)}
            className="px-6 py-3 bg-primary rounded-xl font-bold hover:bg-primary/80">🔄 Play Again</button>
          <button onClick={() => setMode('menu')}
            className="px-6 py-3 bg-card rounded-xl font-bold hover:bg-card/80">🏠 Menu</button>
        </div>
      </div>
    );
  }

  // Active Game
  return (
    <div className="min-h-screen flex flex-col p-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <button onClick={() => { if (confirm('Quit game?')) { endGame(); } }}
          className="text-gray-400 hover:text-white text-sm">✕ Quit</button>
        <div className="text-center">
          <span className="text-highlight font-black text-2xl">{score}</span>
          <span className="text-gray-400 text-sm ml-1">pts</span>
        </div>
        <div className="text-right">
          {streak > 1 && <span className="text-accent font-bold">🔥 x{streak}</span>}
          <span className="text-gray-400 text-sm ml-2">{idx + 1}/{maxRounds}</span>
        </div>
      </div>

      {/* Timer bar for quick mode */}
      {mode === 'quick' && !revealed && (
        <div className="w-full h-2 bg-card rounded-full mb-4 overflow-hidden">
          <div className="h-full rounded-full transition-all duration-1000"
            style={{
              width: `${(timeLeft / 15) * 100}%`,
              backgroundColor: timeLeft <= 5 ? '#EF4444' : timeLeft <= 10 ? '#FFD166' : '#10B981'
            }} />
        </div>
      )}

      {/* Player Card */}
      {currentPlayer && (
        <div className="bg-card rounded-2xl p-6 mb-6 text-center border-2 border-primary/30">
          <div className="text-xs uppercase tracking-widest text-gray-400 mb-1">{currentPlayer.position} · {currentPlayer.year} NFL Combine</div>
          <h2 className="text-3xl font-black text-white mb-2">{currentPlayer.name}</h2>
          <p className="text-gray-400">{currentPlayer.college}</p>
          <p className="text-gray-500 text-sm">Drafted by {currentPlayer.team}</p>

          {/* Hidden/Revealed 40 time */}
          <div className="mt-6">
            {!revealed ? (
              <div className="text-5xl font-black text-primary/30">?.??</div>
            ) : (
              <div className="animate-reveal">
                <div className="text-5xl font-black" style={{ color: getDeltaColor(results[results.length - 1]?.delta || 1) }}>
                  {currentPlayer.forty.toFixed(2)}s
                </div>
                {results.length > 0 && (() => {
                  const r = results[results.length - 1];
                  return (
                    <div className="mt-3">
                      <div className="text-2xl font-bold">{r.emoji} {r.label}</div>
                      <div className="text-lg mt-1">
                        <span className="text-gray-400">Your guess: {r.guess.toFixed(2)}</span>
                        <span className="mx-2">·</span>
                        <span style={{ color: getDeltaColor(r.delta) }}>Δ {r.delta.toFixed(2)}s</span>
                        <span className="mx-2">·</span>
                        <span className="text-highlight font-bold">+{r.points}</span>
                      </div>
                      {easterEgg && <p className="mt-2 text-accent italic text-sm">{easterEgg}</p>}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Guess Input */}
      {!revealed ? (
        <div className="space-y-4">
          <div className="text-center text-4xl font-black text-white">{guess.toFixed(2)}s</div>
          <input
            type="range" min="4.20" max="5.40" step="0.01" value={guess}
            onChange={e => setGuess(parseFloat(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>4.20 (Blazing)</span><span>5.40 (Lineman)</span>
          </div>
          <input
            type="number" min={4.20} max={5.40} step={0.01} value={guess.toFixed(2)}
            onChange={e => {
              const v = parseFloat(e.target.value);
              if (v >= 4.20 && v <= 5.40) setGuess(v);
            }}
            className="w-full p-3 bg-card rounded-lg text-center text-xl font-bold border border-primary/30 focus:border-primary outline-none"
          />
          <button onClick={handleSubmit}
            className="w-full py-4 bg-primary hover:bg-primary/80 rounded-xl text-xl font-black transition-all hover:scale-105 active:scale-95">
            🎯 LOCK IT IN
          </button>
        </div>
      ) : (
        <button onClick={nextPlayer}
          className="w-full py-4 bg-accent hover:bg-accent/80 rounded-xl text-xl font-black transition-all hover:scale-105 active:scale-95">
          {idx + 1 >= maxRounds ? '📊 See Results' : '➡️ NEXT PLAYER'}
        </button>
      )}

      {/* Recent results */}
      {results.length > 0 && (
        <div className="mt-6 space-y-1">
          {results.slice(-5).reverse().map((r, i) => (
            <div key={i} className="bg-card/50 p-2 rounded flex justify-between text-sm" style={{ opacity: 1 - i * 0.15 }}>
              <span>{r.player.name}</span>
              <span>{r.emoji} +{r.points}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
