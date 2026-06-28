/**
 * CLI-скрипт для получения реальных турнирных таблиц группового этапа ЧМ 2026
 * из football-data.org и вывода JSON.
 *
 * Использование:
 *   npm run fetch-group-results
 *
 * Выводит JSON с турнирными таблицами по группам:
 * {
 *   "groups": {
 *     "Группа A": [
 *       { "place": 1, "team": "Мексика", "played": 3, "wins": 2,
 *         "draws": 1, "losses": 0, "gf": 5, "ga": 1, "gd": 4, "points": 7 }
 *     ]
 *   },
 *   "thirdPlaceTable": [...]
 * }
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.join(__dirname, "..", ".env");
const OUTPUT_PATH = path.join(__dirname, "..", "data", "group-results.json");
const MATCHES_PATH = path.join(__dirname, "..", "data", "matches.json");
const API_BASE = "https://api.football-data.org/v4";

const TEAM_MAP: Record<string, string[]> = {
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
for (const [ru, variants] of Object.entries(TEAM_MAP)) {
  for (const en of variants) EN_TO_RU.set(en.toLowerCase(), ru);
}
const toRu = (name: string) => EN_TO_RU.get(name.toLowerCase());

interface ApiMatch {
  id: number;
  status: string;
  stage: string;
  group?: string;
  homeTeam: { name: string };
  awayTeam: { name: string };
  score: { fullTime: { home: number | null; away: number | null } };
}

interface TableRow {
  place: number;
  team: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
  fair_play_score: number;
}

interface ThirdPlaceRow extends TableRow {
  group: string;
}

async function fetchMatches(apiKey: string): Promise<ApiMatch[]> {
  const all: ApiMatch[] = [];
  let page = 0;
  while (true) {
    const url = `${API_BASE}/competitions/WC/matches?season=2026&status=FINISHED&stage=GROUP_STAGE&page=${page}`;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, { headers: { "X-Auth-Token": apiKey } });
        if (res.status === 429) {
          await new Promise((r) => setTimeout(r, 2 ** attempt * 2000));
          continue;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
        const data = (await res.json()) as {
          resultSet?: { count: number };
          matches?: ApiMatch[];
        };
        const matches = data.matches ?? [];
        all.push(...matches);
        if (all.length >= (data.resultSet?.count ?? 0) || matches.length === 0)
          return all;
        page++;
        await new Promise((r) => setTimeout(r, 300));
        break;
      } catch (err) {
        if (attempt === 2) throw err;
        await new Promise((r) => setTimeout(r, 2 ** attempt * 1000));
      }
    }
  }
}

function extractGroupLetter(raw: string): string {
  return raw.replace(/^GROUP_/, "");
}

function buildTables(
  matches: ApiMatch[],
  existingFP: Map<string, number>,
): {
  groups: Record<string, TableRow[]>;
  unrecognized: number;
} {
  const teamStats = new Map<
    string,
    Map<
      string,
      {
        played: number;
        wins: number;
        draws: number;
        losses: number;
        gf: number;
        ga: number;
        points: number;
      }
    >
  >();
  let unrecognized = 0;

  for (const m of matches) {
    if (!m.group) continue;
    const homeRu = toRu(m.homeTeam.name);
    const awayRu = toRu(m.awayTeam.name);
    if (!homeRu || !awayRu) {
      unrecognized++;
      console.log(
        `   ⚠️  Не распознана: ${m.homeTeam.name} vs ${m.awayTeam.name}`,
      );
      continue;
    }
    const letter = extractGroupLetter(m.group);
    const groupName = `Группа ${letter}`;
    if (!teamStats.has(groupName)) teamStats.set(groupName, new Map());
    const table = teamStats.get(groupName)!;
    for (const team of [homeRu, awayRu]) {
      if (!table.has(team))
        table.set(team, {
          played: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          gf: 0,
          ga: 0,
          points: 0,
        });
    }
    const h = table.get(homeRu)!;
    const a = table.get(awayRu)!;
    const hs = m.score.fullTime.home ?? 0;
    const as_ = m.score.fullTime.away ?? 0;
    h.played++;
    a.played++;
    h.gf += hs;
    h.ga += as_;
    a.gf += as_;
    a.ga += hs;
    if (hs > as_) {
      h.wins++;
      a.losses++;
      h.points += 3;
    } else if (hs < as_) {
      a.wins++;
      h.losses++;
      a.points += 3;
    } else {
      h.draws++;
      a.draws++;
      h.points++;
      a.points++;
    }
  }

  const groups: Record<string, TableRow[]> = {};
  for (const [groupName, table] of teamStats.entries()) {
    const rows: TableRow[] = Array.from(table.entries())
      .map(([team, s]) => ({
        place: 0,
        team,
        played: s.played,
        wins: s.wins,
        draws: s.draws,
        losses: s.losses,
        gf: s.gf,
        ga: s.ga,
        gd: s.gf - s.ga,
        points: s.points,
        fair_play_score: existingFP.get(team) ?? 0,
      }))
      .sort((a, b) => {
        const d = b.points - a.points || b.gd - a.gd || b.gf - a.gf;
        if (d !== 0) return d;
        return (
          a.fair_play_score - b.fair_play_score ||
          a.team.localeCompare(b.team, "ru")
        );
      });
    rows.forEach((r, i) => {
      r.place = i + 1;
    });
    groups[groupName] = rows;
  }
  const sorted: Record<string, TableRow[]> = {};
  for (const name of Object.keys(groups).sort()) sorted[name] = groups[name];
  return { groups: sorted, unrecognized };
}

function buildThirdPlaceTable(
  groups: Record<string, TableRow[]>,
): ThirdPlaceRow[] {
  const rows: ThirdPlaceRow[] = [];
  for (const [group, table] of Object.entries(groups)) {
    if (table.length >= 3) rows.push({ ...table[2], group });
  }
  rows.sort(
    (a, b) =>
      b.points - a.points ||
      b.gd - a.gd ||
      b.gf - a.gf ||
      a.team.localeCompare(b.team, "ru"),
  );
  rows.forEach((r, i) => {
    r.place = i + 1;
  });
  return rows;
}

async function main() {
  let apiKey = process.env.FOOTBALL_DATA_KEY;
  if (!apiKey) {
    try {
      const m = fs
        .readFileSync(ENV_PATH, "utf-8")
        .match(/FOOTBALL_DATA_KEY=(.+)/);
      if (m?.[1]?.trim()) apiKey = m[1].trim();
    } catch {
      /* ok */
    }
  }
  if (!apiKey) {
    console.error(
      "❌ Укажите FOOTBALL_DATA_KEY в .env или через переменную окружения\n   Получить ключ: https://www.football-data.org/client/register",
    );
    process.exit(1);
  }

  console.log("⚽ Загрузка сыгранных групповых матчей ЧМ 2026...\n");
  const apiMatches = await fetchMatches(apiKey);
  console.log(`   📡 Получено матчей: ${apiMatches.length}\n`);

  // Читаем ранее заполненные fair_play_score из group-results.json
  const existingFP = new Map<string, number>();
  if (fs.existsSync(OUTPUT_PATH)) {
    try {
      const prev = JSON.parse(fs.readFileSync(OUTPUT_PATH, "utf-8")) as {
        groups?: Record<
          string,
          Array<{ team: string; fair_play_score?: number }>
        >;
      };
      for (const rows of Object.values(prev.groups ?? {})) {
        for (const r of rows) {
          if (r.fair_play_score != null)
            existingFP.set(r.team, r.fair_play_score);
        }
      }
    } catch {
      /* ok */
    }
  }

  const { groups, unrecognized } = buildTables(apiMatches, existingFP);
  const thirdPlaceTable = buildThirdPlaceTable(groups);
  const result = { groups, thirdPlaceTable };
  const json = JSON.stringify(result, null, 2) + "\n";

  console.log(json);
  fs.writeFileSync(OUTPUT_PATH, json, "utf-8");
  console.log(`\n💾 Сохранено в ${OUTPUT_PATH}`);

  const totalTeams = Object.values(groups).reduce((s, r) => s + r.length, 0);
  console.log("\n" + "═".repeat(40));
  console.log(
    `   Групп: ${Object.keys(groups).length} | Команд: ${totalTeams} | Третьих мест: ${thirdPlaceTable.length}`,
  );
  if (unrecognized) console.log(`   ⚠️  Не распознано матчей: ${unrecognized}`);
  console.log("═".repeat(40));
}

main().catch((err) => {
  console.error("\n❌ Ошибка:", err instanceof Error ? err.message : err);
  process.exit(1);
});
