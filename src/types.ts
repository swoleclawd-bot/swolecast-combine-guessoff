export interface Player {
  name: string;
  position: string;
  forty: number;
  year: number;
  college: string;
  team: string;
}

export interface BenchPlayer {
  name: string;
  position: string;
  benchReps: number;
  year: number;
  college: string;
  team: string;
}

export interface DraftPlayer {
  name: string;
  position: string;
  draftRound: number;
  draftPick: number;
  draftYear: number;
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
  knowsBall: boolean;
}

export interface QuickRoundResult {
  type: string;
  question: string;
  knowsBall: boolean;
  detail: string;
}

export type GameMode = 'menu' | 'quick' | 'endless' | 'position' | 'speedsort' | 'benchsort' | 'schoolmatch' | 'draftsort';
export type Position = 'WR' | 'RB' | 'TE' | 'QB';
