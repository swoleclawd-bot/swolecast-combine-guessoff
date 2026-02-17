export interface Player {
  name: string;
  position: string;
  forty: number;
  year: number;
  college: string;
  team: string;
}

export interface GuessResult {
  player: Player;
  guess: number;
  delta: number;
  points: number;
  label: string;
  emoji: string;
}

export type GameMode = 'menu' | 'quick' | 'endless' | 'position';
export type Position = 'WR' | 'RB' | 'TE' | 'QB';

export interface GameState {
  mode: GameMode;
  positionFilter: Position | null;
  players: Player[];
  currentIndex: number;
  score: number;
  streak: number;
  results: GuessResult[];
  guess: number;
  revealed: boolean;
  timeLeft: number;
  gameOver: boolean;
}

export interface HighScore {
  score: number;
  mode: string;
  date: string;
  rounds: number;
}
