import { useState, useCallback, useEffect, useRef } from 'react';
import { playSuccess, playFail } from './sounds';
import Leaderboard from './Leaderboard';

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
  onRecordScore: (score: number) => Promise<string>;
}

type RoundSlots = { [round: number]: DraftPlayer[] };

export default function DraftSort({ onQuit, onRecordScore }: DraftSortProps) {
  const [allPlayers, setAllPlayers] = useState<DraftPlayer[]>([]);
  const [available, setAvailable] = useState<DraftPlayer[]>([]);
  const [roundSlots, setRoundSlots] = useState<RoundSlots>({ 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] });
  const [selected, setSelected] = useState<{ source: 'available' | number; index: number } | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState(0);
  const [copied, setCopied] = useState(false);
  const [slotCorrectness, setSlotCorrectness] = useState<{ [round: number]: boolean[] }>({});
  const [leaderboardEntryId, setLeaderboardEntryId] = useState<string | null>(null);
  const scoreRecordedRef = useRef(false);
  const dragItem = useRef<{ source: 'available' | number; index: number; player: DraftPlayer } | null>(null);

  useEffect(() => {
    fetch('/players-draft.json').then(r => r.json()).then((data: DraftPlayer[]) => {
      setAllPlayers(data);
      setAvailable(shuffle(data));
    });
  }, []);

  const resetGame = useCallback(() => {
    setAvailable(shuffle(allPlayers));
    setRoundSlots({ 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] });
    setSelected(null);
    setRevealed(false);
    setScore(0);
    setSlotCorrectness({});
    setLeaderboardEntryId(null);
    scoreRecordedRef.current = false;
  }, [allPlayers]);

  const handleDragStart = (source: 'available' | number, index: number, player: DraftPlayer) => {
    dragItem.current = { source, index, player };
  };

  const handleDropOnRound = (round: number) => {
    if (!dragItem.current || revealed) return;
    const { source, index, player } = dragItem.current;
    
    // Check if round already has 3 players
    if (roundSlots[round].length >= 3) {
      dragItem.current = null;
      return;
    }

    // Remove from source
    if (source === 'available') {
      setAvailable(prev => prev.filter((_, i) => i !== index));
    } else {
      setRoundSlots(prev => ({
        ...prev,
        [source]: prev[source].filter((_, i) => i !== index)
      }));
    }

    // Add to round
    setRoundSlots(prev => ({
      ...prev,
      [round]: [...prev[round], player]
    }));

    dragItem.current = null;
    setSelected(null);
  };

  const handleDropOnAvailable = () => {
    if (!dragItem.current || revealed) return;
    const { source, index, player } = dragItem.current;
    
    if (source !== 'available') {
      setRoundSlots(prev => ({
        ...prev,
        [source]: prev[source].filter((_, i) => i !== index)
      }));
      setAvailable(prev => [...prev, player]);
    }
    dragItem.current = null;
    setSelected(null);
  };

  const handleCardClick = (source: 'available' | number, index: number, _player: DraftPlayer) => {
    if (revealed) return;
    
    if (selected && selected.source === source && selected.index === index) {
      setSelected(null);
      return;
    }
    
    setSelected({ source, index });
  };

  const handleRoundClick = (round: number) => {
    if (revealed || !selected) return;
    
    if (roundSlots[round].length >= 3) return;
    
    const { source, index } = selected;
    let player: DraftPlayer;
    
    if (source === 'available') {
      player = available[index];
      setAvailable(prev => prev.filter((_, i) => i !== index));
    } else {
      player = roundSlots[source][index];
      setRoundSlots(prev => ({
        ...prev,
        [source]: prev[source].filter((_, i) => i !== index)
      }));
    }
    
    setRoundSlots(prev => ({
      ...prev,
      [round]: [...prev[round], player]
    }));
    
    setSelected(null);
  };

  const handleSlotClick = (round: number, index: number, player: DraftPlayer) => {
    if (revealed) return;
    
    if (selected && selected.source === round && selected.index === index) {
      // Return to available
      setRoundSlots(prev => ({
        ...prev,
        [round]: prev[round].filter((_, i) => i !== index)
      }));
      setAvailable(prev => [...prev, player]);
      setSelected(null);
    } else {
      setSelected({ source: round, index });
    }
  };

  const allSlotsFilled = Object.values(roundSlots).every(slots => slots.length === 3);

  const handleLockIn = useCallback(() => {
    if (!allSlotsFilled || revealed) return;
    setRevealed(true);

    let totalCorrect = 0;
    const correctness: { [round: number]: boolean[] } = {};
    
    for (let round = 1; round <= 7; round++) {
      correctness[round] = roundSlots[round].map(player => {
        const isCorrect = player.draftRound === round;
        if (isCorrect) totalCorrect++;
        return isCorrect;
      });
    }
    
    setSlotCorrectness(correctness);
    
    const points = totalCorrect * 10;
    setScore(points);
    
    if (totalCorrect >= 18) {
      playSuccess();
    } else {
      playFail();
    }
  }, [allSlotsFilled, revealed, roundSlots]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !revealed && allSlotsFilled) {
        e.preventDefault();
        handleLockIn();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [revealed, allSlotsFilled, handleLockIn]);

  const getLabel = (correct: number) => {
    if (correct === 21) return { emoji: '🏆', label: 'PERFECT!', color: 'text-yellow-400' };
    if (correct >= 18) return { emoji: '🏈', label: 'KNOWS BALL', color: 'text-green-400' };
    if (correct >= 14) return { emoji: '👀', label: 'DECENT', color: 'text-blue-400' };
    if (correct >= 10) return { emoji: '😬', label: 'NEEDS WORK', color: 'text-orange-400' };
    return { emoji: '💀', label: 'LEARN BALL', color: 'text-red-400' };
  };

  const totalCorrect = Object.values(slotCorrectness).flat().filter(Boolean).length;

  useEffect(() => {
    if (!revealed || scoreRecordedRef.current) return;
    scoreRecordedRef.current = true;
    onRecordScore(score).then(id => setLeaderboardEntryId(id));
  }, [onRecordScore, revealed, score]);

  if (!allPlayers.length) {
    return (
      <div className="flex items-center justify-center min-h-screen text-xl lg:text-3xl font-bold px-4 text-center">
        Loading draft data... 📋
      </div>
    );
  }

  // Results Screen
  if (revealed) {
    const result = getLabel(totalCorrect);
    const shareMsg = `I got ${totalCorrect}/21 correct on Swolecast Draft Sort! ${result.emoji} ${result.label} swolecast.com`;
    
    return (
      <div className="min-h-screen flex flex-col p-2 lg:p-4">
        {/* Header */}
        <div className="flex justify-between items-center px-2 lg:px-4 py-2 mb-2">
          <div className="flex items-center gap-2">
            <img src="/swolecast-logo.png" alt="Swolecast" className="h-6 lg:h-8" />
            <span className="text-xs lg:text-sm uppercase tracking-widest text-gray-500 font-bold">DRAFT SORT</span>
          </div>
        </div>

        {/* Score display */}
        <div className="text-center mb-4">
          <div className={`text-4xl lg:text-6xl font-black ${result.color}`}>
            {result.emoji} {result.label}
          </div>
          <div className="text-2xl lg:text-4xl font-bold text-white mt-2">
            {totalCorrect}/21 Correct · {score} pts
          </div>
        </div>

        {/* Results grid */}
        <div className="flex-1 overflow-auto">
          <div className="grid grid-cols-7 gap-1 lg:gap-2 w-full max-w-7xl mx-auto">
            {[1, 2, 3, 4, 5, 6, 7].map(round => (
              <div key={round} className="flex flex-col">
                <div className="text-center py-1 lg:py-2 bg-card rounded-t-lg border-b border-gray-700">
                  <span className="text-xs lg:text-sm font-bold text-gray-400">ROUND</span>
                  <div className="text-lg lg:text-2xl font-black text-white">{round}</div>
                </div>
                <div className="flex-1 bg-card/30 rounded-b-lg p-1 lg:p-2 space-y-1 lg:space-y-2 min-h-[200px]">
                  {roundSlots[round].map((player, idx) => (
                    <div key={player.name}
                      className={`rounded-lg p-1.5 lg:p-2 text-center border-2 transition-all
                        ${slotCorrectness[round]?.[idx] 
                          ? 'bg-green-500/20 border-green-500' 
                          : 'bg-red-500/20 border-red-500'}`}>
                      <div className="text-xs lg:text-sm font-bold text-white truncate">{player.name}</div>
                      <div className="text-[10px] lg:text-xs text-gray-400">{player.position}</div>
                      {!slotCorrectness[round]?.[idx] && (
                        <div className="text-[10px] lg:text-xs text-red-400 font-bold">
                          → R{player.draftRound}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-center gap-3 mt-4 pb-4">
          <button onClick={async () => {
            if (navigator.share) { try { await navigator.share({ text: shareMsg }); } catch {} }
            else { await navigator.clipboard.writeText(shareMsg); setCopied(true); setTimeout(() => setCopied(false), 2000); }
          }} className="py-3 px-6 bg-accent hover:bg-accent/80 rounded-xl font-bold text-base transition-all min-h-[48px]">
            {copied ? '✅ Copied!' : '📤 Share'}
          </button>
          <button onClick={resetGame}
            className="py-3 px-6 bg-primary hover:bg-primary/80 rounded-xl font-bold text-base transition-all min-h-[48px]">
            🔄 Play Again
          </button>
          <button onClick={onQuit}
            className="py-3 px-6 bg-card hover:bg-card/80 rounded-xl font-bold text-base transition-all min-h-[48px]">
            🏠 Menu
          </button>
        </div>
        <div className="w-full max-w-4xl mx-auto pb-6">
          <Leaderboard compact mode="Draft Sort" currentEntryId={leaderboardEntryId} title="Draft Sort Leaderboard" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col p-2 lg:p-4">
      {/* Header */}
      <div className="flex justify-between items-center px-2 lg:px-4 py-2">
        <button onClick={() => { if (confirm('Quit game?')) onQuit(); }} 
          className="text-gray-400 hover:text-white text-sm font-bold min-h-[44px]">✕ Quit</button>
        <div className="flex items-center gap-2">
          <img src="/swolecast-logo.png" alt="Swolecast" className="h-6 lg:h-8" />
          <span className="text-xs lg:text-sm uppercase tracking-widest text-gray-500 font-bold">DRAFT SORT</span>
        </div>
        <div className="text-sm text-gray-400">
          {21 - available.length}/21 placed
        </div>
      </div>

      {/* Instructions */}
      <div className="text-center py-2">
        <h2 className="text-lg lg:text-2xl font-black text-white">Sort Players by Draft Round</h2>
        <p className="text-xs lg:text-sm text-gray-400">Drag or click to place 3 players in each round</p>
      </div>

      {/* Round columns */}
      <div className="grid grid-cols-7 gap-1 lg:gap-2 w-full max-w-7xl mx-auto mb-2">
        {[1, 2, 3, 4, 5, 6, 7].map(round => (
          <div key={round} 
            onClick={() => handleRoundClick(round)}
            onDragOver={e => e.preventDefault()}
            onDrop={() => handleDropOnRound(round)}
            className={`flex flex-col cursor-pointer transition-all
              ${roundSlots[round].length >= 3 ? 'opacity-60' : 'hover:scale-[1.02]'}
              ${selected && roundSlots[round].length < 3 ? 'ring-2 ring-primary' : ''}`}>
            <div className={`text-center py-1 lg:py-2 rounded-t-lg border-b
              ${roundSlots[round].length === 3 ? 'bg-green-500/20 border-green-500/50' : 'bg-card border-gray-700'}`}>
              <span className="text-[10px] lg:text-xs font-bold text-gray-400">ROUND</span>
              <div className="text-lg lg:text-2xl font-black text-white">{round}</div>
              <div className="text-[10px] lg:text-xs text-gray-500">{roundSlots[round].length}/3</div>
            </div>
            <div className={`flex-1 rounded-b-lg p-1 lg:p-2 space-y-1 lg:space-y-2 min-h-[140px] lg:min-h-[200px] border-2 border-dashed
              ${roundSlots[round].length === 3 ? 'border-green-500/30 bg-green-500/5' : 'border-gray-600 bg-card/20'}`}>
              {roundSlots[round].map((player, idx) => (
                <div key={player.name}
                  draggable
                  onDragStart={() => handleDragStart(round, idx, player)}
                  onClick={(e) => { e.stopPropagation(); handleSlotClick(round, idx, player); }}
                  className={`rounded-lg p-1.5 lg:p-2 text-center cursor-pointer transition-all hover:scale-105 border-2
                    ${selected?.source === round && selected?.index === idx 
                      ? 'border-primary bg-primary/20 scale-105' 
                      : 'border-primary/30 bg-card hover:border-primary/60'}`}>
                  <div className="text-xs lg:text-sm font-bold text-white truncate">{player.name}</div>
                  <div className="text-[10px] lg:text-xs text-gray-400">{player.position}</div>
                </div>
              ))}
              {roundSlots[round].length < 3 && (
                <div className="text-[10px] lg:text-xs text-gray-600 text-center py-2">
                  {3 - roundSlots[round].length} more
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Available players */}
      <div className="flex-1 overflow-auto"
        onDragOver={e => e.preventDefault()}
        onDrop={handleDropOnAvailable}>
        <div className="text-center text-xs lg:text-sm text-gray-500 mb-2">
          {available.length > 0 ? `Available Players (${available.length})` : 'All players placed!'}
        </div>
        <div className="flex flex-wrap justify-center gap-1.5 lg:gap-2 max-w-6xl mx-auto">
          {available.map((player, idx) => (
            <div key={player.name}
              draggable
              onDragStart={() => handleDragStart('available', idx, player)}
              onClick={() => handleCardClick('available', idx, player)}
              className={`rounded-lg p-2 lg:p-3 cursor-pointer transition-all hover:scale-105 border-2 min-w-[90px] lg:min-w-[120px] text-center
                ${selected?.source === 'available' && selected?.index === idx 
                  ? 'border-primary bg-primary/20 scale-105 shadow-lg shadow-primary/20' 
                  : 'border-accent/30 bg-card hover:border-accent/60'}`}>
              <div className="text-xs lg:text-sm font-bold text-white">{player.name}</div>
              <div className="text-[10px] lg:text-xs text-gray-400">{player.position} · {player.draftYear}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Lock In button */}
      <div className="pt-3 pb-2 flex justify-center">
        <button onClick={handleLockIn} disabled={!allSlotsFilled}
          className={`py-3 lg:py-4 px-8 lg:px-12 rounded-2xl text-lg lg:text-xl font-black transition-all min-h-[52px]
            ${allSlotsFilled 
              ? 'bg-primary hover:bg-primary/80 hover:scale-105 animate-pulse-glow' 
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>
          🎯 LOCK IT IN
        </button>
      </div>
    </div>
  );
}
