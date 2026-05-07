import type {
  GroupStandingPrediction,
  MatchDef,
  MatchId,
  MedalistsPrediction,
  PlayerJson,
  PlayerPrediction,
  PlayerState,
  PlayoffPrediction,
  PlayoffWinMethod,
  Score,
} from "./types";

const PLAYER_SLOTS = 6;

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function num(x: unknown, path: string): number {
  if (typeof x !== "number" || !Number.isFinite(x) || x < 0 || !Number.isInteger(x)) {
    throw new Error(`${path}: ожидается неотрицательное целое число`);
  }
  return x;
}

function str(x: unknown, path: string): string {
  if (typeof x !== "string" || !x.trim()) {
    throw new Error(`${path}: ожидается непустая строка`);
  }
  return x.trim();
}

/** Разбор одного объекта игрока из JSON */
export function parsePlayerObject(
  data: unknown,
  validIds: Set<MatchId>
): Pick<PlayerState, "name" | "predictions" | "groupStandings" | "playoff" | "topScorer" | "medalists"> {
  if (!isRecord(data)) {
    throw new Error("Корень должен быть объектом");
  }
  const name = str(data.player, "player");
  const predsRaw = data.predictions;
  if (!Array.isArray(predsRaw)) {
    throw new Error("predictions должен быть массивом");
  }
  const predictions = new Map<MatchId, Score>();
  for (let i = 0; i < predsRaw.length; i++) {
    const p = predsRaw[i];
    const base = `predictions[${i}]`;
    if (!isRecord(p)) {
      throw new Error(`${base}: объект прогноза`);
    }
    const matchId = str(p.matchId, `${base}.matchId`);
    if (!validIds.has(matchId)) {
      throw new Error(`${base}.matchId: неизвестный id «${matchId}»`);
    }
    predictions.set(matchId, {
      home: num(p.home, `${base}.home`),
      away: num(p.away, `${base}.away`),
    });
  }

  const parseMethod = (x: unknown, path: string): PlayoffWinMethod => {
    const value = str(x, path);
    if (value !== "regular" && value !== "extraTime" && value !== "penalties") {
      throw new Error(`${path}: допустимые значения — regular, extraTime, penalties`);
    }
    return value;
  };

  const groupStandingsRaw = data.groupStandings;
  const groupStandings: GroupStandingPrediction[] = [];
  if (groupStandingsRaw !== undefined) {
    if (!Array.isArray(groupStandingsRaw)) {
      throw new Error("groupStandings должен быть массивом");
    }
    for (let i = 0; i < groupStandingsRaw.length; i++) {
      const row = groupStandingsRaw[i];
      const base = `groupStandings[${i}]`;
      if (!isRecord(row)) throw new Error(`${base}: ожидается объект`);
      groupStandings.push({
        group: str(row.group, `${base}.group`),
        first: str(row.first, `${base}.first`),
        second: str(row.second, `${base}.second`),
        third: row.third === undefined ? undefined : str(row.third, `${base}.third`),
        fourth: row.fourth === undefined ? undefined : str(row.fourth, `${base}.fourth`),
      });
    }
  }

  const playoffRaw = data.playoff;
  const playoff: PlayoffPrediction[] = [];
  if (playoffRaw !== undefined) {
    if (!Array.isArray(playoffRaw)) {
      throw new Error("playoff должен быть массивом");
    }
    for (let i = 0; i < playoffRaw.length; i++) {
      const row = playoffRaw[i];
      const base = `playoff[${i}]`;
      if (!isRecord(row)) throw new Error(`${base}: ожидается объект`);
      const matchId = str(row.matchId, `${base}.matchId`);
      playoff.push({
        matchId,
        winner: str(row.winner, `${base}.winner`),
        method: parseMethod(row.method, `${base}.method`),
      });
    }
  }

  let medalists: MedalistsPrediction | null = null;
  if (data.medalists !== undefined) {
    if (!isRecord(data.medalists)) throw new Error("medalists: ожидается объект");
    medalists = {
      gold: str(data.medalists.gold, "medalists.gold"),
      silver: str(data.medalists.silver, "medalists.silver"),
      bronze: str(data.medalists.bronze, "medalists.bronze"),
    };
  }

  let topScorer: string | null = null;
  if (data.topScorer !== undefined) {
    topScorer = str(data.topScorer, "topScorer");
  }

  return { name, predictions, groupStandings, playoff, topScorer, medalists };
}

