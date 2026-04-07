export interface GameHudState {
  score: number;
  health: number;
  cleaned: number;
  quota: number;
  stability: number;
  anchorCooldown: number;
  warning?: string;
}

export interface RunSummary {
  win: boolean;
  score: number;
  cleaned: number;
  quota: number;
  timeSeconds: number;
  survivedSetPiece: boolean;
  reason: string;
}

export interface InputIntent {
  move: -1 | 0 | 1;
  lean: -1 | 0 | 1;
  cleanHeld: boolean;
  duckHeld: boolean;
  anchorPressed: boolean;
  pausePressed: boolean;
}
