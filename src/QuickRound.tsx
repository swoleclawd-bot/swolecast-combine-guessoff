import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { Player, BenchPlayer, QuickRoundResult, Position } from './types';
import { playSuccess, playFail, playTick } from './sounds';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type MiniGameType = 'guess40' | 'combinedReps' | 'speedSort5';

interface Guess40Round {
  type: 'guess40';
  player: Player;
}

interface CombinedRepsRound {
  type: 'combinedReps';
  players: BenchPlayer[];
  totalReps: number;
}

interface SpeedSort5Round {
  type: 'speedSort5';
  players: Player[];
  correctOrder: Player[];
}

type MiniGame = Guess40Round | CombinedRepsRound | SpeedSort5Round;

interface QuickRoundProps {
  fortyPlayers: Player[];
  benchPlayers: BenchPlayer[];
  posFilter?: Position;
  onQuit: (score: number, rounds: number, modeName: string) => void;
}

const TOTAL_ROUNDS = 10;
const TIMER_GUESS40 = 7;
const TIMER_COMBINED_REPS = 10;
const TIMER_SPEED_SORT = 15;

export default function QuickRound({ fortyPlayers, benchPlayers, posFilter, onQuit }: QuickRoundProps) {
  const [rounds, setRounds] = useState<MiniGame[]>([]);
  const [currentRound, setCurrentRound] = useState(0);
  const [timeLeft, setTimeLeft] = useState(TIMER_GUESS40);
  const [revealed, setRevealed] = useState(false);
  const [results, setResults] = useState<QuickRoundResult[]>([]);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [shareMsg, setShareMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Guess40 state
  const [guess40, setGuess40] = useState(4.75);

  // CombinedReps state
  const [repsGuess, setRepsGuess] = useState(50);

  // SpeedSort5 state — click-to-order + drag-to-reorder
  const [sortOrder, setSortOrder] = useState<Player[]>([]); // players in order clicked
  const [sortCards, setSortCards] = useState<Player[]>([]); // shuffled display order
  const dragSortRef = useRef<number | null>(null); // drag source index in sortOrder

  // Generate all rounds upfront
  useEffect(() => {
    const pool40 = posFilter ? fortyPlayers.filter(p => p.position === posFilter) : fortyPlayers;
    const poolBench = posFilter ? benchPlayers.filter(p => p.position === posFilter) : benchPlayers;

    const gameTypes: MiniGameType[] = ['guess40', 'combinedReps', 'speedSort5'];
    const generatedRounds: MiniGame[] = [];

    for (let i = 0; i < TOTAL_ROUNDS; i++) {
      // Pick a random type, but ensure we have enough data
      const availableTypes = gameTypes.filter(t => {
        if (t === 'guess40') return pool40.length >= 1;
        if (t === 'combinedReps') return poolBench.length >= 3;
        if (t === 'speedSort5') return pool40.length >= 5;
        return false;
      });
      if (availableTypes.length === 0) break;

      const type = availableTypes[Math.floor(Math.random() * availableTypes.length)];

      if (type === 'guess40') {
        const player = shuffle(pool40)[0];
        generatedRounds.push({ type: 'guess40', player });
      } else if (type === 'combinedReps') {
        const picked = shuffle(poolBench).slice(0, 3);
        generatedRounds.push({ type: 'combinedReps', players: picked, totalReps: picked.reduce((s, p) => s + p.benchReps, 0) });
      } else {
        const picked = shuffle(pool40).slice(0, 5);
        const correct = [...picked].sort((a, b) => a.forty - b.forty);
        generatedRounds.push({ type: 'speedSort5', players: picked, correctOrder: correct });
      }
    }
    setRounds(generatedRounds);
  }, [fortyPlayers, benchPlayers, posFilter]);

  const currentGame = rounds[currentRound];

  const getTimerForGame = (game: MiniGame) => {
    if (game.type === 'guess40') return TIMER_GUESS40;
    if (game.type === 'combinedReps') return TIMER_COMBINED_REPS;
    return TIMER_SPEED_SORT;
  };

  // Reset state when round changes
  useEffect(() => {
    if (!currentGame) return;
    setRevealed(false);
    setTimeLeft(getTimerForGame(currentGame));
    setGuess40(4.75);
    setRepsGuess(50);
    if (currentGame.type === 'speedSort5') {
      setSortOrder([]);
      setSortCards(shuffle(currentGame.players));
    }
  }, [currentRound, currentGame]);

  const handleSubmit = useCallback(() => {
    if (revealed || !currentGame) return;
    setRevealed(true);
    if (timerRef.current) clearInterval(timerRef.current);

    let knowsBall = false;
    let detail = '';

    if (currentGame.type === 'guess40') {
      const delta = Math.abs(guess40 - currentGame.player.forty);
      knowsBall = delta <= 0.05;
      detail = `Guessed ${guess40.toFixed(2)} · Actual ${currentGame.player.forty.toFixed(2)} (Δ${delta.toFixed(2)}s)`;
    } else if (currentGame.type === 'combinedReps') {
      const diff = Math.abs(repsGuess - currentGame.totalReps);
      knowsBall = diff <= 5;
      detail = `Guessed ${repsGuess} · Actual ${currentGame.totalReps} reps (off by ${diff})`;
    } else if (currentGame.type === 'speedSort5') {
      const allCorrect = sortOrder.length === 5 && sortOrder.every((p, i) => p.name === currentGame.correctOrder[i]?.name);
      knowsBall = allCorrect;
      const numCorrect = sortOrder.filter((p, i) => p.name === currentGame.correctOrder[i]?.name).length;
      detail = `${numCorrect}/5 correct`;
    }

    if (knowsBall) {
      playSuccess();
      setScore(s => s + 100);
    } else {
      playFail();
    }

    const question = currentGame.type === 'guess40' ? `Guess the 40: ${currentGame.player.name}`
      : currentGame.type === 'combinedReps' ? `Combined Reps: ${currentGame.players.map(p => p.name).join(', ')}`
      : `Speed Sort 5`;

    setResults(r => [...r, { type: currentGame.type, question, knowsBall, detail }]);
  }, [revealed, currentGame, guess40, repsGuess, sortOrder]);

  const handleNext = useCallback(() => {
    const next = currentRound + 1;
    if (next >= rounds.length) {
      setGameOver(true);
      const finalScore = score;
      const modeName = posFilter ? `${posFilter} Challenge` : 'Quick Round';
      setShareMsg(`I scored ${finalScore} points on the Swolecast Combine Games ${modeName}! 🏋️ Think you Know Ball? swolecast.com`);
      return;
    }
    setCurrentRound(next);
  }, [currentRound, rounds.length, score, posFilter]);

  // Timer
  useEffect(() => {
    if (revealed || gameOver || !currentGame) return;
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          handleSubmit();
          return currentGame ? getTimerForGame(currentGame) : TIMER_GUESS40;
        }
        if (t <= 4) playTick();
        return t - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [revealed, gameOver, currentGame, currentRound, handleSubmit]);

  // Keyboard
  useEffect(() => {
    if (gameOver) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !revealed) { e.preventDefault(); handleSubmit(); }
      else if (e.key === ' ' && revealed) { e.preventDefault(); handleNext(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [gameOver, revealed, handleSubmit, handleNext]);

  // SpeedSort5 click-to-order + drag-to-reorder
  const handleSortCardClick = (player: Player) => {
    if (revealed) return;
    const alreadyIdx = sortOrder.findIndex(p => p.name === player.name);
    if (alreadyIdx >= 0) {
      // Remove from order (undo)
      setSortOrder(prev => prev.filter((_, i) => i !== alreadyIdx));
    } else {
      const newOrder = [...sortOrder, player];
      setSortOrder(newOrder);
      // Auto-submit when all 5 placed
      if (newOrder.length === 5) {
        setTimeout(() => handleSubmit(), 100);
      }
    }
  };

  const handleOrderDragStart = (idx: number) => {
    dragSortRef.current = idx;
  };

  const handleOrderDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragSortRef.current === null || dragSortRef.current === idx) return;
    setSortOrder(prev => {
      const n = [...prev];
      const [moved] = n.splice(dragSortRef.current!, 1);
      n.splice(idx, 0, moved);
      dragSortRef.current = idx;
      return n;
    });
  };

  const handleShare = async () => {
    if (navigator.share) {
      try { await navigator.share({ text: shareMsg }); } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(shareMsg);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const modeName = posFilter ? `${posFilter} CHALLENGE` : 'QUICK ROUND';

  if (!rounds.length) return <div className="flex items-center justify-center min-h-screen text-3xl font-bold">Loading... ⚡</div>;

  // Game Over
  if (gameOver) {
    const knowsBallCount = results.filter(r => r.knowsBall).length;
    return (
      <div className="min-h-screen flex flex-col items-center p-8 max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-2"><img src="/swolecast-logo.png" alt="" className="h-10" /><span className="text-sm uppercase tracking-widest text-gray-500 font-bold">COMBINE GAMES</span></div>
        <h2 className="text-6xl font-black text-highlight mb-4 mt-4">GAME OVER!</h2>
        <p className="text-8xl font-black text-primary mb-2">{score} pts</p>
        <p className="text-xl text-gray-400 mb-2">{knowsBallCount}/{results.length} Knows Ball</p>

        <button onClick={handleShare}
          className="mb-8 mt-4 px-8 py-4 bg-accent rounded-xl font-bold text-xl hover:bg-accent/80 transition-all hover:scale-105">
          {copied ? '✅ Copied!' : '📤 Share'}
        </button>

        <div className="w-full mb-8">
          <h3 className="font-bold text-2xl text-center mb-4">Round Summary</h3>
          <div className="space-y-2">
            {results.map((r, i) => (
              <div key={i} className={`bg-card rounded-xl p-4 flex justify-between items-center ${r.knowsBall ? 'border-l-4 border-green-500' : 'border-l-4 border-red-500'}`}>
                <div>
                  <div className="font-bold text-sm text-gray-400 uppercase">{r.type === 'guess40' ? 'Guess the 40' : r.type === 'combinedReps' ? 'Combined Reps' : 'Speed Sort 5'}</div>
                  <div className="text-sm text-gray-300">{r.detail}</div>
                </div>
                <div className={`text-2xl font-black ${r.knowsBall ? 'text-green-400' : 'text-red-400'}`}>
                  {r.knowsBall ? '🏈 KNOWS BALL' : '💀 LEARN BALL'}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-4">
          <button onClick={() => { setGameOver(false); setResults([]); setScore(0); setCurrentRound(0); /* regenerate rounds */ window.location.reload(); }}
            className="px-8 py-4 bg-primary rounded-xl font-bold text-xl hover:bg-primary/80 transition-all hover:scale-105">🔄 Play Again</button>
          <button onClick={() => onQuit(score, results.length, posFilter ? `${posFilter} Challenge` : 'Quick Round')}
            className="px-8 py-4 bg-card rounded-xl font-bold text-xl hover:bg-card/80 transition-all hover:scale-105">🏠 Menu</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center px-8 py-3 bg-card/50 border-b border-gray-800">
        <button onClick={() => onQuit(score, results.length, posFilter ? `${posFilter} Challenge` : 'Quick Round')} className="text-gray-400 hover:text-white text-sm font-bold">✕ Quit</button>
        <div className="flex items-center gap-3">
          <img src="/swolecast-logo.png" alt="" className="h-10" />
          <span className="text-sm uppercase tracking-widest text-gray-500 font-bold">{modeName}</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-gray-400 text-sm">Round {currentRound + 1}/{rounds.length}</span>
          <span className="font-black text-highlight text-xl">{score} pts</span>
        </div>
      </div>

      {/* Timer bar */}
      {!revealed && (
        <div className="w-full h-3 bg-card overflow-hidden">
          <div className="h-full transition-all duration-1000 ease-linear"
            style={{
              width: `${(timeLeft / (currentGame ? getTimerForGame(currentGame) : TIMER_GUESS40)) * 100}%`,
              backgroundColor: timeLeft <= 3 ? '#EF4444' : timeLeft <= 5 ? '#FFD166' : '#10B981',
              boxShadow: timeLeft <= 3 ? '0 0 20px #EF4444' : 'none',
            }} />
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 max-w-4xl mx-auto w-full">
        {/* Timer display */}
        {!revealed && (
          <div className={`text-6xl font-black mb-6 ${timeLeft <= 3 ? 'text-red-500 animate-pulse' : 'text-highlight'}`}>
            {timeLeft}s
          </div>
        )}

        {/* Game type label */}
        <div className="text-xs uppercase tracking-[0.3em] text-gray-500 font-bold mb-4">
          {currentGame.type === 'guess40' ? '🏃 GUESS THE 40' : currentGame.type === 'combinedReps' ? '💪 COMBINED REPS' : '⚡ SPEED SORT 5'}
        </div>

        {/* === GUESS THE 40 === */}
        {currentGame.type === 'guess40' && (
          <div className="w-full max-w-xl text-center">
            <div className="bg-card rounded-2xl p-8 mb-6 border-2 border-primary/30">
              <div className="text-sm text-gray-400 mb-1">{currentGame.player.position} · {currentGame.player.college}</div>
              <h2 className="text-5xl font-black text-white mb-2">{currentGame.player.name}</h2>
              {revealed && (
                <div className="animate-reveal mt-4">
                  <div className={`text-7xl font-black ${Math.abs(guess40 - currentGame.player.forty) <= 0.05 ? 'text-green-400' : 'text-red-400'}`}>
                    {currentGame.player.forty.toFixed(2)}s
                  </div>
                  <div className="text-gray-400 mt-2">Your guess: {guess40.toFixed(2)}s</div>
                </div>
              )}
            </div>
            {!revealed && (
              <>
                <div className="text-6xl font-black text-white mb-4">{guess40.toFixed(2)}<span className="text-3xl text-gray-500">s</span></div>
                <input type="range" min={4.20} max={5.40} step={0.01} value={guess40}
                  onChange={e => setGuess40(parseFloat(e.target.value))}
                  className="w-full mb-4 cursor-pointer" />
                <button onClick={handleSubmit}
                  className="w-full py-5 bg-primary hover:bg-primary/80 rounded-2xl text-2xl font-black transition-all hover:scale-105 animate-pulse-glow">
                  🎯 LOCK IT IN
                </button>
              </>
            )}
          </div>
        )}

        {/* === COMBINED REPS === */}
        {currentGame.type === 'combinedReps' && (
          <div className="w-full max-w-xl text-center">
            <h3 className="text-2xl font-bold text-gray-300 mb-4">How many TOTAL bench press reps?</h3>
            <div className="flex justify-center gap-4 mb-6">
              {currentGame.players.map(p => (
                <div key={p.name} className="bg-card rounded-xl p-4 border border-gray-700 w-48">
                  <div className="text-lg font-black text-white">{p.name}</div>
                  <div className="text-sm text-gray-400">{p.position}</div>
                  {revealed && <div className={`text-2xl font-black mt-2 ${Math.abs(repsGuess - currentGame.totalReps) <= 5 ? 'text-green-400' : 'text-red-400'}`}>{p.benchReps} reps</div>}
                </div>
              ))}
            </div>
            {revealed ? (
              <div className="animate-reveal">
                <div className={`text-7xl font-black ${Math.abs(repsGuess - currentGame.totalReps) <= 5 ? 'text-green-400' : 'text-red-400'}`}>
                  {currentGame.totalReps} total reps
                </div>
                <div className="text-gray-400 mt-2">Your guess: {repsGuess}</div>
              </div>
            ) : (
              <>
                <div className="text-6xl font-black text-white mb-4">{repsGuess}<span className="text-3xl text-gray-500"> reps</span></div>
                <input type="range" min={10} max={100} step={1} value={repsGuess}
                  onChange={e => setRepsGuess(parseInt(e.target.value))}
                  className="w-full mb-4 cursor-pointer" />
                <button onClick={handleSubmit}
                  className="w-full py-5 bg-primary hover:bg-primary/80 rounded-2xl text-2xl font-black transition-all hover:scale-105 animate-pulse-glow">
                  🎯 LOCK IT IN
                </button>
              </>
            )}
          </div>
        )}

        {/* === SPEED SORT 5 === */}
        {currentGame.type === 'speedSort5' && (
          <div className="w-full max-w-4xl text-center">
            <h3 className="text-xl font-bold text-gray-300 mb-4">Click players FASTEST → SLOWEST</h3>

            {/* Player cards — click to order */}
            <div className="flex flex-wrap justify-center gap-3 mb-6">
              {sortCards.map((p) => {
                const orderIdx = sortOrder.findIndex(op => op.name === p.name);
                const isPlaced = orderIdx >= 0;
                const isCorrect = revealed && isPlaced && sortOrder[orderIdx]?.name === currentGame.correctOrder[orderIdx]?.name;
                const isWrong = revealed && isPlaced && sortOrder[orderIdx]?.name !== currentGame.correctOrder[orderIdx]?.name;
                return (
                  <div key={p.name} onClick={() => handleSortCardClick(p)}
                    className={`relative bg-card border-2 rounded-xl p-4 w-44 cursor-pointer transition-all hover:scale-105 select-none
                      ${isCorrect ? 'border-green-500 bg-green-500/20' : isWrong ? 'border-red-500 bg-red-500/20' : isPlaced ? 'border-primary shadow-[0_0_15px_rgba(124,58,237,0.5)]' : 'border-gray-700 hover:border-primary/50'}`}>
                    {isPlaced && (
                      <div className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-primary text-white font-black text-lg flex items-center justify-center shadow-lg">
                        {orderIdx + 1}
                      </div>
                    )}
                    <div className="text-lg font-black text-white">{p.name}</div>
                    <div className="text-xs text-gray-400">{p.position}</div>
                    {revealed && <div className={`text-lg font-black mt-1 ${isCorrect ? 'text-green-400' : 'text-red-400'}`}>{p.forty.toFixed(2)}s</div>}
                  </div>
                );
              })}
            </div>

            {/* Order preview — draggable to reorder */}
            {!revealed && sortOrder.length > 0 && (
              <div className="mb-4">
                <div className="text-xs text-gray-500 mb-2">Your order (drag to reorder):</div>
                <div className="flex justify-center gap-2">
                  {sortOrder.map((p, i) => (
                    <div key={p.name} draggable
                      onDragStart={() => handleOrderDragStart(i)}
                      onDragOver={e => handleOrderDragOver(e, i)}
                      onDragEnd={() => { dragSortRef.current = null; }}
                      className="bg-primary/20 border border-primary rounded-lg px-3 py-2 text-sm cursor-grab active:cursor-grabbing hover:bg-primary/30 transition-all select-none">
                      <span className="font-black text-primary mr-1">{i + 1}.</span>
                      <span className="text-white">{p.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Revealed correct order */}
            {revealed && (
              <div className="mt-4">
                <div className="text-sm text-gray-500 mb-2">Correct order:</div>
                <div className="flex justify-center gap-2">
                  {currentGame.correctOrder.map((p, i) => (
                    <div key={p.name} className="bg-card border border-gray-700 rounded-lg px-3 py-1 text-sm">
                      <span className="font-black text-green-400 mr-1">{i + 1}.</span>
                      <span className="text-gray-300">{p.name}</span>
                      <span className="text-gray-500 ml-1">{p.forty.toFixed(2)}s</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!revealed && (
              <button onClick={handleSubmit}
                disabled={sortOrder.length === 0}
                className={`mt-4 px-12 py-5 rounded-2xl text-2xl font-black transition-all
                  ${sortOrder.length > 0 ? 'bg-primary hover:bg-primary/80 hover:scale-105 animate-pulse-glow cursor-pointer' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>
                🎯 LOCK IT IN {sortOrder.length < 5 && `(${sortOrder.length}/5)`}
              </button>
            )}
          </div>
        )}

        {/* Revealed result + next button */}
        {revealed && (
          <div className="mt-6 text-center">
            {results.length > 0 && (
              <div className={`text-4xl font-black mb-4 ${results[results.length - 1].knowsBall ? 'text-green-400 animate-knows-ball' : 'text-red-500 animate-learn-ball'}`}>
                {results[results.length - 1].knowsBall ? '🏈 KNOWS BALL' : '💀 LEARN BALL'}
              </div>
            )}
            <button onClick={handleNext}
              className="px-12 py-5 bg-accent hover:bg-accent/80 rounded-2xl text-2xl font-black transition-all hover:scale-105">
              {currentRound + 1 >= rounds.length ? '📊 See Results' : '➡️ NEXT'}
            </button>
            <p className="text-gray-500 text-sm mt-2">Press <kbd className="px-2 py-0.5 bg-card rounded text-gray-400">Space</kbd></p>
          </div>
        )}
      </div>
    </div>
  );
}