/**
 * Принимает:
 * - один объект PlayerJson
 * - массив из до 6 объектов PlayerJson
 */
export function parsePlayersFile(
  text: string,
  validIds: Set<MatchId>
): {
  players: Pick<
    PlayerState,
    "name" | "predictions" | "groupStandings" | "playoff" | "topScorer" | "medalists" | "rawJson"
  >[];
  error: string | null;
} {
  let data: unknown;
  try {
    data = JSON.parse(text) as unknown;
  } catch {
    return { players: [], error: "Некорректный JSON" };
  }
  const items: unknown[] = Array.isArray(data) ? data : [data];
  if (items.length > PLAYER_SLOTS) {
    return { players: [], error: `Не более ${PLAYER_SLOTS} игроков в одном файле` };
  }
  const out: Pick<
    PlayerState,
    "name" | "predictions" | "groupStandings" | "playoff" | "topScorer" | "medalists" | "rawJson"
  >[] = [];
  for (let i = 0; i < items.length; i++) {
    try {
      const parsed = parsePlayerObject(items[i], validIds);
      out.push({ ...parsed, rawJson: JSON.stringify(items[i], null, 2) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { players: [], error: `Игрок #${i + 1}: ${msg}` };
    }
  }
  return { players: out, error: null };
}

/** Черновик счёта из карты уже сохранённых прогнозов */
export function draftFromPredictionsMap(
  matches: MatchDef[],
  predictions: Map<MatchId, Score>,
): Record<MatchId, { h: string; a: string }> {
  const r: Record<MatchId, { h: string; a: string }> = {};
  for (const m of matches) {
    const s = predictions.get(m.id);
    r[m.id] = {
      h: s !== undefined ? String(s.home) : "",
      a: s !== undefined ? String(s.away) : "",
    };
  }
  return r;
}

/** Только полностью заполненные строки — в JSON и в разбор не попадут «пустые» матчи */
export function predictionsArrayFromDraft(
  matches: MatchDef[],
  draft: Record<MatchId, { h: string; a: string }>,
): PlayerPrediction[] {
  const out: PlayerPrediction[] = [];
  for (const m of matches) {
    const d = draft[m.id];
    if (!d) continue;
    const home = Number.parseInt(d.h, 10);
    const away = Number.parseInt(d.a, 10);
    if (
      !Number.isInteger(home) ||
      home < 0 ||
      !Number.isInteger(away) ||
      away < 0
    ) {
      continue;
    }
    out.push({
      matchId: m.id,
      groupName: m.phase,
      matchDateTime: `${m.date} ${m.time}`,
      matchText: `${m.homeTeam} - ${m.awayTeam}`,
      home,
      away,
    });
  }
  return out;
}

export function mergePlayerRawJson(
  existingRaw: string,
  name: string,
  predictionsArr: PlayerPrediction[],
): string {
  try {
    const data = JSON.parse(existingRaw) as unknown;
    if (typeof data === "object" && data !== null && !Array.isArray(data)) {
      return JSON.stringify(
        {
          ...(data as Record<string, unknown>),
          player: name,
          predictions: predictionsArr,
        },
        null,
        2,
      );
    }
  } catch {
    /* минимальный объект */
  }
  return JSON.stringify(
    { player: name, predictions: predictionsArr },
    null,
    2,
  );
}

export function playerJsonTemplate(matches: MatchDef[]): PlayerJson {
  return {
    player: "Имя игрока",
    predictions: matches.map((match) => ({
      matchId: match.id,
      groupName: match.phase,
      matchDateTime: `${match.date} ${match.time}`,
      matchText: `${match.homeTeam} - ${match.awayTeam}`,
      home: 0,
      away: 0,
    })),
    groupStandings: [
      {
        group: "Группа A",
        first: "Команда 1",
        second: "Команда 2",
        third: "Команда 3",
        fourth: "Команда 4",
      },
    ],
    playoff: [
      {
        matchId: "wc-001",
        winner: "Команда",
        method: "regular",
      },
    ],
    topScorer: "Футболист",
    medalists: {
      gold: "Чемпион",
      silver: "Финалист",
      bronze: "3-е место",
    },
  };
}

export { PLAYER_SLOTS };
