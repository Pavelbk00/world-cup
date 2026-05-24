import type { PlayerState, PlayerPrediction } from "../types";
import { DEFAULT_MATCHES } from "../matches";
import { parsePlayersFile, PLAYER_SLOTS } from "../parsePlayerJson";
import { emptyPlayers, newPlayerId } from "./persistence";
import { storeHandle, loadHandle, removeHandle } from "./db";

const HANDLE_KEY = "predictions-folder";
const FILE_PREFIX = "predictions-";

function playerNameSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-zа-яё0-9-]/gi, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export interface ExportShape {
  player: string;
  predictions: PlayerPrediction[];
  groupStandings: PlayerState["groupStandings"];
  topScorer: PlayerState["topScorer"];
  medalists: PlayerState["medalists"];
}

function buildExport(player: PlayerState): ExportShape | null {
  const name = player.name.trim();
  if (!name) return null;
  const predictions: PlayerPrediction[] = [];
  for (const [matchId, score] of player.predictions) {
    const def = DEFAULT_MATCHES.find((m) => m.id === matchId);
    predictions.push({
      matchId,
      groupName: def?.phase,
      matchDateTime: def ? `${def.date} ${def.time}` : undefined,
      matchText: def ? `${def.homeTeam} - ${def.awayTeam}` : undefined,
      home: score.home,
      away: score.away,
    });
  }
  predictions.sort((a, b) => (a.matchId ?? "").localeCompare(b.matchId ?? ""));

  return {
    player: name,
    predictions,
    groupStandings: player.groupStandings,
    topScorer: player.topScorer,
    medalists: player.medalists,
  };
}

// ── Folder selection ──

export async function selectExportFolder(): Promise<boolean> {
  try {
    const handle = await window.showDirectoryPicker({ mode: "readwrite" });
    await storeHandle(HANDLE_KEY, handle);
    return true;
  } catch {
    return false;
  }
}

export async function clearExportFolder(): Promise<void> {
  await removeHandle(HANDLE_KEY);
}

export function isExportSupported(): boolean {
  return "showDirectoryPicker" in window;
}

export async function hasExportFolder(): Promise<boolean> {
  const handle = await loadHandle(HANDLE_KEY);
  return handle !== null;
}

// ── Read / Write  ──

export async function loadPlayerFile(name: string): Promise<PlayerState | null> {
  const handle = await loadHandle(HANDLE_KEY);
  if (!handle) return null;
  const slug = playerNameSlug(name);
  if (!slug) return null;
  const fileName = `${FILE_PREFIX}${slug}.json`;

  try {
    const fileHandle = await handle.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    const text = await file.text();
    const data = JSON.parse(text) as ExportShape;
    const { players: parsed } = parsePlayersFile(text, new Set(DEFAULT_MATCHES.map(m => m.id)));
    if (parsed.length === 1) {
      return { ...parsed[0], id: newPlayerId(), parseError: null };
    }
    // fallback: build from data
    const predsMap = new Map<string, PlayerPrediction>();
    for (const p of data.predictions) {
      const prediction: PlayerPrediction = { home: p.home, away: p.away };
      if (p.winner) prediction.winner = p.winner;
      if (p.method) prediction.method = p.method;
      if (p.matchId) predsMap.set(p.matchId, prediction);
    }
    return {
      id: newPlayerId(),
      name: data.player,
      predictions: predsMap,
      groupStandings: data.groupStandings ?? [],
      topScorer: data.topScorer ?? null,
      medalists: data.medalists ?? null,
      rawJson: text,
      parseError: null,
    };
  } catch {
    return null;
  }
}

export async function loadAllPlayers(): Promise<PlayerState[]> {
  const handle = await loadHandle(HANDLE_KEY);
  if (!handle) return emptyPlayers();
  const result: PlayerState[] = [];

  try {
    const entries = handle.values();
    for await (const entry of entries) {
      if (entry.kind !== "file") continue;
      if (!entry.name.startsWith(FILE_PREFIX) || !entry.name.endsWith(".json")) continue;
      try {
        const fileHandle = await handle.getFileHandle(entry.name);
        const file = await fileHandle.getFile();
        const text = await file.text();
        const { players: parsed } = parsePlayersFile(text, new Set(DEFAULT_MATCHES.map(m => m.id)));
        if (parsed.length === 1) {
          result.push({ ...parsed[0], id: newPlayerId(), parseError: null });
        } else {
          const data = JSON.parse(text) as ExportShape;
    const predsMap = new Map<string, PlayerPrediction>();
    for (const p of data.predictions) {
      const prediction: PlayerPrediction = { home: p.home, away: p.away };
      if (p.winner) prediction.winner = p.winner;
      if (p.method) prediction.method = p.method;
      if (p.matchId) predsMap.set(p.matchId, prediction);
    }
    result.push({
      id: newPlayerId(),
      name: data.player,
      predictions: predsMap,
      groupStandings: data.groupStandings ?? [],
      topScorer: data.topScorer ?? null,
      medalists: data.medalists ?? null,
      rawJson: text,
      parseError: null,
    });
        }
      } catch {
        // skip broken files
      }
    }
  } catch {
    // fallback
  }

  // Fill up to PLAYER_SLOTS
  while (result.length < PLAYER_SLOTS) {
    result.push(emptyPlayers()[result.length]);
  }
  return result;
}

export async function savePlayer(player: PlayerState): Promise<boolean> {
  const data = buildExport(player);
  if (!data) return false;

  const handle = await loadHandle(HANDLE_KEY);
  if (!handle) return false;

  const fileName = `${FILE_PREFIX}${playerNameSlug(player.name)}.json`;

  try {
    const fileHandle = await handle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();
    return true;
  } catch {
    return false;
  }
}