import Phaser from 'phaser';
import { CSS, FONT, PALETTE, VIEW } from '../config';
import { audio } from '../audio/AudioEngine';
import { onKeyPress } from '../core/keys';
import { PERKS, PerkId } from '../systems/Perks';
import { drawPerkGlyph } from '../ui/perkGlyph';

export interface PerkDraftData {
  offers: PerkId[];
  /** How many of each offer the run already owns, index-aligned with offers. */
  stacks: number[];
  /** The floor the rig is winching up to, zero-based. */
  floor: number;
  touch: boolean;
}

const CARD_W = 318;
const CARD_H = 372;
const CARD_Y = 392;
const CARD_GAP = 32;
/** Ignore input briefly so a key held through the floor clear cannot pick for you. */
const ARM_MS = 450;

interface Card {
  id: PerkId;
  root: Phaser.GameObjects.Container;
  frame: Phaser.GameObjects.Graphics;
  x: number;
  /** Tracked so reselecting replaces it without killing the card's entrance. */
  scaleTween?: Phaser.Tweens.Tween;
}

/**
 * The between-floors requisition: three upgrades, pick one. GameScene pauses
 * itself to open this and resumes when it hears `perk-chosen`, so the winch
 * ride carries on underneath once the choice is made.
 */
export class PerkScene extends Phaser.Scene {
  private cards: Card[] = [];
  private index = 1;
  private armed = false;
  private closing = false;
  private draft!: PerkDraftData;
  private scrim!: Phaser.GameObjects.Rectangle;
  private header!: Phaser.GameObjects.Container;

  constructor() {
    super('PerkScene');
  }

  init(data: PerkDraftData): void {
    this.draft = data;
  }

  create(): void {
    this.cards = [];
    this.index = Math.min(1, this.draft.offers.length - 1);
    this.armed = false;
    this.closing = false;

    this.scrim = this.add.rectangle(VIEW.W / 2, VIEW.H / 2, VIEW.W, VIEW.H, PALETTE.ink, 1).setAlpha(0);
    this.tweens.add({ targets: this.scrim, alpha: 0.72, duration: 240 });
    this.add.image(VIEW.W / 2, VIEW.H / 2, 'vignette').setDisplaySize(VIEW.W, VIEW.H).setAlpha(0.8);

    this.buildHeader();
    this.buildCards();
    this.bindInput();
    this.select(this.index, true);

    audio.play('ratchet', { volume: 0.5, detune: 300 });
    this.time.delayedCall(ARM_MS, () => (this.armed = true));
  }

  private buildHeader(): void {
    const floorLabel = `FLOOR ${41 + this.draft.floor}`;
    const eyebrow = this.add
      .text(0, 0, `EN ROUTE TO ${floorLabel}`, {
        fontFamily: FONT,
        fontSize: '12px',
        color: CSS.dim,
        letterSpacing: 6,
      })
      .setOrigin(0.5, 0);
    const title = this.add
      .text(0, 20, 'REQUISITION ONE ITEM', {
        fontFamily: FONT,
        fontSize: '38px',
        color: CSS.amber,
        fontStyle: 'bold',
        letterSpacing: 6,
      })
      .setOrigin(0.5, 0)
      .setStroke('#04060c', 6);
    const hint = this.add
      .text(
        0,
        72,
        this.draft.touch ? 'TAP A CARD TO SIGN FOR IT' : '← → CHOOSE   ·   ENTER / SPACE SIGN FOR IT   ·   OR CLICK A CARD',
        { fontFamily: FONT, fontSize: '11px', color: CSS.dim, letterSpacing: 4 },
      )
      .setOrigin(0.5, 0);
    this.header = this.add.container(VIEW.W / 2, 60, [eyebrow, title, hint]).setAlpha(0);
    this.tweens.add({ targets: this.header, alpha: 1, y: 52, duration: 380, ease: 'Quad.Out' });
  }

