import { resultFromState } from "./matchResultUtils";
import {
  GOLDEN_BOOT_WINNER,
  MEDALISTS_RESULT,
  PLAYER_GOALS,
} from "./tournamentResults";
import type { PlayoffResultMap } from "./utils/api";
import type {
  MatchId,
  MatchResultState,
  PlayerScoreRow,
  PlayerState,
  Score,
} from "./types";

function outcome(s: Score): "home" | "draw" | "away" {
  if (s.home > s.away) return "home";
  if (s.home < s.away) return "away";
  return "draw";
}

function diff(s: Score): number {
  return s.home - s.away;
}

export type PointTier = 3 | 2 | 1 | 0;
const THIRD_PLACE_QUALIFIERS = 8;

/**
 * За матч очки суммируются:
 * 1 — угадан исход; +2 — угадана разница; +3 — угадан точный счёт.
 * Максимум за матч: 6 очков.
 */
export function pointsForMatch(
  actual: Score,
  pred: Score,
): { points: number; tier: PointTier } {
  const sameOutcome = outcome(pred) === outcome(actual);
  const sameDiff = diff(pred) === diff(actual);
  const exact = pred.home === actual.home && pred.away === actual.away;

  let points = 0;
  if (sameOutcome) points += 1;
  if (sameDiff) points += 2;
  if (exact) points += 3;

  // tier сохраняем для агрегированных счетчиков в таблице
  // (точный счет > разница > исход > 0)
  if (exact) return { points, tier: 3 };
  if (sameDiff) return { points, tier: 2 };
  if (sameOutcome) return { points, tier: 1 };
  return { points: 0, tier: 0 };
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function isGroupPhase(phase: string): boolean {
  return phase.trim().toLowerCase().startsWith("группа");
}

function methodBonus(method: "regular" | "extraTime" | "penalties"): number {
  if (method === "regular") return 1;
  if (method === "extraTime") return 3;
  return 5;
}

function computeGroupTopTwo(matches: MatchResultState[]): {
  allGroupsFinished: boolean;
  placementsByGroup: Map<string, string[]>;
  qualifiedTeams: Set<string>;
} {
  const tables = new Map<
    string,
    Map<string, { team: string; points: number; gd: number; gf: number }>
  >();
  let allGroupsFinished = true;

  const ensureTeam = (group: string, team: string) => {
    if (!tables.has(group)) tables.set(group, new Map());
    const groupMap = tables.get(group)!;
    if (!groupMap.has(team)) {
      groupMap.set(team, { team, points: 0, gd: 0, gf: 0 });
    }
    return groupMap.get(team)!;
  };

  for (const m of matches) {
    if (!isGroupPhase(m.def.phase)) continue;
    const home = ensureTeam(m.def.phase, m.def.homeTeam);
    const away = ensureTeam(m.def.phase, m.def.awayTeam);
    const res = resultFromState(m);
    if (!res) {
      allGroupsFinished = false;
      continue;
    }
    home.gf += res.home;
    home.gd += res.home - res.away;
    away.gf += res.away;
    away.gd += res.away - res.home;
    if (res.home > res.away) home.points += 3;
    else if (res.home < res.away) away.points += 3;
    else {
      home.points += 1;
      away.points += 1;
    }
  }

  const placementsByGroup = new Map<string, string[]>();
  const thirdPlaceRows: Array<{
    team: string;
    points: number;
    gd: number;
    gf: number;
  }> = [];
  const qualifiedTeams = new Set<string>();
  for (const [group, rowsMap] of tables.entries()) {
    const rows = Array.from(rowsMap.values());
    rows.sort(
      (a, b) =>
        b.points - a.points ||
        b.gd - a.gd ||
        b.gf - a.gf ||
        a.team.localeCompare(b.team, "ru"),
    );
    if (rows.length >= 1) {
      placementsByGroup.set(
        group,
        rows.map((x) => x.team),
      );
    }
    if (rows.length >= 2) {
      qualifiedTeams.add(normalizeName(rows[0].team));
      qualifiedTeams.add(normalizeName(rows[1].team));
    }
    if (rows.length >= 3) {
      thirdPlaceRows.push(rows[2]);
    }
  }

  thirdPlaceRows.sort(
    (a, b) =>
      b.points - a.points ||
      b.gd - a.gd ||
      b.gf - a.gf ||
      a.team.localeCompare(b.team, "ru"),
  );
  for (const row of thirdPlaceRows.slice(0, THIRD_PLACE_QUALIFIERS)) {
    qualifiedTeams.add(normalizeName(row.team));
  }

  return { allGroupsFinished, placementsByGroup, qualifiedTeams };
}

function scoreGroupStage(
  player: PlayerState,
  allGroupsFinished: boolean,
  placementsByGroup: Map<string, string[]>,
  qualifiedTeams: Set<string>,
): number {
  if (!allGroupsFinished || player.groupStandings.length === 0) return 0;

  const teamPoints = new Map<string, number>();
  const addCapped = (team: string, points: number) => {
    const key = normalizeName(team);
    const prev = teamPoints.get(key) ?? 0;
    teamPoints.set(key, Math.min(5, prev + points));
  };

  for (const prediction of player.groupStandings) {
    const actualPlacement = placementsByGroup.get(prediction.group);
    if (!actualPlacement || actualPlacement.length === 0) continue;

    const predictedByPlace = [
      prediction.first,
      prediction.second,
      prediction.third,
      prediction.fourth,
    ];

    for (const team of predictedByPlace) {
      if (!team) continue;
      if (qualifiedTeams.has(normalizeName(team))) {
        addCapped(team, 3);
      }
    }

    for (let idx = 0; idx < predictedByPlace.length; idx++) {
      const predicted = predictedByPlace[idx];
      const actual = actualPlacement[idx];
      if (!predicted || !actual) continue;
      if (normalizeName(predicted) === normalizeName(actual)) {
        addCapped(predicted, 2);
      }
    }
  }

  return Array.from(teamPoints.values()).reduce((sum, x) => sum + x, 0);
}

function scorePlayoffBonus(
  player: PlayerState,
  playoffResults: PlayoffResultMap,
): number {
  if (Object.keys(playoffResults).length === 0) return 0;
  let points = 0;
  for (const [matchId, pred] of player.predictions) {
    const actual = playoffResults[matchId];
    if (!actual) continue;
    if (!pred.winner || !actual.winner || !actual.method) continue;
    if (normalizeName(pred.winner) !== normalizeName(actual.winner)) continue;
    const predMethod = pred.method ?? "regular";
    if (predMethod !== actual.method) continue;
    points += methodBonus(actual.method);
  }
  return points;
}

function scoreTopScorer(player: PlayerState): number {
  if (!player.topScorer) return 0;
  const key = player.topScorer.trim();
  if (!key) return 0;
  const goalEntry = Object.entries(PLAYER_GOALS).find(
    ([name]) => normalizeName(name) === normalizeName(key),
  );
  let points = (goalEntry?.[1] ?? 0) * 2;
  if (
    GOLDEN_BOOT_WINNER &&
    normalizeName(key) === normalizeName(GOLDEN_BOOT_WINNER)
  ) {
    points += 20;
  }
  return points;
}

function scoreMedalists(player: PlayerState): number {
  if (!player.medalists || !MEDALISTS_RESULT) return 0;
  let points = 0;
  if (
    normalizeName(player.medalists.gold) ===
    normalizeName(MEDALISTS_RESULT.gold)
  )
    points += 50;
  if (
    normalizeName(player.medalists.silver) ===
    normalizeName(MEDALISTS_RESULT.silver)
  )
    points += 35;
  if (
    normalizeName(player.medalists.bronze) ===
    normalizeName(MEDALISTS_RESULT.bronze)
  )
    points += 20;
  return points;
}

export function computeStandings(
  matches: MatchResultState[],
  players: PlayerState[],
  playoffResults: PlayoffResultMap = {},
): PlayerScoreRow[] {
  const rows: PlayerScoreRow[] = [];
  const { allGroupsFinished, placementsByGroup, qualifiedTeams } =
    computeGroupTopTwo(matches);
  for (const p of players) {
    if (p.parseError) continue;
    let t3 = 0;
    let t2 = 0;
    let t1 = 0;
    let t0 = 0;
    let total = 0;
    for (const m of matches) {
      const res = resultFromState(m);
      if (!res) continue;
      const pred = p.predictions.get(m.def.id);
      if (!pred) {
        t0 += 1;
        continue;
      }
      const { points } = pointsForMatch(res, pred);
      total += points;
      const sameOutcome = outcome(pred) === outcome(res);
      const sameDiff = diff(pred) === diff(res);
      const exact = pred.home === res.home && pred.away === res.away;
      if (sameOutcome) t1 += 1;
      if (sameDiff) t2 += 1;
      if (exact) t3 += 1;
      if (!sameOutcome && !sameDiff && !exact) t0 += 1;
    }
    const groupStagePoints = scoreGroupStage(
      p,
      allGroupsFinished,
      placementsByGroup,
      qualifiedTeams,
    );
    const playoffBonusPoints = scorePlayoffBonus(p, playoffResults);
    const topScorerPoints = scoreTopScorer(p);
    const medalistPoints = scoreMedalists(p);
    total +=
      groupStagePoints + playoffBonusPoints + topScorerPoints + medalistPoints;

    rows.push({
      playerId: p.id,
      name: p.name,
      byTier: { t3, t2, t1, t0 },
      groupStagePoints,
      playoffBonusPoints,
      topScorerPoints,
      medalistPoints,
      total,
    });
  }
  rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "ru"));
  return rows;
}

export function pointsForSingleMatch(
  matchId: MatchId,
  matches: MatchResultState[],
  pred: Score | undefined,
): { points: number; tier: PointTier } | null {
  const m = matches.find((x) => x.def.id === matchId);
  const res = m ? resultFromState(m) : null;
  if (!res || !pred) return null;
  return pointsForMatch(res, pred);
}
