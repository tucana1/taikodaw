import { DAWProject } from "./types";

const STORAGE_KEY = "taikodaw-project";

export function saveProject(project: DAWProject): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
  } catch {
    // Ignore quota / security errors
  }
}

export function loadProject(): DAWProject | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DAWProject;
  } catch {
    return null;
  }
}

export function clearProject(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
}
