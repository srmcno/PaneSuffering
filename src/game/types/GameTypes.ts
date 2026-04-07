export type RunResult = 'win' | 'fail';

export interface RunSummary {
  result: RunResult;
  score: number;
  cleaned: number;
  quota: number;
  survivedSetPiece: boolean;
  timeMs: number;
  reason: string;
}

export interface PlayerIntent {
  move: -1 | 0 | 1;
  lean: -1 | 0 | 1;
  cleanHeld: boolean;
  duckHeld: boolean;
  anchorPressed: boolean;
  pausePressed: boolean;
}
