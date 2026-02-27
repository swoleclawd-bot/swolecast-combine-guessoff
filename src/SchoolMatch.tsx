import { useState, useEffect, useCallback, useRef } from 'react';
import type { Player } from './types';
import { playSuccess, playFail, playTick } from './sounds';
import Leaderboard from './Leaderboard';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface SchoolMatchProps {
  allPlayers: Player[];
  onQuit: () => void;
  onRecordScore: (score: number) => string;
}

interface TierResult {
  tier: 'easy' | 'medium' | 'hard';
  correct: number;
  total: number;
  timeSeconds: number;
  passed: boolean;
  points: number;
}

// Power 5 + major programs = Easy
const EASY_SCHOOLS = new Set([
  'Alabama', 'Ohio State', 'Georgia', 'LSU', 'Oklahoma', 'Texas', 'Michigan',
  'Penn State', 'Florida', 'Tennessee', 'Oregon', 'USC', 'Notre Dame', 'Clemson',
  'Florida State', 'Auburn', 'Wisconsin', 'Texas A&M', 'Miami', 'Washington',
  'UCLA', 'Stanford', 'Nebraska', 'Iowa', 'Michigan State', 'Ole Miss', 'Mississippi',
  'South Carolina', 'North Carolina', 'Virginia Tech', 'Louisville', 'Kentucky'
]);

// Mid-tier programs = Medium
const MEDIUM_SCHOOLS = new Set([
  'Cincinnati', 'Iowa State', 'Utah', 'BYU', 'UCF', 'Houston', 'Baylor',
  'Pittsburgh', 'Minnesota', 'Kansas State', 'Colorado', 'Arizona State',
  'Maryland', 'Mississippi State', 'Missouri', 'Oregon State', 'Purdue',
  'Rutgers', 'Boston College', 'Illinois', 'TCU', 'Memphis', 'SMU', 'Tulane',
  'Texas Tech', 'Arkansas', 'Wake Forest', 'Syracuse', 'Duke', 'Indiana'
]);

// Everything else = Hard (small schools, FCS, obscure)
// If not in EASY or MEDIUM, it's HARD

const TOTAL_PER_TIER = 10;
const REQUIRED_TO_ADVANCE = 8;
const TIMER_SECONDS = 60;

type Difficulty = 'easy' | 'medium' | 'hard';

function getDifficulty(college: string): Difficulty {
  if (EASY_SCHOOLS.has(college)) return 'easy';
  if (MEDIUM_SCHOOLS.has(college)) return 'medium';
  return 'hard';
}