  private buildCards(): void {
    const n = this.draft.offers.length;
    const total = n * CARD_W + (n - 1) * CARD_GAP;
    const left = VIEW.W / 2 - total / 2 + CARD_W / 2;

    this.draft.offers.forEach((id, i) => {
      const def = PERKS[id];
      const owned = this.draft.stacks[i] ?? 0;
      const x = left + i * (CARD_W + CARD_GAP);

      const frame = this.add.graphics();
      const art = this.add.graphics();
      // Glyph plate: a tinted well that makes the pictogram read at a glance.
      art.fillStyle(def.color, 0.12);
      art.fillRoundedRect(-CARD_W / 2 + 20, -CARD_H / 2 + 22, CARD_W - 40, 120, 8);
      art.lineStyle(1, def.color, 0.35);
      art.strokeRoundedRect(-CARD_W / 2 + 20, -CARD_H / 2 + 22, CARD_W - 40, 120, 8);
      drawPerkGlyph(art, def.glyph, 0, -CARD_H / 2 + 82, 72, def.color);

      const name = this.add
        .text(0, -CARD_H / 2 + 162, def.name, {
          fontFamily: FONT,
          fontSize: '19px',
          color: CSS.paper,
          fontStyle: 'bold',
          letterSpacing: 2,
          align: 'center',
          wordWrap: { width: CARD_W - 40 },
        })
        .setOrigin(0.5, 0);
      const text = this.add
        .text(0, name.y + name.height + 12, def.text, {
          fontFamily: FONT,
          fontSize: '15px',
          color: CSS.paper,
          align: 'center',
          lineSpacing: 4,
          wordWrap: { width: CARD_W - 52 },
        })
        .setOrigin(0.5, 0)
        .setAlpha(0.92);
      const flavour = this.add
        .text(0, CARD_H / 2 - 82, def.flavour, {
          fontFamily: FONT,
          fontSize: '12px',
          color: CSS.dim,
          fontStyle: 'italic',
          align: 'center',
          lineSpacing: 3,
          wordWrap: { width: CARD_W - 56 },
        })
        .setOrigin(0.5, 0);

      const pips = this.add.graphics();
      if (def.maxStacks > 1 && def.maxStacks < 10) {
        const pw = 22;
        const px0 = -((def.maxStacks - 1) * (pw + 6)) / 2;
        for (let k = 0; k < def.maxStacks; k++) {
          const filled = k < owned;
          const next = k === owned;
          pips.fillStyle(filled ? def.color : next ? PALETTE.amber : PALETTE.steelDark, filled || next ? 1 : 0.5);
          pips.fillRoundedRect(px0 + k * (pw + 6) - pw / 2, CARD_H / 2 - 26, pw, 5, 2);
        }
      }

      const root = this.add.container(x, CARD_Y + 40, [frame, art, name, text, flavour, pips]).setAlpha(0);
      root.setSize(CARD_W, CARD_H).setInteractive({ useHandCursor: true });
      root.on(Phaser.Input.Events.POINTER_OVER, () => this.select(i));
      root.on(Phaser.Input.Events.POINTER_UP, () => {
        this.select(i);
        this.confirm();
      });
      this.tweens.add({
        targets: root,
        alpha: 1,
        y: CARD_Y,
        duration: 420,
        delay: 120 + i * 90,
        ease: 'Back.Out',
      });

      this.cards.push({ id, root, frame, x });
    });
  }

  private drawFrame(card: Card, selected: boolean): void {
    const def = PERKS[card.id];
    const g = card.frame;
    g.clear();
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(-CARD_W / 2 + 4, -CARD_H / 2 + 8, CARD_W, CARD_H, 12);
    g.fillStyle(PALETTE.ink, 0.97);
    g.fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 12);
    g.fillStyle(def.color, selected ? 0.9 : 0.5);
    g.fillRect(-CARD_W / 2 + 12, -CARD_H / 2, CARD_W - 24, 4);
    g.lineStyle(selected ? 2.5 : 1.2, selected ? PALETTE.amber : PALETTE.steel, selected ? 1 : 0.4);
    g.strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 12);
  }

  private select(i: number, instant = false): void {
    if (this.closing || i < 0 || i >= this.cards.length) return;
    if (i !== this.index && !instant) audio.play('click', { volume: 0.35 });
    this.index = i;
    this.cards.forEach((card, k) => {
      const on = k === i;
      this.drawFrame(card, on);
      card.scaleTween?.stop();
      card.scaleTween = this.tweens.add({
        targets: card.root,
        scale: on ? 1.04 : 0.97,
        duration: instant ? 0 : 140,
        ease: 'Quad.Out',
      });
    });
  }

  private confirm(): void {
    if (!this.armed || this.closing) return;
    this.closing = true;
    const chosen = this.cards[this.index];

    this.cards.forEach((card, k) => {
      if (k === this.index) {
        this.tweens.add({ targets: card.root, scale: 1.12, duration: 160, yoyo: true, ease: 'Quad.Out' });
        this.tweens.add({ targets: card.root, alpha: 0, y: CARD_Y - 60, delay: 320, duration: 220 });
      } else {
        this.tweens.add({ targets: card.root, alpha: 0, y: CARD_Y + 50, duration: 200 });
      }
    });
    this.tweens.add({ targets: [this.header, this.scrim], alpha: 0, delay: 300, duration: 240 });

    this.time.delayedCall(560, () => {
      this.scene.get<Phaser.Scene>('GameScene').events.emit('perk-chosen', chosen.id);
      this.scene.stop();
    });
  }

  private bindInput(): void {
    const kb = this.input.keyboard;
    if (!kb) return;
    onKeyPress(kb, ['LEFT', 'A'], () => this.select(this.index - 1));
    onKeyPress(kb, ['RIGHT', 'D'], () => this.select(this.index + 1));
    onKeyPress(kb, ['ENTER', 'SPACE'], () => this.confirm());
  }
}
