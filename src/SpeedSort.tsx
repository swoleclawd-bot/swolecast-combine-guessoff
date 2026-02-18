import { useState, useCallback, useEffect, useRef } from 'react';
import type { Player } from './types';
import { playSuccess, playFail } from './sounds';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type PositionFilter = 'All' | 'QB' | 'RB' | 'WR' | 'TE';

interface SpeedSortProps {
  allPlayers: Player[];
  onQuit: () => void;
}

type SlotState = (Player | null)[];

export default function SpeedSort({ allPlayers, onQuit }: SpeedSortProps) {
  const [posFilter, setPosFilter] = useState<PositionFilter>('All');
  const [, setRoundPlayers] = useState<Player[]>([]);
  const [slots, setSlots] = useState<SlotState>([null, null, null]);
  const [available, setAvailable] = useState<Player[]>([]);
  const [selected, setSelected] = useState<number | null>(null); // index in available for click-to-place
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState(0);
  const [round, setRound] = useState(0);
  const [lives, setLives] = useState(3);
  const [streak, setStreak] = useState(0);
  const [roundResult, setRoundResult] = useState<{ correct: number; label: string; emoji: string; points: number } | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [correctOrder, setCorrectOrder] = useState<Player[]>([]);
  const [slotResults, setSlotResults] = useState<boolean[]>([]);
  const [shareMsg, setShareMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const dragItem = useRef<{ source: 'available' | 'slot'; index: number } | null>(null);

  const filteredPlayers = posFilter === 'All' ? allPlayers : allPlayers.filter(p => p.position === posFilter);

  const startRound = useCallback(() => {
    const pool = posFilter === 'All' ? allPlayers : allPlayers.filter(p => p.position === posFilter);
    const picked = shuffle(pool).slice(0, 3);
    setRoundPlayers(picked);
    setCorrectOrder([...picked].sort((a, b) => a.forty - b.forty));
    setAvailable(shuffle(picked));
    setSlots([null, null, null]);
    setSelected(null);
    setRevealed(false);
    setRoundResult(null);
    setSlotResults([]);
  }, [allPlayers, posFilter]);

  useEffect(() => { if (filteredPlayers.length >= 3) startRound(); }, [filteredPlayers.length, startRound]);

  const handleDragStart = (source: 'available' | 'slot', index: number) => {
    dragItem.current = { source, index };
  };

  const handleDropOnSlot = (slotIdx: number) => {
    if (!dragItem.current || revealed) return;
    const { source, index } = dragItem.current;
    let player: Player | null = null;

    if (source === 'available') {
      player = available[index];
      if (!player) return;
      // Remove from available
      setAvailable(prev => prev.map((p, i) => i === index ? null! : p).filter(Boolean));
    } else {
      // From another slot
      player = slots[index];
      if (!player) return;
      setSlots(prev => { const n = [...prev]; n[index] = null; return n; });
    }

    // If slot already has a player, put them back in available
    setSlots(prev => {
      const n = [...prev];
      if (n[slotIdx]) {
        setAvailable(a => [...a, n[slotIdx]!]);
      }
      n[slotIdx] = player;
      return n;
    });
    dragItem.current = null;
  };

  const handleDropOnAvailable = () => {
    if (!dragItem.current || revealed) return;
    const { source, index } = dragItem.current;
    if (source === 'slot') {
      const player = slots[index];
      if (player) {
        setSlots(prev => { const n = [...prev]; n[index] = null; return n; });
        setAvailable(prev => [...prev, player]);
      }
    }
    dragItem.current = null;
  };

  // Click-to-place logic
  const handleCardClick = (playerIndex: number) => {
    if (revealed) return;
    setSelected(prev => prev === playerIndex ? null : playerIndex);
  };

  const handleSlotClick = (slotIdx: number) => {
    if (revealed) return;
    if (selected !== null) {
      // Place selected available card into slot
      const player = available[selected];
      if (!player) return;
      setAvailable(prev => prev.filter((_, i) => i !== selected));
      setSlots(prev => {
        const n = [...prev];
        if (n[slotIdx]) {
          setAvailable(a => [...a, n[slotIdx]!]);
        }
        n[slotIdx] = player;
        return n;
      });
      setSelected(null);
    } else if (slots[slotIdx]) {
      // Click on filled slot → return to available
      const player = slots[slotIdx]!;
      setSlots(prev => { const n = [...prev]; n[slotIdx] = null; return n; });
      setAvailable(prev => [...prev, player]);
    }
  };

  const allSlotsFilled = slots.every(s => s !== null);

  const handleLockIn = useCallback(() => {
    if (!allSlotsFilled || revealed) return;
    setRevealed(true);

    // Check correctness
    const results = slots.map((p, i) => p?.name === correctOrder[i]?.name);
    setSlotResults(results);
    const numCorrect = results.filter(Boolean).length;

    let points = 0;
    let label = '';
    let emoji = '';
    if (numCorrect === 3) {
      points = 100;
      label = 'KNOWS BALL';
      emoji = '🏈';
      playSuccess();
    } else if (numCorrect === 2) {
      points = 50;
      label = 'DECENT';
      emoji = '👀';
      playSuccess();
    } else {
      points = 0;
      label = 'LEARN BALL';
      emoji = '💀';
      playFail();
    }

    setRoundResult({ correct: numCorrect, label, emoji, points });
    setScore(s => s + points);
    setRound(r => r + 1);

    if (numCorrect === 3) {
      setStreak(s => s + 1);
    } else {
      setStreak(0);
      if (numCorrect < 2) {
        setLives(l => {
          if (l <= 1) setGameOver(true);
          return l - 1;
        });
      }
    }
  }, [allSlotsFilled, revealed, slots, correctOrder]);

  const handleNext = () => {
    if (gameOver) return;
    startRound();
  };

  // Keyboard: Enter to lock in
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !revealed && allSlotsFilled) {
        e.preventDefault();
        handleLockIn();
      } else if (e.key === ' ' && revealed && !gameOver) {
        e.preventDefault();
        handleNext();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  const slotLabels = ['🥇 FASTEST', '🥈 MIDDLE', '🥉 SLOWEST'];

  if (gameOver) {
    const text = shareMsg || `I scored ${score} points on the Swolecast Combine Guess-Off Speed Sort! 🏋️ Think you Know Ball? swolecast.com`;
    if (!shareMsg) setShareMsg(text);
    const handleShare = async () => {
      if (navigator.share) {
        try { await navigator.share({ text }); } catch { /* cancelled */ }
      } else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    };
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8">
        <img src="/swolecast-logo.png" alt="Swolecast" className="h-16 mb-4" />
        <h2 className="text-6xl font-black text-highlight mb-4">GAME OVER!</h2>
        <p className="text-8xl font-black text-primary mb-2">{score} pts</p>
        <p className="text-xl text-gray-400 mb-2">{round} rounds · Best streak: {streak}</p>
        <button onClick={handleShare}
          className="mt-4 mb-4 px-8 py-4 bg-accent rounded-xl font-bold text-xl hover:bg-accent/80 transition-all hover:scale-105">
          {copied ? '✅ Copied!' : '📤 Share'}
        </button>
        <div className="flex gap-4 mt-4">
          <button onClick={() => { setScore(0); setRound(0); setLives(3); setStreak(0); setGameOver(false); setShareMsg(''); setCopied(false); startRound(); }}
            className="px-8 py-4 bg-primary rounded-xl font-bold text-xl hover:bg-primary/80 transition-all hover:scale-105">🔄 Play Again</button>
          <button onClick={() => onQuit()}
            className="px-8 py-4 bg-card rounded-xl font-bold text-xl hover:bg-card/80 transition-all hover:scale-105">🏠 Menu</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center px-8 py-3 bg-card/50 border-b border-gray-800">
        <button onClick={() => onQuit()} className="text-gray-400 hover:text-white text-sm font-bold">✕ Quit</button>
        <div className="flex items-center gap-3">
          <img src="/swolecast-logo.png" alt="Swolecast" className="h-10" />
          <span className="text-3xl font-black text-primary mr-2">40</span>
          <span className="text-sm uppercase tracking-widest text-gray-500 font-bold">SPEED SORT</span>
        </div>
        <div className="text-gray-400 text-sm">Round {round + 1}</div>
      </div>

      {/* Position Filter */}
      <div className="flex justify-center gap-2 px-8 py-3 bg-card/30 border-b border-gray-800">
        {(['All', 'QB', 'RB', 'WR', 'TE'] as PositionFilter[]).map(pos => (
          <button key={pos} onClick={() => { if (!revealed && round === 0 && score === 0) { setPosFilter(pos); } else if (confirm('Changing position filter will restart the game. Continue?')) { setPosFilter(pos); setScore(0); setRound(0); setLives(3); setStreak(0); setGameOver(false); } }}
            className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all ${posFilter === pos ? 'bg-primary text-white shadow-[0_0_10px_rgba(124,58,237,0.4)]' : 'bg-card text-gray-400 hover:text-white hover:bg-card/80'}`}>
            {pos === 'All' ? '🎯 All' : pos === 'QB' ? '🎯 QB' : pos === 'RB' ? '🐂 RB' : pos === 'WR' ? '🏃 WR' : '🤚 TE'}
          </button>
        ))}
        <span className="text-gray-600 text-xs self-center ml-2">({filteredPlayers.length} players)</span>
      </div>

      {/* Main layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 p-6 lg:p-8 max-w-[1400px] mx-auto w-full">
        {/* Left: Game area */}
        <div className="flex flex-col gap-8">
          {/* Instruction */}
          <p className="text-center text-gray-400 text-lg">
            {!revealed ? 'Sort these players from FASTEST to SLOWEST 40-yard dash' : 'Results revealed!'}
          </p>

          {/* Available cards (unplaced) */}
          {available.length > 0 && !revealed && (
            <div className="flex flex-wrap justify-center gap-4"
              onDragOver={e => e.preventDefault()} onDrop={handleDropOnAvailable}>
              {available.map((player, i) => (
                <div key={player.name}
                  draggable
                  onDragStart={() => handleDragStart('available', i)}
                  onClick={() => handleCardClick(i)}
                  className={`bg-card border-2 rounded-2xl p-6 w-56 cursor-grab active:cursor-grabbing transition-all hover:scale-105 select-none
                    ${selected === i ? 'border-primary shadow-[0_0_20px_rgba(124,58,237,0.5)]' : 'border-gray-700 hover:border-primary/50'}`}>
                  <div className="text-2xl font-black text-white mb-1">{player.name}</div>
                  <div className="text-sm text-gray-400">{player.position} · {player.college}</div>
                  <div className="text-xs text-gray-500 mt-1">{player.year} Combine</div>
                </div>
              ))}
            </div>
          )}

          {/* Slots */}
          <div className="flex flex-col lg:flex-row justify-center gap-4">
            {slotLabels.map((label, i) => {
              const player = slots[i];
              const isCorrect = revealed && slotResults[i];
              const isWrong = revealed && !slotResults[i] && player;
              return (
                <div key={i}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => handleDropOnSlot(i)}
                  onClick={() => handleSlotClick(i)}
                  className={`relative rounded-2xl p-6 w-full lg:w-64 min-h-[180px] flex flex-col items-center justify-center transition-all border-2 border-dashed
                    ${isCorrect ? 'bg-success/20 border-success' : isWrong ? 'bg-red-500/20 border-red-500' : player ? 'bg-card border-primary' : 'bg-card/30 border-gray-600 hover:border-primary/50'}`}>
                  <div className={`text-xs uppercase tracking-widest mb-2 font-bold ${isCorrect ? 'text-success' : isWrong ? 'text-red-400' : 'text-gray-500'}`}>
                    {label}
                  </div>
                  {player ? (
                    <div draggable={!revealed} onDragStart={() => handleDragStart('slot', i)}
                      className={`text-center ${!revealed ? 'cursor-grab active:cursor-grabbing' : ''}`}>
                      <div className="text-xl font-black text-white">{player.name}</div>
                      <div className="text-sm text-gray-400">{player.position} · {player.college}</div>
                      {revealed && (
                        <div className="mt-2 animate-reveal">
                          <div className={`text-3xl font-black ${isCorrect ? 'text-success' : 'text-red-400'}`}>
                            {player.forty.toFixed(2)}s
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-gray-600 text-sm">Drop player here</div>
                  )}
                  {revealed && !slotResults[i] && player && (
                    <div className="text-xs text-gray-500 mt-1">
                      Should be: {correctOrder[i].name} ({correctOrder[i].forty.toFixed(2)}s)
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Action button */}
          <div className="text-center">
            {!revealed ? (
              <button onClick={handleLockIn} disabled={!allSlotsFilled}
                className={`px-12 py-5 rounded-2xl text-3xl font-black transition-all
                  ${allSlotsFilled ? 'bg-primary hover:bg-primary/80 hover:scale-105 active:scale-95 animate-pulse-glow cursor-pointer' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>
                🎯 LOCK IT IN
              </button>
            ) : (
              <div>
                {roundResult && (
                  <div className={`text-4xl font-black mb-4 ${roundResult.correct === 3 ? 'text-success animate-knows-ball' : roundResult.correct === 2 ? 'text-highlight' : 'text-red-500 animate-learn-ball'}`}>
                    {roundResult.emoji} {roundResult.label} <span className="text-2xl">+{roundResult.points}</span>
                  </div>
                )}
                <button onClick={handleNext}
                  className="px-12 py-5 bg-accent hover:bg-accent/80 rounded-2xl text-3xl font-black transition-all hover:scale-105 active:scale-95">
                  ➡️ NEXT ROUND
                </button>
                <p className="text-gray-500 text-sm mt-2">Press <kbd className="px-2 py-0.5 bg-card rounded text-gray-400">Space</kbd> to continue</p>
              </div>
            )}
          </div>
        </div>

        {/* Right: Score panel */}
        <div className="flex flex-col gap-4">
          <div className="bg-card rounded-2xl p-6 text-center border border-primary/20">
            <div className="text-sm uppercase tracking-widest text-gray-500 mb-1">Score</div>
            <div className="text-5xl font-black text-highlight">{score}</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-card rounded-xl p-4 text-center">
              <div className="text-xs uppercase text-gray-500">Round</div>
              <div className="text-2xl font-bold">{round + 1}</div>
            </div>
            <div className="bg-card rounded-xl p-4 text-center">
              <div className="text-xs uppercase text-gray-500">Streak</div>
              <div className="text-2xl font-bold text-accent">{streak > 0 ? `🔥 x${streak}` : '-'}</div>
            </div>
          </div>
          <div className="bg-card rounded-xl p-4 text-center">
            <div className="text-xs uppercase text-gray-500">Lives</div>
            <div className="text-3xl">{'❤️'.repeat(lives)}{'🖤'.repeat(3 - lives)}</div>
          </div>
          <div className="bg-card rounded-xl p-4 text-sm text-gray-500">
            <p className="font-bold text-gray-400 mb-2">Scoring</p>
            <p>🏈 All 3 correct: 100 pts</p>
            <p>👀 2 correct: 50 pts</p>
            <p>💀 0-1 correct: 0 pts + lose a life</p>
          </div>
        </div>
      </div>
    </div>
  );
}
