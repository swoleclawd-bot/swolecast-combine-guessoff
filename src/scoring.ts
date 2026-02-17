import type { GuessResult, Player } from './types';

export function scoreGuess(player: Player, guess: number, streak: number): GuessResult {
  const delta = Math.abs(guess - player.forty);
  const knowsBall = delta <= 0.15;
  
  let points = knowsBall ? Math.round(100 - (delta / 0.15) * 30) : Math.max(0, Math.round(30 - (delta - 0.15) * 100));
  const label = knowsBall ? "KNOWS BALL" : "LEARN BALL";
  const emoji = knowsBall ? "🏈" : "💀";

  // Streak bonus
  if (knowsBall && streak > 0) {
    points = Math.round(points * (1 + streak * 0.25));
  }

  return { player, guess, delta: Math.round(delta * 100) / 100, points, label, emoji, knowsBall };
}

export function getEasterEgg(player: Player, guess: number): string | null {
  if (player.name === "Tom Brady") {
    if (Math.abs(guess - 5.28) < 0.05) return "You KNEW the GOAT was slow 🐐🐢";
    return "Tom Brady: 6 rings, 0 speed 🐐";
  }
  if (player.name === "Xavier Worthy" && guess < 4.25) return "Fastest combine EVER and you called it 🚀";
  if (player.name === "Tyreek Hill" && Math.abs(guess - 4.29) < 0.05) return "Cheetah speed — you know your guy 🐆";
  if (player.name === "DK Metcalf" && guess < 4.40) return "Built like a tank, runs like a sports car 🏎️";
  return null;
}

export function getDeltaColor(delta: number): string {
  if (delta <= 0.05) return '#10B981';
  if (delta <= 0.10) return '#7CED3A';
  if (delta <= 0.15) return '#FFD166';
  if (delta <= 0.25) return '#EC4899';
  return '#EF4444';
}
