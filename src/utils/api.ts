import type { PlayerState, PlayerPrediction } from "../types";
import { DEFAULT_MATCHES } from "../matches";
import { newPlayerId, emptyPlayers, PLAYER_SLOTS } from "./persistence";

const API_BASE = "/api";

export interface ExportShape {
  login: string;
  player: string;
  predictions: PlayerPrediction[];
  groupStandings: PlayerState["groupStandings"];
  topScorer: PlayerState["topScorer"];
  medalists: PlayerState["medalists"];
  /** Дата и время последнего обновления прогнозов (ISO 8601) */
  updated_at?: string;
}

function buildExport(player: PlayerState, login: string): ExportShape {
  const name = player.name.trim();
  const predictions: PlayerPrediction[] = [];
  for (const [matchId, score] of player.predictions) {
    const def = DEFAULT_MATCHES.find((m) => m.id === matchId);
    const pred: PlayerPrediction = {
      matchId,
      groupName: def?.phase,
      matchDateTime: def ? `${def.date} ${def.time}` : undefined,
      matchText: def ? `${def.homeTeam} - ${def.awayTeam}` : undefined,
      home: score.home,
      away: score.away,
    };
    if (score.winner) pred.winner = score.winner;
    if (score.method) pred.method = score.method;
    predictions.push(pred);
  }
  predictions.sort((a, b) => (a.matchId ?? "").localeCompare(b.matchId ?? ""));

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
  for (const p of data.predictions) {
    const prediction: PlayerPrediction = {
      home: p.home,
      away: p.away,
    };
    if (p.winner) prediction.winner = p.winner;
    if (p.method) prediction.method = p.method;
    if (p.matchId) predsMap.set(p.matchId, prediction);
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
    const res = await fetch(`${API_BASE}/players/${encodeURIComponent(login)}`);
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
    const res = await fetch(`${API_BASE}/players`);
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

/** Save (create or overwrite) a player's predictions on the server. */
export async function savePlayer(player: PlayerState, login: string): Promise<boolean> {
  const data = buildExport(player, login);

  try {
    const res = await fetch(`${API_BASE}/players/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface MatchResultJson {
  matchId: string;
  home: number;
  away: number;
}

/** Load match results from the server (data/results.json). */
export async function loadMatchResults(): Promise<MatchResultJson[]> {
  try {
    const res = await fetch(`${API_BASE}/results`);
    if (!res.ok) return [];
    return (await res.json()) as MatchResultJson[];
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