export type PerkId =
  | 'bucket'
  | 'hose'
  | 'microfibre'
  | 'wideBlade'
  | 'counterweight'
  | 'quickClip'
  | 'helmet'
  | 'firstAid'
  | 'grip'
  | 'spikes'
  | 'hazardPay';

export type PerkGlyph = 'bucket' | 'hose' | 'blade' | 'wide' | 'weight' | 'clip' | 'helmet' | 'cross' | 'fist' | 'spikes' | 'coin';

export interface PerkDef {
  id: PerkId;
  name: string;
  /** What it does, in the player's terms. One short sentence. */
  text: string;
  /** Payroll-office flavour line. */
  flavour: string;
  glyph: PerkGlyph;
  maxStacks: number;
  color: number;
}

export const PERKS: Record<PerkId, PerkDef> = {
  bucket: {
    id: 'bucket',
    name: 'INDUSTRIAL BUCKET',
    text: 'Soap lasts 50% longer between refills.',
    flavour: 'Twenty litres. Your lower back files a grievance.',
    glyph: 'bucket',
    maxStacks: 2,
    color: 0x6fc3ff,
  },
  hose: {
    id: 'hose',
    name: 'PRESSURE HOSE',
    text: 'Refill at the bucket twice as fast.',
    flavour: 'Borrowed from the fire suppression system. Do not tell anyone.',
    glyph: 'hose',
    maxStacks: 2,
    color: 0x6fc3ff,
  },
  microfibre: {
    id: 'microfibre',
    name: 'MICROFIBRE BLADE',
    text: 'The squeegee cleans 25% harder.',
    flavour: 'Lifts grime, pigeon residue and, briefly, your spirits.',
    glyph: 'blade',
    maxStacks: 2,
    color: 0x5ce8a0,
  },
  wideBlade: {
    id: 'wideBlade',
    name: 'WIDE-BODY SQUEEGEE',
    text: 'A 35% wider blade covers more glass per sweep.',
    flavour: 'Technically a snow plough.',
    glyph: 'wide',
    maxStacks: 2,
    color: 0x5ce8a0,
  },
  counterweight: {
    id: 'counterweight',
    name: 'COUNTERWEIGHT',
    text: 'Your weight tips the deck 20% less.',
    flavour: 'A sandbag with a name tag. It is now your best colleague.',
    glyph: 'weight',
    maxStacks: 2,
    color: 0xf6b73c,
  },
  quickClip: {
    id: 'quickClip',
    name: 'QUICK-CLIP LINE',
    text: 'The safety line recharges 35% faster.',
    flavour: 'Certified by someone, somewhere.',
    glyph: 'clip',
    maxStacks: 2,
    color: 0x8fd6ff,
  },
  helmet: {
    id: 'helmet',
    name: 'PADDED HARD HAT',
    text: 'Take 25% less damage from everything.',
    flavour: 'Now with a second, smaller hard hat inside.',
    glyph: 'helmet',
    maxStacks: 2,
    color: 0xeaf0fb,
  },
  firstAid: {
    id: 'firstAid',
    name: 'FIRST AID KIT',
    text: 'Restore 40 integrity right now.',
    flavour: 'Mostly plasters. One of them is shaped like a dinosaur.',
    glyph: 'cross',
    maxStacks: 99,
    color: 0xff5a4d,
  },
  grip: {
    id: 'grip',
    name: 'IRON GRIP',
    text: 'An extra 1.2 seconds to haul yourself back up.',
    flavour: 'Forearms like hawsers. Handshakes are now a liability.',
    glyph: 'fist',
    maxStacks: 2,
    color: 0xf6b73c,
  },
  spikes: {
    id: 'spikes',
    name: 'PIGEON SPIKES',
    text: '60% fewer pigeons land on the rig.',
    flavour: 'The pigeons have been informed. They are taking it personally.',
    glyph: 'spikes',
    maxStacks: 1,
    color: 0xb9c3d6,
  },
  hazardPay: {
    id: 'hazardPay',
    name: 'HAZARD PAY',
    text: 'Every point you earn is worth 20% more.',
    flavour: 'Negotiated by the union at great personal risk.',
    glyph: 'coin',
    maxStacks: 2,
    color: 0xd9f24e,
  },
};

const ALL: PerkId[] = Object.keys(PERKS) as PerkId[];

/**
 * The upgrades a run has picked up. Everything that reads a perk goes through
 * one of the getters here, so the tuning of a perk lives in one place and a
 * new run is just a new instance.
 */
export class PerkState {
  private readonly stacks = new Map<PerkId, number>();

  count(id: PerkId): number {
    return this.stacks.get(id) ?? 0;
  }

  add(id: PerkId): void {
    this.stacks.set(id, this.count(id) + 1);
  }

  /** Owned perks in pick order, for the HUD. */
  get owned(): Array<{ id: PerkId; stacks: number }> {
    return [...this.stacks.entries()]
      .filter(([id]) => id !== 'firstAid')
      .map(([id, stacks]) => ({ id, stacks }));
  }

  /**
   * Three distinct offers. First aid is only offered when it would do
   * something, and a maxed perk is never offered again.
   */
  draft(health: number, maxHealth: number, rand: () => number = Math.random): PerkId[] {
    const pool = ALL.filter((id) => {
      if (id === 'firstAid') return health <= maxHealth - 25;
      return this.count(id) < PERKS[id].maxStacks;
    });
    // Hurt players should see the kit more often than chance alone gives.
    const weight = (id: PerkId): number => (id === 'firstAid' ? 1 + (1 - health / maxHealth) * 3 : 1);
    const picks: PerkId[] = [];
    while (picks.length < 3 && pool.length > 0) {
      const total = pool.reduce((sum, id) => sum + weight(id), 0);
      let roll = rand() * total;
      let index = 0;
      for (; index < pool.length - 1; index++) {
        roll -= weight(pool[index]);
        if (roll <= 0) break;
      }
      picks.push(pool[index]);
      pool.splice(index, 1);
    }
    return picks;
  }

  get soapCapacityScale(): number {
    return 1 + 0.5 * this.count('bucket');
  }
  get refillScale(): number {
    return 1 + this.count('hose');
  }
  get cleanPowerScale(): number {
    return 1 + 0.25 * this.count('microfibre');
  }
  get bladeWidthScale(): number {
    return 1 + 0.35 * this.count('wideBlade');
  }
  get tiltScale(): number {
    return Math.pow(0.8, this.count('counterweight'));
  }
  get safetyCooldownScale(): number {
    return Math.pow(0.65, this.count('quickClip'));
  }
  get damageScale(): number {
    return Math.pow(0.75, this.count('helmet'));
  }
  get gripBonus(): number {
    return 1.2 * this.count('grip');
  }
  get pigeonScale(): number {
    return this.count('spikes') > 0 ? 0.4 : 1;
  }
  get scoreScale(): number {
    return 1 + 0.2 * this.count('hazardPay');
  }
}
