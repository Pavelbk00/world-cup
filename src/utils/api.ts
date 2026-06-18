import type { MatchId, PlayerState, PlayerPrediction } from "../types";
import { newPlayerId, emptyPlayers, PLAYER_SLOTS } from "./persistence";
import { getCurrentUser } from "../auth";

const API_BASE = "/api";

/** Возвращает заголовки с логином текущего пользователя (если авторизован) */
function authHeaders(): Record<string, string> {
  const user = getCurrentUser();
  if (user?.login) {
    return { "X-User-Login": user.login };
  }
  return {};
}

export interface ExportShape {
  login: string;
  player: string;
  predictions: Record<MatchId, PlayerPrediction>;
  groupStandings: PlayerState["groupStandings"];
  topScorer: PlayerState["topScorer"];
  medalists: PlayerState["medalists"];
  /** Дата и время последнего обновления прогнозов (ISO 8601) */
}

function buildExport(player: PlayerState, login: string): ExportShape {
  const name = player.name.trim();
  const predictions: Record<MatchId, PlayerPrediction> = {};
  for (const [matchId, score] of player.predictions) {
    const pred: PlayerPrediction = { home: score.home, away: score.away };
    if (score.winner) pred.winner = score.winner;
    if (score.method) pred.method = score.method;
    predictions[matchId] = pred;
  }

  return {
    login,
    player: name,
    predictions,
    groupStandings: player.groupStandings,
    topScorer: player.topScorer,
    medalists: player.medalists,
  };
}

function exportShapeToPlayerState(data: ExportShape): PlayerState {
  const predsMap = new Map<string, PlayerPrediction>();
  if (data.predictions && typeof data.predictions === "object") {
    // Новый формат: хэш-таблица
    for (const [matchId, pred] of Object.entries(data.predictions)) {
      if (typeof pred === "object" && pred !== null) {
        const p: PlayerPrediction = { home: pred.home, away: pred.away };
        if (pred.winner) p.winner = pred.winner;
        if (pred.method) p.method = pred.method;
        predsMap.set(matchId, p);
      }
    }
  }
  return {
    id: newPlayerId(),
    login: data.login,
    name: data.player,
    predictions: predsMap,
    groupStandings: data.groupStandings ?? [],
    topScorer: data.topScorer ?? null,
    medalists: data.medalists ?? null,
    rawJson: "",
    parseError: null,
  };
}

/** Load a single player by login. */
export async function loadPlayerFile(login: string): Promise<PlayerState | null> {
  try {
    const res = await fetch(`${API_BASE}/players/${encodeURIComponent(login)}`, {
      headers: authHeaders(),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as ExportShape;
    return exportShapeToPlayerState(data);
  } catch {
    return null;
  }
}

/** Load all saved players from the server. */
export async function loadAllPlayers(): Promise<PlayerState[]> {
  try {
    const res = await fetch(`${API_BASE}/players`, {
      headers: authHeaders(),
    });
    if (!res.ok) return emptyPlayers();
    const list = (await res.json()) as ExportShape[];
    const players = list.map(exportShapeToPlayerState);
    // Fill up to PLAYER_SLOTS
    while (players.length < PLAYER_SLOTS) {
      players.push(emptyPlayers()[players.length]);
    }
    return players;
  } catch {
    return emptyPlayers();
  }
}

/** Save (create or overwrite) a player's predictions on the server.
 *  Возвращает реально сохранённые данные с сервера (прогнозы на начавшиеся
 *  матчи могут быть заменены сервером на существующие). */
export async function savePlayer(player: PlayerState, login: string): Promise<PlayerState | null> {
  const data = buildExport(player, login);

  try {
    const res = await fetch(`${API_BASE}/players/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      console.error("[API] savePlayer failed:", res.status, await res.text().catch(() => ""));
      return null;
    }
    const json = (await res.json()) as { ok: boolean; data?: ExportShape };
    if (json.ok && json.data) {
      return exportShapeToPlayerState(json.data);
    }
    // Фоллбэк: сервер вернул ok без data (старый формат) — используем отправленные данные
    return {
      ...player,
      predictions: new Map(player.predictions),
    };
  } catch (err) {
    console.error("[API] savePlayer network error:", err);
    return null;
  }
}

export interface MatchResultMap {
  [matchId: string]: { home: number | null; away: number | null };
}

/** Load match results from the server (data/results.json) as hash map. */
export async function loadMatchResults(): Promise<MatchResultMap> {
  try {
    const res = await fetch(`${API_BASE}/results`);
    if (!res.ok) return {};
    return (await res.json()) as MatchResultMap;
  } catch {
    return {};
  }
}

export interface PointsHistoryEntry {
  player: string;
  login: string;
  predHome: number;
  predAway: number;
  points: number;
}

export interface PointsHistoryRow {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  date: string;
  time: string;
  phase: string;
  actualHome: number;
  actualAway: number;
  entries: PointsHistoryEntry[];
}

/** Load points history from the server. */
export async function loadPointsHistory(includeZero = false): Promise<PointsHistoryRow[]> {
  try {
    const url = includeZero ? `${API_BASE}/points-history?includeZero=1` : `${API_BASE}/points-history`;
    const res = await fetch(url);
    if (!res.ok) return [];
    return (await res.json()) as PointsHistoryRow[];
  } catch {
    return [];
  }
}

/** Check if the server is reachable. */
export async function isServerReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/players`, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}