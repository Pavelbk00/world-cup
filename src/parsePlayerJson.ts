import type {
  GroupStandingPrediction,
  MatchDef,
  MatchId,
  MedalistsPrediction,
  PlayerJson,
  PlayerPrediction,
  PlayerState,
  PlayoffWinMethod,
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
): Pick<PlayerState, "name" | "predictions" | "groupStandings" | "topScorer" | "medalists"> {
  if (!isRecord(data)) {
    throw new Error("Корень должен быть объектом");
  }
  const name = str(data.player, "player");
  const predsRaw = data.predictions;
  const predictions = new Map<MatchId, PlayerPrediction>();

  // Поддержка двух форматов: хэш-таблица (новый) и массив (старый)
  if (isRecord(predsRaw)) {
    for (const [matchId, val] of Object.entries(predsRaw)) {
      const base = `predictions.${matchId}`;
      if (!validIds.has(matchId)) {
        throw new Error(`${base}: неизвестный id «${matchId}»`);
      }
      if (!isRecord(val)) {
        throw new Error(`${base}: объект прогноза`);
      }
      const pred: PlayerPrediction = {
        home: num(val.home, `${base}.home`),
        away: num(val.away, `${base}.away`),
      };
      if (typeof val.winner === "string" && val.winner.trim()) {
        pred.winner = val.winner.trim();
      }
      if (typeof val.method === "string" && (val.method === "regular" || val.method === "extraTime" || val.method === "penalties")) {
        pred.method = val.method;
      }
      predictions.set(matchId, pred);
    }
  } else if (Array.isArray(predsRaw)) {
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
      const pred: PlayerPrediction = {
        home: num(p.home, `${base}.home`),
        away: num(p.away, `${base}.away`),
      };
      if (typeof p.winner === "string" && p.winner.trim()) {
        pred.winner = p.winner.trim();
      }
      if (typeof p.method === "string" && (p.method === "regular" || p.method === "extraTime" || p.method === "penalties")) {
        pred.method = p.method;
      }
      predictions.set(matchId, pred);
    }
  } else {
    throw new Error("predictions должен быть объектом (хэш-таблицей) или массивом");
  }

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

  return { name, predictions, groupStandings, topScorer, medalists };
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
    "name" | "predictions" | "groupStandings" | "topScorer" | "medalists" | "rawJson"
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
    "name" | "predictions" | "groupStandings" | "topScorer" | "medalists" | "rawJson"
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

export function draftFromPredictionsMap(
  matches: MatchDef[],
  predictions: Map<MatchId, PlayerPrediction>,
): Record<MatchId, { h: string; a: string; winner?: string; method?: PlayoffWinMethod }> {
  const r: Record<MatchId, { h: string; a: string; winner?: string; method?: PlayoffWinMethod }> = {};
  for (const m of matches) {
    const s = predictions.get(m.id);
    r[m.id] = {
      h: s !== undefined ? String(s.home) : "",
      a: s !== undefined ? String(s.away) : "",
      winner: s?.winner,
      method: s?.method,
    };
  }
  return r;
}

/** Только полностью заполненные строки — в JSON (хэш-таблица matchId → счёт) */
export function predictionsMapFromDraft(
  matches: MatchDef[],
  draft: Record<MatchId, { h: string; a: string; winner?: string; method?: PlayoffWinMethod }>,
): Record<MatchId, PlayerPrediction> {
  const out: Record<MatchId, PlayerPrediction> = {};
  for (const m of matches) {
    const d = draft[m.id];
    if (!d) continue;
    const home = Number.parseInt(d.h, 10);
    const away = Number.parseInt(d.a, 10);
    if (!Number.isInteger(home) || home < 0 || !Number.isInteger(away) || away < 0) {
      continue;
    }
    const pred: PlayerPrediction = { home, away };
    // Добавляем winner/method только если они указаны и счёт ничейный
    if (d.winner && d.method && home === away) {
      pred.winner = d.winner;
      pred.method = d.method;
    }
    out[m.id] = pred;
  }
  return out;
}

export function mergePlayerRawJson(
  existingRaw: string,
  name: string,
  predictionsMap: Record<MatchId, PlayerPrediction>,
): string {
  try {
    const data = JSON.parse(existingRaw) as unknown;
    if (typeof data === "object" && data !== null && !Array.isArray(data)) {
      return JSON.stringify(
        {
          ...(data as Record<string, unknown>),
          player: name,
          predictions: predictionsMap,
        },
        null,
        2,
      );
    }
  } catch {
    /* минимальный объект */
  }
  return JSON.stringify(
    { player: name, predictions: predictionsMap },
    null,
    2,
  );
}

export function playerJsonTemplate(matches: MatchDef[]): PlayerJson {
  const predictions: Record<MatchId, PlayerPrediction> = {};
  for (const match of matches) {
    predictions[match.id] = { home: 0, away: 0 };
  }
  return {
    player: "Имя игрока",
    predictions,
    groupStandings: [
      {
        group: "Группа A",
        first: "Команда 1",
        second: "Команда 2",
        third: "Команда 3",
        fourth: "Команда 4",
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