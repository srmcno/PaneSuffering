export class ScoreSystem {
  score = 0;
  private hitsTaken = 0;
  private instabilityPenalty = 0;

  addClean(points = 100): void {
    this.score += points;
  }

  addHazardSurvival(points = 45): void {
    this.score += points;
  }

  addSetPieceBonus(): void {
    this.score += 600;
  }

  penalizeHit(): void {
    this.hitsTaken += 1;
    this.score = Math.max(0, this.score - 80);
  }

  tick(stability: number, deltaMs: number): void {
    if (stability < 0.3) {
      this.instabilityPenalty += (1 - stability) * deltaMs * 0.02;
    }
  }

  finalize(cleaned: number, quota: number, timeMs: number): number {
    const quotaBonus = cleaned >= quota ? 500 : 0;
    const efficiency = Math.max(0, 400 - timeMs * 0.003);
    const cleanliness = cleaned * 35;
    const penalty = this.instabilityPenalty + this.hitsTaken * 45;
    this.score = Math.max(0, Math.round(this.score + quotaBonus + efficiency + cleanliness - penalty));
    return this.score;
  }
}
