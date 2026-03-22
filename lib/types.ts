export type HitType = "don" | "ka" | null;

export interface Hit {
  type: HitType;
  volume: number; // 0-100
  pitch: number; // 0-100: DON position (0=dead center/deepest, 100=near edge/brightest)
}

export interface Track {
  id: string;
  name: string;
  volume: number; // 0-100
  muted: boolean;
}

export interface DAWProject {
  bpm: number;
  beatsPerBar: number; // numerator of time signature
  noteValue: number; // denominator of time signature (2, 4, 8)
  subdivision: number; // steps per beat (1=quarter, 2=eighth, 4=sixteenth)
  bars: number;
  tracks: Track[];
  steps: Record<string, Hit[]>; // trackId -> flat step array
  rhythmOverrides?: Record<string, Record<number, number>>; // trackId -> barIndex -> subdivision override
  masterVolume: number; // 0-100
}

function makeSteps(count: number): Hit[] {
  return Array.from({ length: count }, () => ({ type: null, volume: 80, pitch: 50 } as Hit));
}

export function makeDefaultProject(): DAWProject {
  return {
    bpm: 120,
    beatsPerBar: 4,
    noteValue: 4,
    subdivision: 4,
    bars: 2,
    tracks: [{ id: "default-track-1", name: "Part 1", volume: 80, muted: false }],
    steps: { "default-track-1": makeSteps(2 * 4 * 4) },
    rhythmOverrides: {},
    masterVolume: 80,
  };
}

export { makeSteps };
