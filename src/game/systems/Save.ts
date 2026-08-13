export interface SaveData {
  bestScore: number;
  bestFloor: number;
  runs: number;
  seenTutorial: boolean;
}

const PREFIX = 'pane-and-suffering:';

const KEYS = {
  bestScore: `${PREFIX}bestScore`,
  bestFloor: `${PREFIX}bestFloor`,
  runs: `${PREFIX}runs`,
  seenTutorial: `${PREFIX}seenTutorial`,
} as const;

const DEFAULTS: SaveData = { bestScore: 0, bestFloor: 0, runs: 0, seenTutorial: false };

/**
 * Resolved once. Private-mode Safari and sandboxed iframes hand back a Storage
 * object that throws on use rather than one that is missing, so the only
 * reliable probe is an actual write.
 */
let store: Storage | null | undefined;

function storage(): Storage | null {
  if (store !== undefined) return store;
  store = null;
  try {
    const candidate = window.localStorage;
    const probe = `${PREFIX}probe`;
    candidate.setItem(probe, '1');
    candidate.removeItem(probe);
    store = candidate;
  } catch {
    // No persistence available; the game is still perfectly playable.
  }
  return store;
}

function readNumber(key: string, fallback: number): number {
  const raw = storage()?.getItem(key);
  if (raw === null || raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function write(key: string, value: string): void {
  try {
    storage()?.setItem(key, value);
  } catch {
    // Quota or a storage policy change mid-session: drop it silently.
  }
}

/** Best-effort persistence. Every read has a default, every write can fail. */
export const Save = {
  load(): SaveData {
    const s = storage();
    if (!s) return { ...DEFAULTS };
    return {
      bestScore: Math.max(0, Math.round(readNumber(KEYS.bestScore, DEFAULTS.bestScore))),
      bestFloor: Math.max(0, Math.round(readNumber(KEYS.bestFloor, DEFAULTS.bestFloor))),
      runs: Math.max(0, Math.round(readNumber(KEYS.runs, DEFAULTS.runs))),
      seenTutorial: s.getItem(KEYS.seenTutorial) === '1',
    };
  },

  recordRun(score: number, floorsCleared: number): { bestScore: number; newBest: boolean } {
    const data = Save.load();
    const runScore = Number.isFinite(score) ? Math.max(0, Math.round(score)) : 0;
    const runFloor = Number.isFinite(floorsCleared) ? Math.max(0, Math.round(floorsCleared)) : 0;
    const newBest = runScore > data.bestScore;

    const bestScore = Math.max(data.bestScore, runScore);
    write(KEYS.bestScore, String(bestScore));
    write(KEYS.bestFloor, String(Math.max(data.bestFloor, runFloor)));
    write(KEYS.runs, String(data.runs + 1));

    return { bestScore, newBest };
  },

  markTutorialSeen(): void {
    write(KEYS.seenTutorial, '1');
  },

  reset(): void {
    const s = storage();
    if (!s) return;
    try {
      for (const key of Object.values(KEYS)) s.removeItem(key);
    } catch {
      // Nothing to do: the slate is as clean as it is going to get.
    }
  },
};
