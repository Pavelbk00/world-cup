import type { MedalistsPrediction } from "./types";
import type { MatchResultState } from "./types";
import type { PlayoffResultMap } from "./utils/api";

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

export const TOURNAMENT_RESULTS = {
  goldenBootWinner: null as string | null,
  playerGoals: {} as Record<string, number>,
  medalistsResult: null as MedalistsPrediction | null,
};

export async function loadTournamentResults(): Promise<void> {
  try {
    const res = await fetch("/api/tournament-results");
    if (!res.ok) return;
    const data = (await res.json()) as {
      goldenBootWinner?: string;
      playerGoals?: Record<string, number>;
    };
    TOURNAMENT_RESULTS.goldenBootWinner = data.goldenBootWinner ?? null;
    TOURNAMENT_RESULTS.playerGoals = data.playerGoals ?? {};
  } catch {
    /* ignore */
  }
}

export function deriveMedalists(
  playoffResults: PlayoffResultMap,
  matches: MatchResultState[],
): void {
  const finalMatch = matches.find((m) => m.def.id === "wc-104");
  const finalResult = playoffResults["wc-104"];
  if (!finalResult?.winner || !finalMatch) {
    TOURNAMENT_RESULTS.medalistsResult = null;
    return;
  }
  const gold = finalResult.winner;
  const silver =
    finalResult.winner === finalMatch.def.homeTeam
      ? finalMatch.def.awayTeam
      : finalMatch.def.homeTeam;
  const bronzeMatch = playoffResults["wc-103"];
  const bronze = bronzeMatch?.winner ?? "";
  TOURNAMENT_RESULTS.medalistsResult = { gold, silver, bronze };
}
