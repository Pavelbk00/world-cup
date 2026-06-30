/**
 * Общий модуль для запроса результатов матчей ЧМ 2026 из football-data.org.
 * Используется и сервером (автозапуск), и CLI-скриптом.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const RESULTS_PATH = path.join(DATA_DIR, "results.json");
const MATCHES_PATH = path.join(DATA_DIR, "matches.json");
const OVERRIDES_PATH = path.join(DATA_DIR, "overrides.json");
const PLAYOFF_RESULTS_PATH = path.join(DATA_DIR, "playoff-results.json");
const PLAYOFF_OVERRIDES_PATH = path.join(DATA_DIR, "playoff-overrides.json");

const API_BASE = "https://api.football-data.org/v4";

// ─── Маппинг названий команд: русское → английские варианты из API ─

const TEAM_NAME_MAP: Record<string, string[]> = {
  Мексика: ["Mexico"],
  ЮАР: ["South Africa"],
  "Южная Корея": ["Korea Republic", "South Korea"],
  Чехия: ["Czech Republic", "Czechia"],
  Канада: ["Canada"],
  Босния: ["Bosnia and Herzegovina", "Bosnia", "Bosnia-Herzegovina"],
  Катар: ["Qatar"],
  Швейцария: ["Switzerland"],
  Бразилия: ["Brazil"],
  Марокко: ["Morocco"],
  Гаити: ["Haiti"],
  Шотландия: ["Scotland"],
  США: ["USA", "United States"],
  Парагвай: ["Paraguay"],
  Австралия: ["Australia"],
  Турция: ["Turkey", "Türkiye"],
  Нидерланды: ["Netherlands"],
  Япония: ["Japan"],
  Швеция: ["Sweden"],
  Тунис: ["Tunisia"],
  Германия: ["Germany"],
  Кюрасао: ["Curaçao", "Curacao"],
  "Кот-д'Ивуар": ["Ivory Coast", "Cote d'Ivoire", "Côte d'Ivoire"],
  Эквадор: ["Ecuador"],
  Испания: ["Spain"],
  "Кабо-Верде": ["Cape Verde", "Cape Verde Islands"],
  "Саудовская Аравия": ["Saudi Arabia"],
  Уругвай: ["Uruguay"],
  Бельгия: ["Belgium"],
  Египет: ["Egypt"],
  Иран: ["Iran"],
  "Новая Зеландия": ["New Zealand"],
  Франция: ["France"],
  Сенегал: ["Senegal"],
  Ирак: ["Iraq"],
  Норвегия: ["Norway"],
  Аргентина: ["Argentina"],
  Алжир: ["Algeria"],
  Австрия: ["Austria"],
  Иордания: ["Jordan"],
  Англия: ["England"],
  Хорватия: ["Croatia"],
  Гана: ["Ghana"],
  Панама: ["Panama"],
  Португалия: ["Portugal"],
  "ДР Конго": ["DR Congo", "Congo DR"],
  Узбекистан: ["Uzbekistan"],
  Колумбия: ["Colombia"],
};

const EN_TO_RU = new Map<string, string>();
for (const [ru, variants] of Object.entries(TEAM_NAME_MAP)) {
  for (const en of variants) {
    EN_TO_RU.set(en.toLowerCase(), ru);
  }
}

function teamToRu(name: string): string | undefined {
  return EN_TO_RU.get(name.toLowerCase());
}

// ─── Типы API ────────────────────────────────────────────────────

interface ApiMatch {
  id: number;
  utcDate: string;
  status: string;
  homeTeam: { name: string; shortName: string; tla: string };
  awayTeam: { name: string; shortName: string; tla: string };
  score: {
    halfTime: { home: number | null; away: number | null };
    fullTime: { home: number | null; away: number | null };
    regularTime?: { home: number | null; away: number | null };
    extraTime: { home: number | null; away: number | null };
    penalties: { home: number | null; away: number | null };
  };
}

interface ApiResponse {
  resultSet?: { count: number };
  matches?: ApiMatch[];
}

// ─── Утилиты ─────────────────────────────────────────────────────

function dateToISO(date: string): string {
  const [d, m, y] = date.split(".").map(Number);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

async function fetchMatchesFromApi(apiKey: string): Promise<ApiMatch[]> {
  const allMatches: ApiMatch[] = [];
  let page = 0;

  while (true) {
    const url = `${API_BASE}/competitions/WC/matches?season=2026&status=FINISHED&page=${page}`;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, {
          headers: { "X-Auth-Token": apiKey },
        });

        if (res.status === 429) {
          const wait = 2 ** attempt * 2000;
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }

        if (!res.ok) {
          const body = await res.text();
          throw new Error(`HTTP ${res.status}: ${body}`);
        }

        const data = (await res.json()) as ApiResponse;
        const matches = data.matches ?? [];
        allMatches.push(...matches);

        const total = data.resultSet?.count ?? 0;
        if (allMatches.length >= total || matches.length === 0) {
          return allMatches;
        }

        page++;
        await new Promise((r) => setTimeout(r, 300));
        break;
      } catch (err) {
        if (attempt === 2) throw err;
        const wait = 2 ** attempt * 1000;
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
}

function isPlayoffPhase(phase: string): boolean {
  return !phase.trim().toLowerCase().startsWith("группа");
}

function determinePlayoffResult(
  apiMatch: ApiMatch,
  homeRu: string,
  awayRu: string,
): { winner: string; method: "regular" | "extraTime" | "penalties" } | null {
  const reg = apiMatch.score.regularTime ?? apiMatch.score.fullTime;
  if (reg.home === null || reg.away === null) return null;

  if (reg.home > reg.away) return { winner: homeRu, method: "regular" };
  if (reg.away > reg.home) return { winner: awayRu, method: "regular" };

  const et = apiMatch.score.extraTime;
  if (et.home !== null && et.away !== null) {
    if (et.home > et.away) return { winner: homeRu, method: "extraTime" };
    if (et.away > et.home) return { winner: awayRu, method: "extraTime" };
  }

  const pen = apiMatch.score.penalties;
  if (pen.home !== null && pen.away !== null) {
    if (pen.home > pen.away) return { winner: homeRu, method: "penalties" };
    if (pen.away > pen.home) return { winner: awayRu, method: "penalties" };
  }

  return null;
}

// ─── Публичный API ───────────────────────────────────────────────

export interface FetchResult {
  matched: number;
  updated: number;
  unchanged: number;
  unmatched: number;
  playoffUpdated: boolean;
  updatedMatches: Array<{
    matchId: string;
    home: string;
    homeScore: number | null;
    awayScore: number | null;
    away: string;
    prevHome: number | null;
    prevAway: number | null;
  }>;
}

/**
 * Запрашивает завершённые матчи из API и обновляет data/results.json
 * и data/playoff-results.json.
 */