export default function SchoolMatch({ allPlayers, onQuit, onRecordScore }: SchoolMatchProps) {
  const [currentTier, setCurrentTier] = useState<Difficulty>('easy');
  const [tierResults, setTierResults] = useState<TierResult[]>([]);
  const [gamePlayers, setGamePlayers] = useState<Player[]>([]);
  const [shuffledSchools, setShuffledSchools] = useState<string[]>([]);
  const [matches, setMatches] = useState<Map<string, string>>(new Map());
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [timeLeft, setTimeLeft] = useState(TIMER_SECONDS);
  const [startTime, setStartTime] = useState<number>(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [tierComplete, setTierComplete] = useState(false);
  const [shareText, setShareText] = useState('');
  const [copied, setCopied] = useState(false);
  const [leaderboardEntryId, setLeaderboardEntryId] = useState<string | null>(null);
  const scoreRecordedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Get players for a specific difficulty tier
  const getPlayersForTier = useCallback((tier: Difficulty): Player[] => {
    const tierPlayers = allPlayers.filter(p => getDifficulty(p.college) === tier);

    const groupedByCollege = new Map<string, Player[]>();
    for (const player of tierPlayers) {
      const existing = groupedByCollege.get(player.college) || [];
      existing.push(player);
      groupedByCollege.set(player.college, existing);
    }

    const selected: Player[] = [];
    const tierColleges = shuffle(Array.from(groupedByCollege.keys()));
    for (const college of tierColleges) {
      if (selected.length >= TOTAL_PER_TIER) break;
      const options = groupedByCollege.get(college) || [];
      selected.push(options[Math.floor(Math.random() * options.length)]);
    }

    // Occasionally swap in 1-2 players from adjacent tiers to vary matchups.
    if (Math.random() < 0.35) {
      const adjacentTier: Difficulty[] =
        tier === 'easy' ? ['medium'] : tier === 'medium' ? ['easy', 'hard'] : ['medium'];
      const swapPool = shuffle(allPlayers).filter((p) =>
        adjacentTier.includes(getDifficulty(p.college)) &&
        !selected.some((s) => s.name === p.name || s.college === p.college)
      );
      const swapCount = Math.min(1 + Math.floor(Math.random() * 2), swapPool.length);
      for (let i = 0; i < swapCount; i++) {
        const replaceAt = Math.floor(Math.random() * selected.length);
        selected[replaceAt] = swapPool[i];
      }
    }

    return selected;
  }, [allPlayers]);

  const getDecoySchools = useCallback((playersInTier: Player[]): string[] => {
    const usedSchools = new Set(playersInTier.map((p) => p.college));
    const decoyPool = shuffle(
      Array.from(new Set(allPlayers.map((p) => p.college))).filter((school) => !usedSchools.has(school))
    );
    const count = Math.min(1 + Math.floor(Math.random() * 2), decoyPool.length);
    return decoyPool.slice(0, count);
  }, [allPlayers]);

  // Initialize/reset for a tier
  const initializeTier = useCallback((tier: Difficulty) => {
    const players = getPlayersForTier(tier);
    const schools = shuffle([...players.map(p => p.college), ...getDecoySchools(players)]);
    
    setCurrentTier(tier);
    setGamePlayers(players);
    setShuffledSchools(schools);
    setMatches(new Map());
    setSelectedPlayer(null);
    setRevealed(false);
    setCorrectCount(0);
    setTimeLeft(TIMER_SECONDS);
    setStartTime(Date.now());
    setElapsedTime(0);
    setTierComplete(false);
  }, [getDecoySchools, getPlayersForTier]);

  // Start game
  useEffect(() => {
    initializeTier('easy');
  }, [initializeTier]);

  // Timer
  useEffect(() => {
    if (revealed || gameOver || tierComplete || gamePlayers.length === 0) return;
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          handleSubmit();
          return TIMER_SECONDS;
        }
        if (t <= 10) playTick();
        return t - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [revealed, gameOver, tierComplete, gamePlayers.length]);

  const handlePlayerClick = (playerName: string) => {
    if (revealed) return;
    setSelectedPlayer(selectedPlayer === playerName ? null : playerName);
  };

  const handleSchoolClick = (school: string) => {
    if (revealed || !selectedPlayer) return;
    
    const newMatches = new Map(matches);
    for (const [player, sch] of newMatches) {
      if (sch === school) newMatches.delete(player);
    }
    newMatches.set(selectedPlayer, school);
    setMatches(newMatches);
    setSelectedPlayer(null);
  };

  const handleSubmit = useCallback(() => {
    if (revealed) return;
    if (timerRef.current) clearInterval(timerRef.current);
    
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    setElapsedTime(elapsed);
    setRevealed(true);

    let correct = 0;
    for (const player of gamePlayers) {
      const guessedSchool = matches.get(player.name);
      if (guessedSchool === player.college) {
        correct++;
      }
    }
    
    if (correct >= REQUIRED_TO_ADVANCE) playSuccess();
    else playFail();
    
    setCorrectCount(correct);
  }, [revealed, gamePlayers, matches, startTime]);

  const handleNextTier = useCallback(() => {
    // Calculate points: 10 per correct + speed bonus (max 50 if under 30s)
    const speedBonus = Math.max(0, Math.floor((TIMER_SECONDS - elapsedTime) * (50 / 30)));
    const points = correctCount * 10 + (correctCount >= REQUIRED_TO_ADVANCE ? speedBonus : 0);
    
    const result: TierResult = {
      tier: currentTier,
      correct: correctCount,
      total: TOTAL_PER_TIER,
      timeSeconds: elapsedTime,
      passed: correctCount >= REQUIRED_TO_ADVANCE,
      points,
    };
    
    const newResults = [...tierResults, result];
    setTierResults(newResults);
    
    // Check if passed and can advance
    if (correctCount >= REQUIRED_TO_ADVANCE) {
      if (currentTier === 'easy') {
        initializeTier('medium');
      } else if (currentTier === 'medium') {
        initializeTier('hard');
      } else {
        // Completed all tiers!
        setGameOver(true);
        generateShareText(newResults);
      }
    } else {
      // Failed tier — game over
      setGameOver(true);
      generateShareText(newResults);
    }
  }, [correctCount, elapsedTime, currentTier, tierResults, initializeTier]);

  const generateShareText = (results: TierResult[]) => {
    const totalPoints = results.reduce((sum, r) => sum + r.points, 0);
    const tiersCleared = results.filter(r => r.passed).length;
    const tierEmoji = tiersCleared === 3 ? '🏆' : tiersCleared === 2 ? '🥈' : tiersCleared === 1 ? '🥉' : '💀';
    
    const tierLabels: Record<Difficulty, string> = { easy: '📗', medium: '📙', hard: '📕' };
    const tierLines = results.map(r => 
      `${tierLabels[r.tier]} ${r.tier.charAt(0).toUpperCase() + r.tier.slice(1)}: ${r.correct}/${r.total} ${r.passed ? '✓' : '✗'} (${r.timeSeconds}s)`
    ).join('\n');
    
    setShareText(`${tierEmoji} Swolecast School Match\n\n${tierLines}\n\nTotal: ${totalPoints} pts\n\nThink you Know Ball? 👉 swolecast.com`);
  };

  const handleRestart = () => {
    setTierResults([]);
    setGameOver(false);
    setShareText('');
    setCopied(false);
    setLeaderboardEntryId(null);
    scoreRecordedRef.current = false;
    initializeTier('easy');
  };

  useEffect(() => {
    if (!gameOver || scoreRecordedRef.current || tierResults.length === 0) return;
    const totalPoints = tierResults.reduce((sum, r) => sum + r.points, 0);
    scoreRecordedRef.current = true;
    setLeaderboardEntryId(onRecordScore(totalPoints));
  }, [gameOver, onRecordScore, tierResults]);

  const handleShare = async () => {
    if (navigator.share) {
      try { await navigator.share({ text: shareText }); } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    if (gameOver) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !revealed && matches.size > 0) {
        e.preventDefault();
        handleSubmit();
      } else if (e.key === ' ' && revealed) {
        e.preventDefault();
        handleNextTier();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [gameOver, revealed, matches.size, handleSubmit, handleNextTier]);

  if (gamePlayers.length === 0) {
    return <div className="flex items-center justify-center min-h-screen text-xl lg:text-3xl font-bold px-4 text-center">Loading players... 🎓</div>;
  }

  const tierColors: Record<Difficulty, string> = {
    easy: 'text-green-400',
    medium: 'text-yellow-400', 
    hard: 'text-red-400'
  };

  const tierBgColors: Record<Difficulty, string> = {
    easy: 'bg-green-500/20 border-green-500/40',
    medium: 'bg-yellow-500/20 border-yellow-500/40',
    hard: 'bg-red-500/20 border-red-500/40'
  };

  // Game Over screen
  if (gameOver) {
    const totalPoints = tierResults.reduce((sum, r) => sum + r.points, 0);
    const tiersCleared = tierResults.filter(r => r.passed).length;
    const rating = tiersCleared === 3 ? 'ELITE SCOUT 🏆' : tiersCleared === 2 ? 'SOLID KNOWLEDGE 🥈' : tiersCleared === 1 ? 'NEEDS WORK 🥉' : 'BACK TO FILM ROOM 💀';
    
    return (
      <div className="min-h-screen flex flex-col items-center p-4 lg:p-8 pt-6 max-w-2xl mx-auto overflow-y-auto">
        <div className="w-full bg-gradient-to-br from-surface-light to-surface border border-white/10 rounded-2xl lg:rounded-3xl p-4 lg:p-8 mb-4 lg:mb-8 shadow-2xl">
          <div className="flex items-center justify-center gap-2 lg:gap-3 mb-4 lg:mb-6">
            <img src="/swolecast-logo.png" alt="" className="h-6 lg:h-8" />
            <span className="text-xs uppercase tracking-[0.3em] text-gray-500 font-bold">SCHOOL MATCH</span>
          </div>

          <div className="text-center mb-4 lg:mb-6">
            <div className="text-lg lg:text-2xl font-black text-highlight mb-1">{rating}</div>
            <div className="text-4xl lg:text-6xl font-black text-white">{totalPoints}</div>
            <div className="text-sm lg:text-lg text-gray-400 font-bold">TOTAL POINTS</div>
          </div>

          {/* Tier breakdown */}
          <div className="space-y-3 mb-4 lg:mb-6">
            {tierResults.map((r, i) => (
              <div key={i} className={`rounded-xl p-3 lg:p-4 border ${tierBgColors[r.tier]}`}>
                <div className="flex justify-between items-center mb-1">
                  <div className={`font-black text-lg lg:text-xl uppercase ${tierColors[r.tier]}`}>
                    {r.tier === 'easy' ? '📗' : r.tier === 'medium' ? '📙' : '📕'} {r.tier}
                  </div>
                  <div className={`text-lg lg:text-xl font-black ${r.passed ? 'text-green-400' : 'text-red-400'}`}>
                    {r.passed ? '✓ PASSED' : '✗ FAILED'}
                  </div>
                </div>
                <div className="flex justify-between text-sm lg:text-base text-gray-300">
                  <span>{r.correct}/{r.total} correct</span>
                  <span>⏱️ {r.timeSeconds}s</span>
                  <span className="text-highlight font-bold">+{r.points} pts</span>
                </div>
              </div>
            ))}
            
            {/* Show locked tiers */}
            {tierResults.length < 3 && !tierResults[tierResults.length - 1]?.passed && (
              <>
                {currentTier === 'easy' && (
                  <>
                    <div className="rounded-xl p-3 lg:p-4 border border-gray-700 bg-gray-800/50 opacity-50">
                      <div className="font-black text-lg uppercase text-gray-500">📙 MEDIUM — LOCKED</div>
                    </div>
                    <div className="rounded-xl p-3 lg:p-4 border border-gray-700 bg-gray-800/50 opacity-50">
                      <div className="font-black text-lg uppercase text-gray-500">📕 HARD — LOCKED</div>
                    </div>
                  </>
                )}
                {currentTier === 'medium' && (
                  <div className="rounded-xl p-3 lg:p-4 border border-gray-700 bg-gray-800/50 opacity-50">
                    <div className="font-black text-lg uppercase text-gray-500">📕 HARD — LOCKED</div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="text-center text-gray-500 text-xs lg:text-sm mb-4">
            Need {REQUIRED_TO_ADVANCE}/{TOTAL_PER_TIER} correct to advance • Speed bonus for fast finishes
          </div>

          <div className="text-center text-gray-600 text-xs">swolecast.com · Live a Little 🤙</div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 w-full max-w-md">
          <button onClick={handleShare}
            className="flex-1 py-3 lg:py-4 bg-accent border border-white/20 rounded-2xl font-black text-base lg:text-lg hover:bg-accent/80 transition-all hover:scale-105 text-white min-h-[44px]">
            {copied ? '✅ Copied!' : '📤 Share'}
          </button>
        </div>
        <div className="flex gap-3 lg:gap-4 mt-3 w-full max-w-md">
          <button onClick={handleRestart}
            className="flex-1 py-3 lg:py-4 bg-primary border border-white/10 rounded-2xl font-bold text-base lg:text-lg hover:bg-primary/80 transition-all min-h-[44px]">🔄 Play Again</button>
          <button onClick={onQuit}
            className="flex-1 py-3 lg:py-4 bg-card border border-white/10 rounded-2xl font-bold text-base lg:text-lg hover:bg-card/80 transition-all min-h-[44px]">🏠 Menu</button>
        </div>
        <div className="w-full mt-4">
          <Leaderboard compact mode="School Match" currentEntryId={leaderboardEntryId} title="School Match Leaderboard" />
        </div>
      </div>
    );
  }

  // Get matched/unmatched schools
  const matchedSchools = new Set(matches.values());

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center px-3 lg:px-8 py-2 lg:py-3 bg-card/50 border-b border-gray-800">
        <button onClick={onQuit} className="text-gray-400 hover:text-white text-xs lg:text-sm font-bold min-h-[44px] min-w-[44px] flex items-center">✕ Quit</button>
        <div className="flex items-center gap-2 lg:gap-3">
          <img src="/swolecast-logo.png" alt="" className="h-7 lg:h-10" />
          <span className="text-xs lg:text-sm uppercase tracking-widest text-gray-500 font-bold hidden sm:inline">SCHOOL MATCH</span>
        </div>
        <div className="flex items-center gap-2 lg:gap-4">
          <span className={`font-black text-sm lg:text-base uppercase ${tierColors[currentTier]}`}>
            {currentTier === 'easy' ? '📗' : currentTier === 'medium' ? '📙' : '📕'} {currentTier}
          </span>
          <span className="text-gray-400 text-xs lg:text-sm">{matches.size}/{TOTAL_PER_TIER}</span>
        </div>
      </div>

      {/* Tier progress indicator */}
      <div className="flex justify-center gap-2 py-2 bg-card/30 border-b border-gray-800">
        <div className={`px-3 py-1 rounded-full text-xs font-bold ${currentTier === 'easy' ? 'bg-green-500/30 text-green-400' : tierResults.some(r => r.tier === 'easy' && r.passed) ? 'bg-green-500/20 text-green-400' : 'bg-gray-700 text-gray-500'}`}>
          📗 Easy {tierResults.find(r => r.tier === 'easy')?.passed ? '✓' : ''}
        </div>
        <div className={`px-3 py-1 rounded-full text-xs font-bold ${currentTier === 'medium' ? 'bg-yellow-500/30 text-yellow-400' : tierResults.some(r => r.tier === 'medium' && r.passed) ? 'bg-yellow-500/20 text-yellow-400' : 'bg-gray-700 text-gray-500'}`}>
          📙 Medium {tierResults.find(r => r.tier === 'medium')?.passed ? '✓' : ''}
        </div>
        <div className={`px-3 py-1 rounded-full text-xs font-bold ${currentTier === 'hard' ? 'bg-red-500/30 text-red-400' : tierResults.some(r => r.tier === 'hard' && r.passed) ? 'bg-red-500/20 text-red-400' : 'bg-gray-700 text-gray-500'}`}>
          📕 Hard {tierResults.find(r => r.tier === 'hard')?.passed ? '✓' : ''}
        </div>
      </div>

      {/* Timer bar */}
      {!revealed && (
        <div className="w-full h-2 lg:h-3 bg-card overflow-hidden">
          <div className="h-full transition-all duration-1000 ease-linear"
            style={{
              width: `${(timeLeft / TIMER_SECONDS) * 100}%`,
              backgroundColor: timeLeft <= 10 ? '#EF4444' : timeLeft <= 20 ? '#FFD166' : '#10B981',
              boxShadow: timeLeft <= 10 ? '0 0 20px #EF4444' : 'none',
            }} />
        </div>
      )}

      {/* Main game area */}
      <div className="flex-1 flex flex-col items-center p-3 lg:p-6 max-w-6xl mx-auto w-full">
        {/* Timer and instructions */}
        {!revealed && (
          <div className="text-center mb-4 lg:mb-6">
            <div className={`text-3xl lg:text-5xl font-black mb-2 ${timeLeft <= 10 ? 'text-red-500 animate-pulse' : 'text-highlight'}`}>
              {timeLeft}s
            </div>
            <p className="text-gray-400 text-sm lg:text-base">
              {selectedPlayer 
                ? <span>Now tap <span className="text-accent font-bold">{selectedPlayer}'s</span> school</span>
                : 'Tap a player, then tap their school'}
            </p>
            <p className="text-gray-500 text-xs mt-1">Need {REQUIRED_TO_ADVANCE}/{TOTAL_PER_TIER} to advance</p>
          </div>
        )}

        {/* Game label */}
        <div className={`text-xs uppercase tracking-[0.2em] lg:tracking-[0.3em] font-bold mb-3 lg:mb-4 ${tierColors[currentTier]}`}>
          🎓 {currentTier.toUpperCase()} MODE
        </div>

        {/* Two column layout: Players | Schools */}
        <div className="grid grid-cols-2 gap-3 lg:gap-6 w-full max-w-4xl">
          {/* Players column */}
          <div className="space-y-2 lg:space-y-3">
            <div className="text-center text-xs lg:text-sm font-bold text-gray-500 uppercase mb-2">Players</div>
            {gamePlayers.map((player) => {
              const isMatched = matches.has(player.name);
              const isSelected = selectedPlayer === player.name;
              const matchedSchool = matches.get(player.name);
              const isCorrect = revealed && matchedSchool === player.college;
              const isWrong = revealed && matchedSchool && matchedSchool !== player.college;
              const noGuess = revealed && !matchedSchool;
              
              return (
                <div 
                  key={player.name}
                  onClick={() => !revealed && handlePlayerClick(player.name)}
                  className={`relative bg-card border-2 rounded-xl p-3 lg:p-4 cursor-pointer transition-all select-none
                    ${revealed 
                      ? isCorrect ? 'border-green-500 bg-green-500/20' 
                        : isWrong || noGuess ? 'border-red-500 bg-red-500/20'
                        : 'border-gray-700 bg-gray-800/50'
                      : isSelected 
                        ? 'border-accent shadow-[0_0_20px_rgba(16,185,129,0.5)] scale-105' 
                        : isMatched 
                          ? 'border-primary/50 bg-primary/10' 
                          : 'border-gray-700 hover:border-primary/50 hover:scale-102'
                    }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <div className="min-w-0 truncate">
                      <span className="text-sm lg:text-lg font-bold text-white">{player.name}</span>
                      <span className="text-xs lg:text-sm text-gray-500 font-normal ml-1">{player.position}</span>
                    </div>
                    {revealed && (
                      <div className={`text-lg shrink-0 ${isCorrect ? 'text-green-400' : 'text-red-400'}`}>
                        {isCorrect ? '✓' : '✗'}
                      </div>
                    )}
                  </div>
                  {revealed && !isCorrect && (
                    <div className="text-xs text-green-400 truncate">
                      Correct: {player.college}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Schools column */}
          <div className="space-y-2 lg:space-y-3">
            <div className="text-center text-xs lg:text-sm font-bold text-gray-500 uppercase mb-2">Schools</div>
            {shuffledSchools.map((school) => {
              const isUsed = matchedSchools.has(school);
              const isCorrectMatch = revealed && gamePlayers.some(p => p.college === school && matches.get(p.name) === school);
              
              return (
                <div 
                  key={school}
                  onClick={() => handleSchoolClick(school)}
                  className={`bg-card border-2 rounded-xl p-3 lg:p-4 cursor-pointer transition-all select-none
                    ${revealed
                      ? isCorrectMatch 
                        ? 'border-green-500 bg-green-500/20' 
                        : 'border-gray-700'
                      : selectedPlayer
                        ? isUsed 
                          ? 'border-gray-600 opacity-50'
                          : 'border-accent/50 hover:border-accent hover:scale-102 hover:shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                        : isUsed 
                          ? 'border-primary/30 bg-primary/5' 
                          : 'border-gray-700 hover:border-gray-500'
                    }`}
                >
                  <div className="text-sm lg:text-lg font-bold text-white text-center truncate">{school}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Submit / Results */}
        {!revealed ? (
          <div className="mt-4 lg:mt-6 w-full max-w-md">
            <button 
              onClick={handleSubmit}
              disabled={matches.size === 0}
              className={`w-full py-4 lg:py-5 rounded-2xl text-xl lg:text-2xl font-black transition-all min-h-[52px]
                ${matches.size > 0 
                  ? 'bg-primary hover:bg-primary/80 hover:scale-105 animate-pulse-glow cursor-pointer' 
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                }`}
            >
              🎯 LOCK IT IN {matches.size < TOTAL_PER_TIER && `(${matches.size}/${TOTAL_PER_TIER})`}
            </button>
            <p className="hidden lg:block text-center text-gray-500 text-sm mt-2">Press <kbd className="px-2 py-0.5 bg-card rounded text-gray-400">Enter</kbd> to submit</p>
          </div>
        ) : (
          <div className="mt-4 lg:mt-6 text-center">
            <div className={`text-2xl lg:text-4xl font-black mb-2 ${correctCount >= REQUIRED_TO_ADVANCE ? 'text-green-400 animate-knows-ball' : 'text-red-400'}`}>
              {correctCount}/{TOTAL_PER_TIER} CORRECT
            </div>
            <div className="text-lg lg:text-xl text-gray-400 mb-3">
              ⏱️ Completed in <span className="text-highlight font-bold">{elapsedTime}s</span>
            </div>
            {correctCount >= REQUIRED_TO_ADVANCE ? (
              <div className="text-green-400 font-bold mb-4">
                {currentTier === 'hard' ? '🏆 ALL TIERS COMPLETE!' : `✓ Advancing to ${currentTier === 'easy' ? 'MEDIUM' : 'HARD'}...`}
              </div>
            ) : (
              <div className="text-red-400 font-bold mb-4">
                ✗ Need {REQUIRED_TO_ADVANCE} to advance
              </div>
            )}
            <button onClick={handleNextTier}
              className="px-8 py-4 lg:px-12 lg:py-5 bg-accent hover:bg-accent/80 rounded-2xl text-xl lg:text-2xl font-black transition-all hover:scale-105 min-h-[52px]">
              {correctCount >= REQUIRED_TO_ADVANCE && currentTier !== 'hard' ? '➡️ NEXT TIER' : '📊 See Results'}
            </button>
            <p className="hidden lg:block text-gray-500 text-sm mt-2">Press <kbd className="px-2 py-0.5 bg-card rounded text-gray-400">Space</kbd></p>
          </div>
        )}
      </div>
    </div>
  );
}
