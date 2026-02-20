import { useState, useCallback, useEffect, useRef } from 'react';
import { playSuccess, playFail } from './sounds';

export interface DraftPlayer {
  name: string;
  position: string;
  draftRound: number;
  draftPick: number;
  draftYear: number;
  college: string;
  team: string;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface DraftSortProps {
  onQuit: () => void;
}

type SlotState = (DraftPlayer | null)[];

export default function DraftSort({ onQuit }: DraftSortProps) {
  const [allPlayers, setAllPlayers] = useState<DraftPlayer[]>([]);
  const [slots, setSlots] = useState<SlotState>([null, null, null]);
  const [available, setAvailable] = useState<DraftPlayer[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState(0);
  const [round, setRound] = useState(0);
  const [lives, setLives] = useState(3);
  const [streak, setStreak] = useState(0);
  const [roundResult, setRoundResult] = useState<{ correct: number; label: string; emoji: string; points: number } | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [correctOrder, setCorrectOrder] = useState<DraftPlayer[]>([]);
  const [slotResults, setSlotResults] = useState<boolean[]>([]);
  const [copied, setCopied] = useState(false);
  const dragItem = useRef<{ source: 'available' | 'slot'; index: number } | null>(null);

  useEffect(() => {
    fetch('/players-draft.json').then(r => r.json()).then((data: DraftPlayer[]) => {
      const seen = new Set<string>();
      const unique = data.filter(p => { if (seen.has(p.name)) return false; seen.add(p.name); return true; });
      setAllPlayers(unique);
    });
  }, []);

  const startRound = useCallback(() => {
    if (allPlayers.length < 3) return;
    const picked = shuffle(allPlayers).slice(0, 3);
    // Sort by draft round (earliest first), then by pick number
    setCorrectOrder([...picked].sort((a, b) => a.draftRound - b.draftRound || a.draftPick - b.draftPick));
    setAvailable(shuffle(picked));
    setSlots([null, null, null]);
    setSelected(null);
    setRevealed(false);
    setRoundResult(null);
    setSlotResults([]);
  }, [allPlayers]);

  useEffect(() => { if (allPlayers.length >= 3) startRound(); }, [allPlayers.length, startRound]);

  const handleDragStart = (source: 'available' | 'slot', index: number) => {
    dragItem.current = { source, index };
  };

  const handleDropOnSlot = (slotIdx: number) => {
    if (!dragItem.current || revealed) return;
    const { source, index } = dragItem.current;
    let player: DraftPlayer | null = null;

    if (source === 'available') {
      player = available[index];
      if (!player) return;
      setAvailable(prev => prev.filter((_, i) => i !== index));
    } else {
      player = slots[index];
      if (!player) return;
      setSlots(prev => { const n = [...prev]; n[index] = null; return n; });
    }

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

  const handleCardClick = (playerIndex: number) => {
    if (revealed) return;
    setSelected(prev => prev === playerIndex ? null : playerIndex);
  };

  const handleSlotClick = (slotIdx: number) => {
    if (revealed) return;
    if (selected !== null) {
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
      const player = slots[slotIdx]!;
      setSlots(prev => { const n = [...prev]; n[slotIdx] = null; return n; });
      setAvailable(prev => [...prev, player]);
    }
  };

  const allSlotsFilled = slots.every(s => s !== null);

  const handleLockIn = useCallback(() => {
    if (!allSlotsFilled || revealed) return;
    setRevealed(true);

    const results = slots.map((p, i) => p?.name === correctOrder[i]?.name);
    setSlotResults(results);
    const numCorrect = results.filter(Boolean).length;

    let points = 0, label = '', emoji = '';
    if (numCorrect === 3) {
      points = 100; label = 'KNOWS BALL'; emoji = '🏈'; playSuccess();
    } else if (numCorrect === 2) {
      points = 50; label = 'DECENT'; emoji = '👀'; playSuccess();
    } else {
      points = 0; label = 'LEARN BALL'; emoji = '💀'; playFail();
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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !revealed && allSlotsFilled) {
        e.preventDefault(); handleLockIn();
      } else if (e.key === ' ' && revealed && !gameOver) {
        e.preventDefault(); handleNext();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  const slotLabels = ['📈 EARLIEST PICK', '🔄 MIDDLE', '📉 LATEST PICK'];

  if (!allPlayers.length) return <div className="flex items-center justify-center min-h-screen text-xl lg:text-3xl font-bold px-4 text-center">Loading draft data... 📋</div>;

  // Game Over Screen
  if (gameOver) {
    const msg = `I scored ${score} points sorting NFL Draft picks on Swolecast Combine Games! 🏈📋 swolecast.com`;
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 lg:p-8">
        <div className="text-center mb-6 lg:mb-8">
          <img src="/swolecast-logo.png" alt="Swolecast" className="h-12 lg:h-16 mx-auto mb-3" />
          <h2 className="text-4xl lg:text-6xl font-black text-red-500 mb-2">GAME OVER</h2>
          <p className="text-gray-400 text-lg lg:text-xl">You ran out of lives!</p>
        </div>
        <div className="bg-card rounded-2xl p-6 lg:p-10 text-center mb-6 lg:mb-8 border-2 border-primary/30">
          <div className="text-sm uppercase tracking-widest text-gray-500 mb-1">Final Score</div>
          <div className="text-6xl lg:text-8xl font-black text-highlight mb-2">{score}</div>
          <div className="text-gray-400">Rounds: {round} · Best Streak: {streak > 0 ? `🔥 ${streak}` : '-'}</div>
        </div>
        <div className="flex flex-col gap-3 w-full max-w-sm">
          <button onClick={async () => {
            if (navigator.share) { try { await navigator.share({ text: msg }); } catch {} }
            else { await navigator.clipboard.writeText(msg); setCopied(true); setTimeout(() => setCopied(false), 2000); }
          }} className="py-4 bg-accent hover:bg-accent/80 rounded-xl font-bold text-lg transition-all min-h-[52px]">
            {copied ? '✅ Copied!' : '📤 Share'}
          </button>
          <button onClick={() => { setGameOver(false); setScore(0); setRound(0); setLives(3); setStreak(0); startRound(); }}
            className="py-4 bg-primary hover:bg-primary/80 rounded-xl font-bold text-lg transition-all min-h-[52px]">🔄 Play Again</button>
          <button onClick={onQuit} className="py-4 bg-card hover:bg-card/80 rounded-xl font-bold text-lg transition-all min-h-[52px]">🏠 Menu</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center px-4 lg:px-8 py-2 lg:py-3 bg-card/50 border-b border-gray-800">
        <button onClick={() => { if (confirm('Quit game?')) onQuit(); }} className="text-gray-400 hover:text-white text-sm font-bold min-h-[44px] min-w-[44px]">✕ Quit</button>
        <div className="flex items-center gap-2"><img src="/swolecast-logo.png" alt="Swolecast" className="h-6 lg:h-8" /><span className="text-xs lg:text-sm uppercase tracking-widest text-gray-500 font-bold">DRAFT SORT</span></div>
        <div className="text-red-400 text-lg font-bold">{'❤️'.repeat(lives)}</div>
      </div>

      {/* Score bar */}
      <div className="flex justify-around items-center px-4 py-2 bg-card/30 border-b border-gray-800">
        <div className="text-center"><div className="text-xs uppercase text-gray-500">Score</div><div className="text-2xl font-black text-highlight">{score}</div></div>
        <div className="text-center"><div className="text-xs uppercase text-gray-500">Round</div><div className="text-lg font-bold">{round + 1}</div></div>
        <div className="text-center"><div className="text-xs uppercase text-gray-500">Streak</div><div className="text-lg font-bold text-accent">{streak > 0 ? `🔥 x${streak}` : '-'}</div></div>
      </div>

      {/* Main game area */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 lg:p-8 gap-4 lg:gap-6">
        <div className="text-center mb-2">
          <h2 className="text-2xl lg:text-4xl font-black text-white mb-1">Sort by Draft Round</h2>
          <p className="text-gray-400 text-sm lg:text-base">Earliest pick → Latest pick</p>
        </div>

        {/* Slots */}
        <div className="grid grid-cols-3 gap-3 lg:gap-6 w-full max-w-4xl">
          {slots.map((player, i) => (
            <div key={i}
              onClick={() => handleSlotClick(i)}
              onDragOver={e => e.preventDefault()}
              onDrop={() => handleDropOnSlot(i)}
              className={`relative rounded-2xl p-4 lg:p-6 min-h-[140px] lg:min-h-[200px] border-2 transition-all cursor-pointer flex flex-col items-center justify-center
                ${player ? 'bg-card border-primary/50' : 'bg-card/30 border-dashed border-gray-600 hover:border-primary/50'}
                ${revealed && slotResults[i] ? 'border-green-500 bg-green-500/10' : ''}
                ${revealed && !slotResults[i] && player ? 'border-red-500 bg-red-500/10' : ''}`}>
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-bg px-2 text-xs lg:text-sm font-bold text-gray-400 whitespace-nowrap">{slotLabels[i]}</div>
              {player ? (
                <div draggable={!revealed} onDragStart={() => handleDragStart('slot', i)} className="text-center">
                  <div className="text-lg lg:text-2xl font-black text-white mb-1">{player.name}</div>
                  <div className="text-xs lg:text-sm text-gray-400">{player.position} · {player.college}</div>
                  {revealed && (
                    <div className="mt-2 text-sm lg:text-base font-bold" style={{ color: slotResults[i] ? '#10B981' : '#EF4444' }}>
                      Round {player.draftRound} · Pick {player.draftPick}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-gray-600 text-sm lg:text-base">Drop player here</div>
              )}
            </div>
          ))}
        </div>

        {/* Result display */}
        {revealed && roundResult && (
          <div className={`text-center py-3 px-6 rounded-xl ${roundResult.correct === 3 ? 'bg-green-500/20' : roundResult.correct === 2 ? 'bg-yellow-500/20' : 'bg-red-500/20'}`}>
            <span className="text-2xl lg:text-3xl font-black">{roundResult.emoji} {roundResult.label}</span>
            <span className="ml-3 text-xl lg:text-2xl font-bold text-highlight">+{roundResult.points}</span>
          </div>
        )}

        {/* Available players */}
        <div className="w-full max-w-4xl" onDragOver={e => e.preventDefault()} onDrop={handleDropOnAvailable}>
          <div className="text-center text-sm text-gray-500 mb-2">Available Players</div>
          <div className="flex flex-wrap justify-center gap-3 lg:gap-4 min-h-[80px]">
            {available.map((player, i) => (
              <div key={player.name}
                draggable={!revealed}
                onDragStart={() => handleDragStart('available', i)}
                onClick={() => handleCardClick(i)}
                className={`bg-card rounded-xl p-3 lg:p-4 cursor-pointer transition-all hover:scale-105 border-2 min-w-[120px] lg:min-w-[160px] text-center
                  ${selected === i ? 'border-primary scale-105 shadow-lg shadow-primary/20' : 'border-primary/30 hover:border-primary/60'}`}>
                <div className="text-base lg:text-lg font-black text-white">{player.name}</div>
                <div className="text-xs text-gray-400">{player.position} · {player.draftYear}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Action button */}
        {!revealed ? (
          <button onClick={handleLockIn} disabled={!allSlotsFilled}
            className={`w-full max-w-sm py-4 lg:py-5 rounded-2xl text-xl lg:text-2xl font-black transition-all min-h-[52px]
              ${allSlotsFilled ? 'bg-primary hover:bg-primary/80 hover:scale-105 animate-pulse-glow' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>
            🎯 LOCK IT IN
          </button>
        ) : (
          <button onClick={handleNext}
            className="w-full max-w-sm py-4 lg:py-5 bg-accent hover:bg-accent/80 rounded-2xl text-xl lg:text-2xl font-black transition-all hover:scale-105 min-h-[52px]">
            ➡️ NEXT ROUND
          </button>
        )}

        <p className="hidden lg:block text-center text-gray-500 text-sm">
          Click to select, then click a slot · Drag and drop also works · Press <kbd className="px-2 py-0.5 bg-card rounded text-gray-400">Enter</kbd> to lock in
        </p>
      </div>
    </div>
  );
}
