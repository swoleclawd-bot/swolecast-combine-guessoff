import type { GuessResult, Player } from './types';

export function scoreGuess(player: Player, guess: number, streak: number): GuessResult {
  const delta = Math.abs(guess - player.forty);
  let points: number, label: string, emoji: string;

  if (delta <= 0.05) {
    points = 100; label = "NAILED IT!"; emoji = "🔥";
  } else if (delta <= 0.10) {
    points = 75; label = "Swole guess!"; emoji = "💪";
  } else if (delta <= 0.20) {
    points = 50; label = "Not bad!"; emoji = "👍";
  } else if (delta <= 0.35) {
    points = 25; label = "Meh"; emoji = "🤷";
  } else {
    points = 0; label = "Do you even watch football?"; emoji = "💀";
  }

  // Streak bonus
  if (points >= 50 && streak > 0) {
    points = points * (1 + streak * 0.25);
    points = Math.round(points);
  }

  return { player, guess, delta: Math.round(delta * 100) / 100, points, label, emoji };
}

export function getEasterEgg(player: Player, guess: number): string | null {
  if (player.name === "Tom Brady") {
    if (Math.abs(guess - 5.28) < 0.03) return "Even Tom couldn't run that fast... wait, actually that's about right 🐢";
    return "Tom Brady: proof that 40 time isn't everything 🐐";
  }
  if (player.name === "Xavier Worthy" && guess < 4.25) return "You knew he was THAT fast? Respect. 🚀";
  if (player.name === "John Ross" && Math.abs(guess - 4.22) < 0.03) return "The record holder! Too bad that was his NFL peak 😬";
  return null;
}

export function getDeltaColor(delta: number): string {
  if (delta <= 0.05) return '#10B981';
  if (delta <= 0.10) return '#FFD166';
  if (delta <= 0.20) return '#EC4899';
  if (delta <= 0.35) return '#7C3AED';
  return '#EF4444';
}
