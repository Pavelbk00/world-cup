import type { MedalistsPrediction } from "./types";

export const PLAYOFF_RESULTS: Record<
  string,
  { winner: string; method: "regular" | "extraTime" | "penalties" }
> = {};

export async function loadPlayoffResults(): Promise<void> {
  try {
    const res = await fetch("/api/playoff-results");
    if (!res.ok) return;
    const data = (await res.json()) as Record<
      string,
      { winner: string; method: string }
    >;
    for (const key of Object.keys(PLAYOFF_RESULTS)) delete PLAYOFF_RESULTS[key];
    for (const [id, v] of Object.entries(data)) {
      if (v?.winner && v?.method)
        PLAYOFF_RESULTS[id] = v as {
          winner: string;
          method: "regular" | "extraTime" | "penalties";
        };
    }
  } catch {
    /* ignore */
  }
}

export const GOLDEN_BOOT_WINNER: string | null = null;

export const PLAYER_GOALS: Record<string, number> = {};

export const MEDALISTS_RESULT: MedalistsPrediction | null = null;
