export class ScoreSystem {
  private score = 0;

  addClean(base = 120): void {
    this.score += base;
  }

  addHazardSurvive(value = 60): void {
    this.score += value;
  }

  addMajorBonus(): void {
    this.score += 500;
  }

  penalizeHit(): void {
    this.score = Math.max(0, this.score - 85);
  }

  penalizeInstability(): void {
    this.score = Math.max(0, this.score - 1);
  }

  addTickEfficiency(deltaSec: number): void {
    this.score += Math.floor(1.8 * deltaSec);
  }

  getValue(): number {
    return this.score;
  }
}
