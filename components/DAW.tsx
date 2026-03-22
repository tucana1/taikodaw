"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Hit,
  HitType,
  Track,
  DAWProject,
  makeSteps,
  makeDefaultProject,
} from "@/lib/types";
import { getAudioContext, playDon, playKa, resumeAudio } from "@/lib/audio";
import { loadProject, saveProject, clearProject } from "@/lib/storage";

// ─── Constants ────────────────────────────────────────────────────────────────

const LOOKAHEAD_S = 0.1; // seconds to schedule ahead
const TICK_MS = 25; // scheduler poll interval

const TRACK_COLORS = [
  "#a855f7",
  "#3b82f6",
  "#22c55e",
  "#ef4444",
  "#f97316",
  "#ec4899",
  "#14b8a6",
  "#eab308",
];

// ─── Module-level helpers ─────────────────────────────────────────────────────

let trackCounter = 2;

function generateId(): string {
  return `track-${Date.now()}-${(trackCounter++).toString(36)}`;
}

function cycleHit(type: HitType): HitType {
  if (type === null) return "don";
  if (type === "don") return "ka";
  return null;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** Returns the persisted project if on client, otherwise default. */
function getInitialProject(): DAWProject {
  if (typeof window !== "undefined") {
    return loadProject() ?? makeDefaultProject();
  }
  return makeDefaultProject();
}

/** Resize all track step arrays to match a new total step count. */
function resizeStepsForGrid(
  prev: Record<string, Hit[]>,
  tracks: Track[],
  newTotal: number
): Record<string, Hit[]> {
  const next: Record<string, Hit[]> = {};
  for (const track of tracks) {
    const existing = prev[track.id] ?? [];
    if (existing.length === newTotal) {
      next[track.id] = existing;
    } else if (existing.length < newTotal) {
      next[track.id] = [
        ...existing,
        ...makeSteps(newTotal - existing.length),
      ];
    } else {
      next[track.id] = existing.slice(0, newTotal);
    }
  }
  return next;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface StepButtonProps {
  hit: Hit;
  isCurrent: boolean;
  isBeatStart: boolean;
  isBarStart: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

function StepButton({
  hit,
  isCurrent,
  isBeatStart,
  isBarStart,
  onClick,
  onContextMenu,
}: StepButtonProps) {
  const base =
    "w-8 h-8 rounded flex items-center justify-center text-xs font-bold border transition-all select-none cursor-pointer";
  const active =
    hit.type === "don"
      ? "bg-red-600 border-red-400 text-white hover:bg-red-500"
      : hit.type === "ka"
        ? "bg-blue-600 border-blue-400 text-white hover:bg-blue-500"
        : "bg-gray-800 border-gray-700 text-transparent hover:bg-gray-700 hover:border-gray-600";
  const highlight = isCurrent
    ? "ring-2 ring-yellow-400 ring-offset-1 ring-offset-gray-950"
    : "";
  const marginLeft = isBarStart ? "ml-3" : isBeatStart ? "ml-1.5" : "";

  return (
    <button
      className={`${base} ${active} ${highlight} ${marginLeft}`}
      onClick={onClick}
      onContextMenu={onContextMenu}
      title={
        hit.type
          ? `${hit.type.toUpperCase()} — vol ${hit.volume}% (right-click to adjust)`
          : "Click: DON → KA → empty"
      }
    >
      {hit.type === "don" ? "D" : hit.type === "ka" ? "K" : ""}
    </button>
  );
}

interface TrackRowProps {
  track: Track;
  color: string;
  trackSteps: Hit[];
  playingStep: number;
  beatsPerBar: number;
  subdivision: number;
  onUpdateTrack: (updates: Partial<Track>) => void;
  onRemoveTrack: () => void;
  onToggleStep: (stepIndex: number) => void;
  onContextMenu: (stepIndex: number, e: React.MouseEvent) => void;
}

function TrackRow({
  track,
  color,
  trackSteps,
  playingStep,
  beatsPerBar,
  subdivision,
  onUpdateTrack,
  onRemoveTrack,
  onToggleStep,
  onContextMenu,
}: TrackRowProps) {
  return (
    <div className="flex border-b border-gray-800 group">
      {/* Track Header */}
      <div className="w-52 shrink-0 bg-gray-900 border-r border-gray-700 p-2 flex flex-col gap-1.5">
        {/* Name row */}
        <div className="flex items-center gap-1">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: color }}
          />
          <input
            type="text"
            value={track.name}
            onChange={(e) => onUpdateTrack({ name: e.target.value })}
            className="flex-1 bg-transparent text-sm font-semibold text-white outline-none min-w-0 truncate"
          />
          <button
            onClick={onRemoveTrack}
            className="text-gray-600 hover:text-red-400 text-xs px-0.5 shrink-0"
            title="Remove track"
          >
            ✕
          </button>
        </div>

        {/* Volume row */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onUpdateTrack({ muted: !track.muted })}
            className={`px-1.5 py-0.5 rounded text-xs font-bold shrink-0 transition-colors ${
              track.muted
                ? "bg-orange-600 text-white"
                : "bg-gray-700 text-gray-400 hover:bg-gray-600"
            }`}
            title={track.muted ? "Unmute" : "Mute"}
          >
            M
          </button>
          <input
            type="range"
            min={0}
            max={100}
            value={track.volume}
            onChange={(e) =>
              onUpdateTrack({ volume: Number(e.target.value) })
            }
            className="flex-1 h-1 cursor-pointer"
            style={{ accentColor: color }}
            title={`Track volume: ${track.volume}%`}
          />
          <span className="text-xs text-gray-500 w-7 text-right shrink-0">
            {track.volume}%
          </span>
        </div>
      </div>

      {/* Step Grid */}
      <div className="flex items-center p-2 overflow-x-auto flex-1 min-w-0">
        <div className="flex items-center gap-0.5">
          {trackSteps.map((hit, stepIdx) => {
            const beatIndex = Math.floor(stepIdx / subdivision);
            const subIndex = stepIdx % subdivision;
            const barIndex = Math.floor(beatIndex / beatsPerBar);
            const beatInBar = beatIndex % beatsPerBar;
            const isBarStart = barIndex > 0 && beatInBar === 0 && subIndex === 0;
            const isBeatStart = beatInBar > 0 && subIndex === 0;

            return (
              <StepButton
                key={stepIdx}
                hit={hit}
                isCurrent={playingStep === stepIdx}
                isBeatStart={isBeatStart}
                isBarStart={isBarStart}
                onClick={() => onToggleStep(stepIdx)}
                onContextMenu={(e) => {
                  if (hit.type !== null) {
                    e.preventDefault();
                    onContextMenu(stepIdx, e);
                  }
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Main DAW Component ───────────────────────────────────────────────────────

export default function DAW() {
  // Initialize from localStorage on first render (lazy initializer is browser-safe)
  const [initialProject] = useState<DAWProject>(() => getInitialProject());

  const [bpm, setBpm] = useState(initialProject.bpm);
  const [beatsPerBar, setBeatsPerBar] = useState(initialProject.beatsPerBar);
  const [noteValue, setNoteValue] = useState(initialProject.noteValue);
  const [subdivision, setSubdivision] = useState(initialProject.subdivision);
  const [bars, setBars] = useState(initialProject.bars);
  const [tracks, setTracks] = useState<Track[]>(initialProject.tracks);
  const [steps, setSteps] = useState<Record<string, Hit[]>>(
    initialProject.steps
  );
  const [masterVolume, setMasterVolume] = useState(
    initialProject.masterVolume
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [looping, setLooping] = useState(true);
  const [playingStep, setPlayingStep] = useState(-1);
  const [contextMenu, setContextMenu] = useState<{
    trackId: string;
    stepIndex: number;
    x: number;
    y: number;
  } | null>(null);

  // ─── Scheduler refs ───────────────────────────────────────────────────────

  const isPlayingRef = useRef(false);
  const nextStepTimeRef = useRef(0);
  const currentStepRef = useRef(0);
  const schedulerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );
  const rafRef = useRef<number>(0);
  const lastVisualStepRef = useRef(-1);

  // Keep mutable copies for scheduler (avoids stale closures in setInterval)
  const bpmRef = useRef(bpm);
  const stepsRef = useRef(steps);
  const tracksRef = useRef(tracks);
  const masterVolumeRef = useRef(masterVolume);
  const subdivisionRef = useRef(subdivision);
  const totalStepsRef = useRef(bars * beatsPerBar * subdivision);
  const loopingRef = useRef(looping);

  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);
  useEffect(() => {
    stepsRef.current = steps;
  }, [steps]);
  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);
  useEffect(() => {
    masterVolumeRef.current = masterVolume;
  }, [masterVolume]);
  useEffect(() => {
    subdivisionRef.current = subdivision;
  }, [subdivision]);
  useEffect(() => {
    totalStepsRef.current = bars * beatsPerBar * subdivision;
  }, [bars, beatsPerBar, subdivision]);
  useEffect(() => {
    loopingRef.current = looping;
  }, [looping]);

  // ─── Persist to localStorage (debounced) ──────────────────────────────────

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveProject({
        bpm,
        beatsPerBar,
        noteValue,
        subdivision,
        bars,
        tracks,
        steps,
        masterVolume,
      });
    }, 500);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [bpm, beatsPerBar, noteValue, subdivision, bars, tracks, steps, masterVolume]);

  // ─── Playback engine ──────────────────────────────────────────────────────

  const scheduleStep = useCallback((step: number, time: number) => {
    const ctx = getAudioContext();
    for (const track of tracksRef.current) {
      if (track.muted) continue;
      const trackSteps = stepsRef.current[track.id];
      if (!trackSteps || step >= trackSteps.length) continue;
      const hit = trackSteps[step];
      if (!hit || hit.type === null) continue;
      if (hit.type === "don") {
        playDon(ctx, time, hit.volume, track.volume, masterVolumeRef.current);
      } else if (hit.type === "ka") {
        playKa(ctx, time, hit.volume, track.volume, masterVolumeRef.current);
      }
    }
  }, []);

  const scheduler = useCallback(() => {
    if (!isPlayingRef.current) return;
    const ctx = getAudioContext();
    const secPerStep =
      60 / bpmRef.current / subdivisionRef.current;
    const total = totalStepsRef.current;

    while (nextStepTimeRef.current < ctx.currentTime + LOOKAHEAD_S) {
      scheduleStep(currentStepRef.current, nextStepTimeRef.current);
      nextStepTimeRef.current += secPerStep;
      currentStepRef.current += 1;
      if (currentStepRef.current >= total) {
        if (loopingRef.current) {
          currentStepRef.current = 0;
        } else {
          // Signal stop — RAF will clean up
          isPlayingRef.current = false;
          currentStepRef.current = 0;
          return;
        }
      }
    }
  }, [scheduleStep]);

  const startPlayback = useCallback(async () => {
    await resumeAudio();
    const ctx = getAudioContext();
    currentStepRef.current = 0;
    nextStepTimeRef.current = ctx.currentTime + 0.05;
    lastVisualStepRef.current = -1;
    isPlayingRef.current = true;
    setIsPlaying(true);
    setPlayingStep(0);
    schedulerIntervalRef.current = setInterval(scheduler, TICK_MS);

    // Named recursive RAF loop — avoids self-referential useCallback
    function loop() {
      if (!isPlayingRef.current) {
        if (schedulerIntervalRef.current) {
          clearInterval(schedulerIntervalRef.current);
          schedulerIntervalRef.current = null;
        }
        setIsPlaying(false);
        setPlayingStep(-1);
        lastVisualStepRef.current = -1;
        return;
      }
      const step = currentStepRef.current;
      if (step !== lastVisualStepRef.current) {
        lastVisualStepRef.current = step;
        setPlayingStep(step);
      }
      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
  }, [scheduler]);

  const stopPlayback = useCallback(() => {
    isPlayingRef.current = false;
    if (schedulerIntervalRef.current) {
      clearInterval(schedulerIntervalRef.current);
      schedulerIntervalRef.current = null;
    }
    cancelAnimationFrame(rafRef.current);
    setIsPlaying(false);
    setPlayingStep(-1);
    lastVisualStepRef.current = -1;
    currentStepRef.current = 0;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (schedulerIntervalRef.current)
        clearInterval(schedulerIntervalRef.current);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // ─── Derived values ───────────────────────────────────────────────────────

  const totalSteps = bars * beatsPerBar * subdivision;

  // ─── Track management ─────────────────────────────────────────────────────

  const addTrack = useCallback(() => {
    const id = generateId();
    const newTrack: Track = {
      id,
      name: `Part ${tracks.length + 1}`,
      volume: 80,
      muted: false,
    };
    setTracks((prev) => [...prev, newTrack]);
    setSteps((prev) => ({ ...prev, [id]: makeSteps(totalSteps) }));
  }, [tracks.length, totalSteps]);

  const removeTrack = useCallback((trackId: string) => {
    setTracks((prev) => prev.filter((t) => t.id !== trackId));
    setSteps((prev) => {
      const next = { ...prev };
      delete next[trackId];
      return next;
    });
  }, []);

  const updateTrack = useCallback(
    (trackId: string, updates: Partial<Track>) => {
      setTracks((prev) =>
        prev.map((t) => (t.id === trackId ? { ...t, ...updates } : t))
      );
    },
    []
  );

  // ─── Step management ──────────────────────────────────────────────────────

  const toggleStep = useCallback((trackId: string, stepIndex: number) => {
    setSteps((prev) => {
      const trackSteps = [...(prev[trackId] ?? [])];
      const cur = trackSteps[stepIndex];
      trackSteps[stepIndex] = { ...cur, type: cycleHit(cur.type) };
      return { ...prev, [trackId]: trackSteps };
    });
  }, []);

  const setHitVolume = useCallback(
    (trackId: string, stepIndex: number, vol: number) => {
      setSteps((prev) => {
        const trackSteps = [...(prev[trackId] ?? [])];
        trackSteps[stepIndex] = { ...trackSteps[stepIndex], volume: vol };
        return { ...prev, [trackId]: trackSteps };
      });
    },
    []
  );

  const clearTrack = useCallback((trackId: string) => {
    setSteps((prev) => ({
      ...prev,
      [trackId]: prev[trackId].map((h) => ({ ...h, type: null })),
    }));
  }, []);

  // ─── Grid dimension handlers (resize steps when dimensions change) ──────────

  const handleSetBars = useCallback(
    (newBars: number) => {
      const n = clamp(newBars, 1, 16);
      const newTotal = n * beatsPerBar * subdivision;
      setBars(n);
      setSteps((prev) => resizeStepsForGrid(prev, tracks, newTotal));
    },
    [beatsPerBar, subdivision, tracks]
  );

  const handleSetBeatsPerBar = useCallback(
    (newBeats: number) => {
      const newTotal = bars * newBeats * subdivision;
      setBeatsPerBar(newBeats);
      setSteps((prev) => resizeStepsForGrid(prev, tracks, newTotal));
    },
    [bars, subdivision, tracks]
  );

  const handleSetSubdivision = useCallback(
    (newSub: number) => {
      const newTotal = bars * beatsPerBar * newSub;
      setSubdivision(newSub);
      setSteps((prev) => resizeStepsForGrid(prev, tracks, newTotal));
    },
    [bars, beatsPerBar, tracks]
  );

  // ─── Reset ────────────────────────────────────────────────────────────────

  const resetProject = useCallback(() => {
    if (!confirm("Reset everything to defaults? This cannot be undone.")) return;
    stopPlayback();
    clearProject();
    const p = makeDefaultProject();
    setBpm(p.bpm);
    setNoteValue(p.noteValue);
    setMasterVolume(p.masterVolume);
    setTracks(p.tracks);
    // Use handlers so steps are resized in the same update
    setBeatsPerBar(p.beatsPerBar);
    setSubdivision(p.subdivision);
    setBars(p.bars);
    setSteps(p.steps);
  }, [stopPlayback]);

  // ─── Beat/bar ruler ───────────────────────────────────────────────────────

  const rulerCells: { label: string; width: number }[] = [];
  for (let b = 0; b < bars; b++) {
    for (let beat = 0; beat < beatsPerBar; beat++) {
      // width in px: subdivision * (32px + 2px gap) + beat gaps
      rulerCells.push({
        label: beat === 0 ? `Bar ${b + 1}` : `${b + 1}.${beat + 1}`,
        width: subdivision * 34,
      });
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      className="min-h-screen bg-gray-950 text-gray-100 flex flex-col select-none"
      onClick={() => setContextMenu(null)}
    >
      {/* ── App Header ─────────────────────────────────────────────────── */}
      <header className="bg-gray-900 border-b border-gray-700 px-5 py-2.5 flex items-center gap-3">
        <span className="text-lg font-extrabold tracking-tight text-white">
          🥁 TaikoDaw
        </span>
        <span className="text-xs text-gray-500 font-medium">
          Taiko Beat Sequencer
        </span>
        <div className="flex items-center gap-1 ml-auto text-xs text-gray-600">
          <span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block" />
          DON&nbsp;=&nbsp;face hit &nbsp;|&nbsp;
          <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" />
          KA&nbsp;=&nbsp;edge hit
        </div>
      </header>

      {/* ── Transport Bar ──────────────────────────────────────────────── */}
      <div className="bg-gray-900 border-b border-gray-700 px-5 py-3 flex flex-wrap items-center gap-5">
        {/* Play / Stop */}
        <div className="flex items-center gap-2">
          <button
            onClick={isPlaying ? stopPlayback : startPlayback}
            className={`w-10 h-10 rounded-lg flex items-center justify-center text-base font-bold transition-colors shadow ${
              isPlaying
                ? "bg-red-600 hover:bg-red-700 text-white"
                : "bg-emerald-600 hover:bg-emerald-700 text-white"
            }`}
            title={isPlaying ? "Stop (■)" : "Play (▶)"}
          >
            {isPlaying ? "■" : "▶"}
          </button>

          <button
            onClick={() => setLooping((l) => !l)}
            className={`px-3 h-8 rounded text-sm font-medium transition-colors ${
              looping
                ? "bg-blue-700 hover:bg-blue-600 text-white"
                : "bg-gray-800 hover:bg-gray-700 text-gray-400"
            }`}
            title="Toggle loop"
          >
            ↻ Loop
          </button>
        </div>

        {/* BPM */}
        <label className="flex items-center gap-2">
          <span className="text-xs text-gray-400 uppercase tracking-wider font-semibold">
            BPM
          </span>
          <input
            type="number"
            min={20}
            max={320}
            value={bpm}
            onChange={(e) => setBpm(clamp(Number(e.target.value), 20, 320))}
            className="w-16 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-center text-white"
          />
        </label>

        {/* Time Signature */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400 uppercase tracking-wider font-semibold">
            Time
          </span>
          <select
            value={beatsPerBar}
            onChange={(e) => handleSetBeatsPerBar(Number(e.target.value))}
            className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white"
          >
            {[2, 3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <span className="text-gray-500 font-bold">/</span>
          <select
            value={noteValue}
            onChange={(e) => setNoteValue(Number(e.target.value))}
            className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white"
          >
            {[2, 4, 8].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        {/* Grid subdivision */}
        <label className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400 uppercase tracking-wider font-semibold">
            Grid
          </span>
          <select
            value={subdivision}
            onChange={(e) => handleSetSubdivision(Number(e.target.value))}
            className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white"
            title="Subdivisions per beat"
          >
            <option value={1}>1/beat (quarter notes)</option>
            <option value={2}>2/beat (eighth notes)</option>
            <option value={4}>4/beat (sixteenth notes)</option>
          </select>
        </label>

        {/* Bars */}
        <label className="flex items-center gap-2">
          <span className="text-xs text-gray-400 uppercase tracking-wider font-semibold">
            Bars
          </span>
          <input
            type="number"
            min={1}
            max={16}
            value={bars}
            onChange={(e) => handleSetBars(Number(e.target.value))}
            className="w-12 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-center text-white"
          />
        </label>

        {/* Master Volume */}
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-gray-400 uppercase tracking-wider font-semibold">
            Master
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={masterVolume}
            onChange={(e) => setMasterVolume(Number(e.target.value))}
            className="w-28 cursor-pointer"
            style={{ accentColor: "#a855f7" }}
          />
          <span className="text-xs text-gray-400 w-8 text-right">
            {masterVolume}%
          </span>
        </div>

        {/* Reset */}
        <button
          onClick={resetProject}
          className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-xs text-gray-500 hover:text-gray-300 transition-colors"
          title="Reset to defaults"
        >
          Reset
        </button>
      </div>

      {/* ── Tracks ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        <div className="min-w-max">
          {/* Beat ruler */}
          <div className="flex sticky top-0 bg-gray-950 border-b border-gray-800 z-10">
            <div className="w-52 shrink-0 bg-gray-950 border-r border-gray-700 px-3 py-1 flex items-end">
              <span className="text-xs text-gray-600 font-semibold uppercase tracking-wider">
                Track
              </span>
            </div>
            <div className="flex items-end p-2 gap-0.5">
              {rulerCells.map((cell, idx) => (
                <div
                  key={idx}
                  className={`text-xs text-gray-500 font-medium px-1 pb-0.5 ${
                    idx > 0 && idx % beatsPerBar === 0
                      ? "ml-3 border-l border-gray-700 pl-2"
                      : idx > 0
                        ? "ml-1.5"
                        : ""
                  }`}
                  style={{ width: cell.width }}
                >
                  {cell.label}
                </div>
              ))}
            </div>
          </div>

          {/* Track rows */}
          {tracks.map((track, idx) => {
            const color = TRACK_COLORS[idx % TRACK_COLORS.length];
            const trackSteps = steps[track.id] ?? makeSteps(totalSteps);

            return (
              <TrackRow
                key={track.id}
                track={track}
                color={color}
                trackSteps={trackSteps}
                playingStep={playingStep}
                beatsPerBar={beatsPerBar}
                subdivision={subdivision}
                onUpdateTrack={(updates) => updateTrack(track.id, updates)}
                onRemoveTrack={() => removeTrack(track.id)}
                onToggleStep={(stepIndex) => toggleStep(track.id, stepIndex)}
                onContextMenu={(stepIndex, e) =>
                  setContextMenu({
                    trackId: track.id,
                    stepIndex,
                    x: e.clientX,
                    y: e.clientY,
                  })
                }
              />
            );
          })}
        </div>

        {/* Add track */}
        <div className="p-4 flex gap-3">
          <button
            onClick={addTrack}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-500 rounded text-sm text-gray-300 transition-colors"
          >
            + Add Track
          </button>
          {tracks.length > 0 && (
            <button
              onClick={() => {
                if (
                  confirm(
                    "Clear all steps in all tracks? Tracks and settings will be kept."
                  )
                ) {
                  tracks.forEach((t) => clearTrack(t.id));
                }
              }}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-orange-700 rounded text-sm text-gray-400 hover:text-orange-300 transition-colors"
            >
              Clear All Steps
            </button>
          )}
        </div>

        {/* Empty state */}
        {tracks.length === 0 && (
          <div className="p-12 text-center text-gray-600">
            <p className="text-4xl mb-4">🥁</p>
            <p className="text-base font-medium">No tracks yet.</p>
            <p className="text-sm mt-1">Click &ldquo;+ Add Track&rdquo; to get started.</p>
          </div>
        )}
      </div>

      {/* ── Per-hit Volume Context Menu ─────────────────────────────────── */}
      {contextMenu !== null && (() => {
        const hit = steps[contextMenu.trackId]?.[contextMenu.stepIndex];
        if (!hit || hit.type === null) return null;
        return (
          <div
            className="fixed bg-gray-800 border border-gray-600 rounded-lg shadow-2xl p-4 z-50 min-w-48"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">
              {hit.type === "don" ? "🔴 DON" : "🔵 KA"} — Hit Volume
            </p>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                value={hit.volume}
                onChange={(e) =>
                  setHitVolume(
                    contextMenu.trackId,
                    contextMenu.stepIndex,
                    Number(e.target.value)
                  )
                }
                className="flex-1 cursor-pointer"
                style={{ accentColor: hit.type === "don" ? "#ef4444" : "#3b82f6" }}
              />
              <span className="text-sm text-white w-9 text-right">
                {hit.volume}%
              </span>
            </div>
            <button
              onClick={() => setContextMenu(null)}
              className="mt-3 w-full text-xs text-gray-500 hover:text-gray-300"
            >
              Close
            </button>
          </div>
        );
      })()}

      {/* ── Footer hint ───────────────────────────────────────────────── */}
      <footer className="bg-gray-900 border-t border-gray-800 px-5 py-2 text-xs text-gray-600 flex gap-4">
        <span>Left-click step to cycle: empty → DON → KA → empty</span>
        <span>Right-click active step to adjust individual hit volume</span>
        <span className="ml-auto">Your project is auto-saved in the browser</span>
      </footer>
    </div>
  );
}
