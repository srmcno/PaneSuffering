/** Points per unit of pane progress (a full pane is 1.0 of progress). */
const SCRUB_RATE = 240;
const PANE_BONUS = 200;
const SPOTLESS_BONUS = 160;
const FLOOR_BASE = 800;
const FLOOR_DECAY_PER_SEC = 12;
const FLOOR_FLOOR = 250;
const CLOSE_SHAVE = 75;

const PANES_PER_STEP = 2;
const MAX_MULTIPLIER = 5;

/**
 * Scoring is deliberately weighted towards *finishing* things: scrubbing pays
 * a trickle, panes and floors pay lumps, and the multiplier only survives if
 * you never get hit. The result is that playing it safe and playing it fast
 * are both viable, but playing it sloppy is not.
 */
export class ScoreSystem {
  panesCleaned = 0;
  spotlessCount = 0;
  bestMultiplier = 1;
  floorsCleared = 0;

  /** Kept as a float so a slow scrub still accrues; exposed rounded. */
  private total = 0;
  /** Panes finished since the last hit. */
  private streak = 0;

  get value(): number {
    return Math.round(this.total);
  }

  get multiplier(): number {
    return Math.min(MAX_MULTIPLIER, 1 + Math.floor(this.streak / PANES_PER_STEP));
  }

  /** Continuous points for actual cleaning. */
  addScrub(progressDelta: number): void {
    if (progressDelta <= 0) return;
    this.total += progressDelta * SCRUB_RATE * this.multiplier;
  }

  /**
   * Completion bonus for one pane, paid when it reaches the sign-off
   * threshold. Returns the points awarded.
   */
  finishPane(): number {
    const points = PANE_BONUS * this.multiplier;
    this.total += points;
    this.panesCleaned++;
    this.streak++;
    this.trackBest();
    return points;
  }

  /**
   * Paid separately when a pane later reaches 100%. Kept apart from
   * finishPane so a pane that crosses both thresholds in one frame is counted
   * once for each rather than paid the spotless bonus twice.
   */
  finishSpotless(): number {
    const points = SPOTLESS_BONUS * this.multiplier;
    this.total += points;
    this.spotlessCount++;
    return points;
  }

  /** Floor clear bonus, decaying with time taken. Returns the points awarded. */
  finishFloor(floor: number, seconds: number): number {
    const base = Math.max(FLOOR_FLOOR, FLOOR_BASE - FLOOR_DECAY_PER_SEC * seconds);
    const points = Math.round(base) * this.multiplier;
    this.total += points;
    this.floorsCleared = Math.max(this.floorsCleared, floor + 1);
    return points;
  }

  /** Reward for surviving a hazard by a hair. Returns the points awarded. */
  closeShave(): number {
    const points = CLOSE_SHAVE * this.multiplier;
    this.total += points;
    return points;
  }

  takeDamage(): void {
    this.streak = 0;
  }

  bonus(points: number): void {
    this.total += points;
  }

  private trackBest(): void {
    if (this.multiplier > this.bestMultiplier) this.bestMultiplier = this.multiplier;
  }
}
