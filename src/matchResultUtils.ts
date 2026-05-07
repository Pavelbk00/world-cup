import type { MatchResultState, Score } from "./types";

export function parseScoreInputs(homeInput: string, awayInput: string): Score | null {
  const h = homeInput.trim();
  const a = awayInput.trim();
  if (h === "" || a === "") return null;
  const home = Number(h);
  const away = Number(a);
  if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0) return null;
  return { home, away };
}

export function resultFromState(m: MatchResultState): Score | null {
  return parseScoreInputs(m.homeInput, m.awayInput);
}
