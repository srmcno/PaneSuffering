export class LevelDirector {
  public elapsed = 0;
  public phase = 0;
  public setPieceTriggered = false;

  update(deltaSec: number): void {
    this.elapsed += deltaSec;
    if (this.elapsed > 20 && this.phase < 1) this.phase = 1;
    if (this.elapsed > 45 && this.phase < 2) this.phase = 2;
    if (this.elapsed > 70 && this.phase < 3) this.phase = 3;
  }

  shouldTriggerSetPiece(): boolean {
    if (this.setPieceTriggered) return false;
    if (this.elapsed > 55) {
      this.setPieceTriggered = true;
      return true;
    }
    return false;
  }
}