export async function fetchAndSaveResults(
  apiKey: string,
): Promise<FetchResult> {
  const result: FetchResult = {
    matched: 0,
    updated: 0,
    unchanged: 0,
    unmatched: 0,
    playoffUpdated: false,
    updatedMatches: [],
  };

  const matches = JSON.parse(fs.readFileSync(MATCHES_PATH, "utf-8")) as Record<
    string,
    {
      id: string;
      date: string;
      time: string;
      homeTeam: string;
      awayTeam: string;
      phase: string;
      isPlaceholder?: boolean;
    }
  >;

  const results = JSON.parse(fs.readFileSync(RESULTS_PATH, "utf-8")) as Record<
    string,
    { home: number | null; away: number | null }
  >;

  const playoffResults: Record<string, { winner: string; method: string }> = {};

  const localByDate = new Map<
    string,
    Array<{
      matchId: string;
      homeRu: string;
      awayRu: string;
    }>
  >();

  for (const [matchId, m] of Object.entries(matches)) {
    if (m.isPlaceholder) continue;
    const iso = dateToISO(m.date);
    if (!localByDate.has(iso)) localByDate.set(iso, []);
    localByDate
      .get(iso)!
      .push({ matchId, homeRu: m.homeTeam, awayRu: m.awayTeam });
  }

  const apiMatches = await fetchMatchesFromApi(apiKey);

  for (const apiMatch of apiMatches) {
    const utcDate = new Date(apiMatch.utcDate);
    const mskDate = new Date(utcDate.getTime() + 3 * 60 * 60 * 1000);
    const fixtureDateISO = mskDate.toISOString().slice(0, 10);

    const homeRu = teamToRu(apiMatch.homeTeam.name);
    const awayRu = teamToRu(apiMatch.awayTeam.name);

    const locals = localByDate.get(fixtureDateISO) ?? [];
    let found = false;

    for (const local of locals) {
      if (local.homeRu === homeRu && local.awayRu === awayRu) {
        const reg = apiMatch.score.regularTime ?? apiMatch.score.fullTime;
        const newHome = reg.home;
        const newAway = reg.away;
        const prev = results[local.matchId];

        const changed = !prev || prev.home !== newHome || prev.away !== newAway;

        results[local.matchId] = { home: newHome, away: newAway };

        const matchDef = matches[local.matchId];
        if (matchDef && isPlayoffPhase(matchDef.phase) && homeRu && awayRu) {
          const po = determinePlayoffResult(apiMatch, homeRu, awayRu);
          if (po) playoffResults[local.matchId] = po;
        }

        result.matched++;

        if (changed) {
          result.updated++;
          result.updatedMatches.push({
            matchId: local.matchId,
            home: local.homeRu,
            homeScore: newHome,
            awayScore: newAway,
            away: local.awayRu,
            prevHome: prev?.home ?? null,
            prevAway: prev?.away ?? null,
          });
        } else {
          result.unchanged++;
        }

        found = true;
        break;
      }
    }

    if (!found) result.unmatched++;
  }

  let overrides: Record<string, { home: number; away: number }> = {};
  try {
    overrides = JSON.parse(fs.readFileSync(OVERRIDES_PATH, "utf-8"));
  } catch {
    // файла нет или пустой — игнорируем
  }

  let overridesApplied = false;
  for (const [matchId, score] of Object.entries(overrides)) {
    if (results[matchId]) {
      const prev = results[matchId];
      if (prev.home !== score.home || prev.away !== score.away) {
        results[matchId] = { home: score.home, away: score.away };
        overridesApplied = true;
      }
    }
  }

  let existingPlayoff: Record<string, { winner: string; method: string }> = {};
  try {
    existingPlayoff = JSON.parse(
      fs.readFileSync(PLAYOFF_RESULTS_PATH, "utf-8"),
    );
  } catch {
    /* ok */
  }

  let playoffOverrides: Record<string, { winner: string; method: string }> = {};
  try {
    playoffOverrides = JSON.parse(
      fs.readFileSync(PLAYOFF_OVERRIDES_PATH, "utf-8"),
    );
  } catch {
    /* ok */
  }

  let playoffChanged = false;
  for (const [id, po] of Object.entries({
    ...playoffResults,
    ...playoffOverrides,
  })) {
    if (
      !existingPlayoff[id] ||
      existingPlayoff[id].winner !== po.winner ||
      existingPlayoff[id].method !== po.method
    ) {
      existingPlayoff[id] = po;
      playoffChanged = true;
    }
  }

  if (result.updated > 0 || overridesApplied) {
    fs.writeFileSync(
      RESULTS_PATH,
      JSON.stringify(results, null, 2) + "\n",
      "utf-8",
    );
  }

  if (playoffChanged) {
    fs.writeFileSync(
      PLAYOFF_RESULTS_PATH,
      JSON.stringify(existingPlayoff, null, 2) + "\n",
      "utf-8",
    );
    console.log(
      `🏆 Обновлены результаты плей-офф: ${Object.keys(existingPlayoff).length}`,
    );
  }

  result.playoffUpdated = playoffChanged;

  return result;
}
