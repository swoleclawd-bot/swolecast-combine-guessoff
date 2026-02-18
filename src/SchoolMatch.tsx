import { useState, useEffect, useCallback, useRef } from 'react';
import type { Player } from './types';
import { playSuccess, playFail, playTick } from './sounds';

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
}

interface MatchResult {
  player: Player;
  guessedSchool: string;
  correct: boolean;
}

const TOTAL_PLAYERS = 10;
const TIMER_SECONDS = 60;

export default function SchoolMatch({ allPlayers, onQuit }: SchoolMatchProps) {
  const [gamePlayers, setGamePlayers] = useState<Player[]>([]);
  const [shuffledSchools, setShuffledSchools] = useState<string[]>([]);
  const [matches, setMatches] = useState<Map<string, string>>(new Map()); // playerName -> schoolName
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [results, setResults] = useState<MatchResult[]>([]);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(TIMER_SECONDS);
  const [gameOver, setGameOver] = useState(false);
  const [shareText, setShareText] = useState('');
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initialize game
  useEffect(() => {
    // Filter to players with unique colleges to avoid confusion
    const collegeMap = new Map<string, Player>();
    const shuffledAll = shuffle(allPlayers);
    
    for (const p of shuffledAll) {
      if (!collegeMap.has(p.college) && collegeMap.size < TOTAL_PLAYERS) {
        collegeMap.set(p.college, p);
      }
    }
    
    const players = Array.from(collegeMap.values());
    const schools = shuffle(players.map(p => p.college));
    
    setGamePlayers(players);
    setShuffledSchools(schools);
    setMatches(new Map());
    setSelectedPlayer(null);
    setRevealed(false);
    setResults([]);
    setScore(0);
    setTimeLeft(TIMER_SECONDS);
    setGameOver(false);
    setShareText('');
    setCopied(false);
  }, [allPlayers]);

  // Timer
  useEffect(() => {
    if (revealed || gameOver || gamePlayers.length === 0) return;
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
  }, [revealed, gameOver, gamePlayers.length]);

  const handlePlayerClick = (playerName: string) => {
    if (revealed) return;
    if (selectedPlayer === playerName) {
      setSelectedPlayer(null);
    } else {
      setSelectedPlayer(playerName);
    }
  };

  const handleSchoolClick = (school: string) => {
    if (revealed || !selectedPlayer) return;
    
    // Remove this school from any existing matches
    const newMatches = new Map(matches);
    for (const [player, sch] of newMatches) {
      if (sch === school) {
        newMatches.delete(player);
      }
    }
    
    // Add new match
    newMatches.set(selectedPlayer, school);
    setMatches(newMatches);
    setSelectedPlayer(null);
  };

  const handleSubmit = useCallback(() => {
    if (revealed) return;
    if (timerRef.current) clearInterval(timerRef.current);
    setRevealed(true);

    const matchResults: MatchResult[] = [];
    let correct = 0;

    for (const player of gamePlayers) {
      const guessedSchool = matches.get(player.name) || '(no guess)';
      const isCorrect = guessedSchool === player.college;
      if (isCorrect) {
        correct++;
        playSuccess();
      }
      matchResults.push({
        player,
        guessedSchool,
        correct: isCorrect,
      });
    }

    if (correct < gamePlayers.length) playFail();
    
    setResults(matchResults);
    setScore(correct * 10);

    const emoji = correct >= 8 ? '🏆' : correct >= 6 ? '🏈' : correct >= 4 ? '📈' : '📺';
    setShareText(`${emoji} Swolecast School Match: ${correct}/${gamePlayers.length} correct!\n\nThink you Know Ball? 👉 swolecast.com`);
  }, [revealed, gamePlayers, matches]);

  const handleNext = useCallback(() => {
    setGameOver(true);
  }, []);

  const handleRestart = () => {
    // Re-initialize
    const collegeMap = new Map<string, Player>();
    const shuffledAll = shuffle(allPlayers);
    
    for (const p of shuffledAll) {
      if (!collegeMap.has(p.college) && collegeMap.size < TOTAL_PLAYERS) {
        collegeMap.set(p.college, p);
      }
    }
    
    const players = Array.from(collegeMap.values());
    const schools = shuffle(players.map(p => p.college));
    
    setGamePlayers(players);
    setShuffledSchools(schools);
    setMatches(new Map());
    setSelectedPlayer(null);
    setRevealed(false);
    setResults([]);
    setScore(0);
    setTimeLeft(TIMER_SECONDS);
    setGameOver(false);
    setShareText('');
    setCopied(false);
  };

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
        handleNext();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [gameOver, revealed, matches.size, handleSubmit, handleNext]);

  if (gamePlayers.length === 0) {
    return <div className="flex items-center justify-center min-h-screen text-xl lg:text-3xl font-bold px-4 text-center">Loading players... 🎓</div>;
  }

  // Game Over screen
  if (gameOver) {
    const correct = results.filter(r => r.correct).length;
    const rating = correct >= 9 ? 'ELITE SCOUT 🏆' : correct >= 7 ? 'KNOWS BALL 🏈' : correct >= 5 ? 'GETTING THERE 📈' : 'BACK TO FILM ROOM 📺';
    
    return (
      <div className="min-h-screen flex flex-col items-center p-4 lg:p-8 pt-6 max-w-2xl mx-auto overflow-y-auto">
        <div className="w-full bg-gradient-to-br from-surface-light to-surface border border-white/10 rounded-2xl lg:rounded-3xl p-4 lg:p-8 mb-4 lg:mb-8 shadow-2xl">
          <div className="flex items-center justify-center gap-2 lg:gap-3 mb-4 lg:mb-6">
            <img src="/swolecast-logo.png" alt="" className="h-6 lg:h-8" />
            <span className="text-xs uppercase tracking-[0.3em] text-gray-500 font-bold">SCHOOL MATCH</span>
          </div>

          <div className="text-center mb-3 lg:mb-6">
            <div className="text-4xl lg:text-7xl font-black text-white mb-0.5">{correct}/{TOTAL_PLAYERS}</div>
            <div className="text-sm lg:text-lg text-gray-400 font-bold">CORRECT</div>
          </div>

          <div className="text-center mb-3 lg:mb-6">
            <div className="text-lg lg:text-2xl font-black text-highlight">{rating}</div>
            <div className="text-gray-400 text-xs lg:text-base mt-0.5">{score} points</div>
          </div>

          {/* Results strip */}
          <div className="flex justify-center gap-1 mb-4 lg:mb-6 flex-wrap">
            {results.map((r, i) => (
              <div key={i} className={`w-7 h-7 lg:w-8 lg:h-8 rounded-lg flex items-center justify-center text-xs lg:text-sm font-bold ${r.correct ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                {r.correct ? '✓' : '✗'}
              </div>
            ))}
          </div>

          {/* Detailed results */}
          <div className="space-y-2 mb-4 lg:mb-6">
            {results.map((r, i) => (
              <div key={i} className={`rounded-xl p-2.5 lg:p-3 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 ${r.correct ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                <div className="min-w-0">
                  <span className="font-bold text-white text-sm lg:text-base">{r.player.name}</span>
                  <span className="text-xs lg:text-sm text-gray-400 ml-2">→ {r.player.college}</span>
                </div>
                {!r.correct && r.guessedSchool !== '(no guess)' && (
                  <div className="text-xs lg:text-sm text-red-400">
                    You said: {r.guessedSchool}
                  </div>
                )}
              </div>
            ))}
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
          <span className="text-gray-400 text-xs lg:text-sm">{matches.size}/{TOTAL_PLAYERS}</span>
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
          </div>
        )}

        {/* Game label */}
        <div className="text-xs uppercase tracking-[0.2em] lg:tracking-[0.3em] text-gray-500 font-bold mb-3 lg:mb-4">
          🎓 MATCH PLAYER TO SCHOOL
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
              
              return (
                <div 
                  key={player.name}
                  onClick={() => !revealed && handlePlayerClick(player.name)}
                  className={`relative bg-card border-2 rounded-xl p-3 lg:p-4 cursor-pointer transition-all select-none
                    ${revealed 
                      ? isCorrect ? 'border-green-500 bg-green-500/20' 
                        : isWrong ? 'border-red-500 bg-red-500/20'
                        : 'border-gray-700 bg-gray-800/50'
                      : isSelected 
                        ? 'border-accent shadow-[0_0_20px_rgba(16,185,129,0.5)] scale-105' 
                        : isMatched 
                          ? 'border-primary/50 bg-primary/10' 
                          : 'border-gray-700 hover:border-primary/50 hover:scale-102'
                    }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="text-sm lg:text-lg font-black text-white truncate">{player.name}</div>
                      <div className="text-xs lg:text-sm text-gray-400">{player.position} · {player.year}</div>
                    </div>
                    {isMatched && !revealed && (
                      <div className="text-xs text-primary font-bold truncate max-w-[80px] lg:max-w-[120px]">
                        → {matchedSchool}
                      </div>
                    )}
                    {revealed && (
                      <div className={`text-lg ${isCorrect ? 'text-green-400' : 'text-red-400'}`}>
                        {isCorrect ? '✓' : '✗'}
                      </div>
                    )}
                  </div>
                  {revealed && !isCorrect && (
                    <div className="mt-1 text-xs text-green-400">
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
              🎯 LOCK IT IN {matches.size < TOTAL_PLAYERS && `(${matches.size}/${TOTAL_PLAYERS})`}
            </button>
            <p className="hidden lg:block text-center text-gray-500 text-sm mt-2">Press <kbd className="px-2 py-0.5 bg-card rounded text-gray-400">Enter</kbd> to submit</p>
          </div>
        ) : (
          <div className="mt-4 lg:mt-6 text-center">
            <div className={`text-2xl lg:text-4xl font-black mb-3 lg:mb-4 ${results.filter(r => r.correct).length >= 7 ? 'text-green-400 animate-knows-ball' : 'text-highlight'}`}>
              {results.filter(r => r.correct).length}/{TOTAL_PLAYERS} CORRECT!
            </div>
            <button onClick={handleNext}
              className="px-8 py-4 lg:px-12 lg:py-5 bg-accent hover:bg-accent/80 rounded-2xl text-xl lg:text-2xl font-black transition-all hover:scale-105 min-h-[52px]">
              📊 See Results
            </button>
            <p className="hidden lg:block text-gray-500 text-sm mt-2">Press <kbd className="px-2 py-0.5 bg-card rounded text-gray-400">Space</kbd></p>
          </div>
        )}
      </div>
    </div>
  );
}
