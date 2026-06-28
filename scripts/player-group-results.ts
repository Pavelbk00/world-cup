/**
 * CLI-скрипт для расчёта групповых таблиц из прогнозов игрока.
 *
 * Использование:
 *   npx tsx scripts/player-group-results.ts              # по умолчанию pavel
 *   npx tsx scripts/player-group-results.ts dolzhik
 *   npx tsx scripts/player-group-results.ts roman
 *
 * Читает data/{login}.json (прогнозы) + data/matches.json (команды/группы),
 * формирует турнирные таблицы и сохраняет в data/{login}-group-result.json
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const MATCHES_PATH = path.join(DATA_DIR, "matches.json");

interface MatchInfo {
  id: string;
  homeTeam: string;
  awayTeam: string;
  phase: string;
  isPlaceholder?: boolean;
}

interface Prediction {
  home: number;
  away: number;
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
  group_points: number;
}

interface ThirdPlaceRow extends TableRow {
  group: string;
}

type GroupMatch = {
  home: string;
  away: string;
  hs: number;
  as: number;
};

/** Вычисляет очки, РМ и забитые для команды в личных встречах против opponent */
function h2h(
  team: string,
  opponent: string,
  matches: GroupMatch[],
): { points: number; gd: number; gf: number } {
  let points = 0,
    gf = 0,
    ga = 0;
  for (const m of matches) {
    if (m.home !== team || m.away !== opponent) continue;
    gf += m.hs;
    ga += m.as;
    if (m.hs > m.as) points += 3;
    else if (m.hs === m.as) points += 1;
    break;
  }
  return { points, gd: gf - ga, gf };
}

function buildTables(
  groupMatches: Map<string, GroupMatch[]>,
  existingFP: Map<string, number>,
): {
  groups: Record<string, TableRow[]>;
} {
  const groups: Record<string, TableRow[]> = {};

  for (const [groupName, matches] of groupMatches.entries()) {
    const stats = new Map<
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
    >();

    for (const m of matches) {
      for (const team of [m.home, m.away]) {
        if (!stats.has(team))
          stats.set(team, {
            played: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            gf: 0,
            ga: 0,
            points: 0,
          });
      }
      const h = stats.get(m.home)!;
      const a = stats.get(m.away)!;
      h.played++;
      a.played++;
      h.gf += m.hs;
      h.ga += m.as;
      a.gf += m.as;
      a.ga += m.hs;
      if (m.hs > m.as) {
        h.wins++;
        a.losses++;
        h.points += 3;
      } else if (m.hs < m.as) {
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

    const rows: TableRow[] = Array.from(stats.entries())
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
        group_points: 0,
      }))
      // Тайбрейк: очки → РМ → забитые → личные → fair play → алфавит
      .sort((a, b) => {
        const d = b.points - a.points || b.gd - a.gd || b.gf - a.gf;
        if (d !== 0) return d;
        const h2hA = h2h(a.team, b.team, matches);
        const h2hB = h2h(b.team, a.team, matches);
        const h2hDiff =
          h2hB.points - h2hA.points || h2hB.gd - h2hA.gd || h2hB.gf - h2hA.gf;
        if (h2hDiff !== 0) return h2hDiff;
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
  return { groups: sorted };
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

function main() {
  const login = process.argv[2] || "pavel";
  const playerPath = path.join(DATA_DIR, `${login}.json`);
  const outputPath = path.join(DATA_DIR, `${login}-group-result.json`);

  if (!fs.existsSync(playerPath)) {
    console.error(`❌ Файл не найден: ${playerPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(MATCHES_PATH)) {
    console.error(`❌ Файл не найден: ${MATCHES_PATH}`);
    process.exit(1);
  }

  const playerData = JSON.parse(fs.readFileSync(playerPath, "utf-8"));
  const predictions = playerData.predictions as Record<string, Prediction>;
  const matchesAll = JSON.parse(
    fs.readFileSync(MATCHES_PATH, "utf-8"),
  ) as Record<string, MatchInfo>;

  const groupMatches = new Map<string, GroupMatch[]>();

  for (const [matchId, match] of Object.entries(matchesAll)) {
    if (match.isPlaceholder || !match.phase.startsWith("Группа")) continue;
    const pred = predictions[matchId];
    if (!pred) {
      console.log(
        `   ⚠️  Нет прогноза для ${matchId} (${match.homeTeam} vs ${match.awayTeam})`,
      );
      continue;
    }

    if (!groupMatches.has(match.phase)) groupMatches.set(match.phase, []);
    groupMatches.get(match.phase)!.push({
      home: match.homeTeam,
      away: match.awayTeam,
      hs: pred.home,
      as: pred.away,
    });
  }

  // Читаем fair_play_score и реальные места из group-results.json
  const groupResultsPath = path.join(DATA_DIR, "group-results.json");
  const existingFP = new Map<string, number>();
  const realPlacements = new Map<string, number>(); // team -> place in group
  const realQualified = new Set<string>(); // teams that qualified (top 2 + best 8 thirds)

  if (fs.existsSync(groupResultsPath)) {
    try {
      const prev = JSON.parse(fs.readFileSync(groupResultsPath, "utf-8")) as {
        groups?: Record<
          string,
          Array<{
            team: string;
            fair_play_score?: number;
            place: number;
            played?: number;
          }>
        >;
        thirdPlaceTable?: Array<{
          team: string;
          place: number;
          group: string;
          played?: number;
        }>;
      };
      for (const [rawGroup, rows] of Object.entries(prev.groups ?? {})) {
        // Нормализация ключа: 'A' → 'Группа A'
        const group = rawGroup.startsWith("Группа")
          ? rawGroup
          : `Группа ${rawGroup.trim()}`;
        for (const r of rows) {
          if (r.fair_play_score != null)
            existingFP.set(r.team, r.fair_play_score);
          // Только команды из завершённых групп (played >= 3)
          if ((r.played ?? 0) >= 3) {
            realPlacements.set(r.team, r.place);
            if (r.place <= 2) realQualified.add(r.team);
          }
        }
      }
      // Лучшие 8 третьих мест — только из завершённых групп
      const thirdPlaces = prev.thirdPlaceTable ?? [];
      for (const r of thirdPlaces.slice(0, 8)) {
        if ((r.played ?? 0) >= 3) realQualified.add(r.team);
      }
    } catch {
      /* ok */
    }
  }

  const { groups } = buildTables(groupMatches, existingFP);
  const thirdPlaceTable = buildThirdPlaceTable(groups);

  // Подсчёт очков за групповой этап:
  // +3 за выход в плей-офф: игрок предсказал квалификацию и команда реально вышла
  //   (топ-2 в группе ИЛИ 3-е место в топ-8 третьих)
  // +2 за точное место: предсказанное место совпало с реальным
  const teamPoints = new Map<string, number>();

  // Предвычисляем: какие команды игрок предсказал выйти в плей-офф
  const playerPredictedQualified = new Set<string>();
  for (const rows of Object.values(groups)) {
    for (const row of rows) {
      if (row.place <= 2) playerPredictedQualified.add(row.team);
    }
  }
  for (const tp of thirdPlaceTable) {
    if (tp.place <= 8) playerPredictedQualified.add(tp.team);
  }

  for (const [groupName, rows] of Object.entries(groups)) {
    for (const row of rows) {
      const realPlace = realPlacements.get(row.team);
      if (realPlace == null) {
        row.group_points = 0;
        continue;
      }
      let pts = 0;
      if (playerPredictedQualified.has(row.team) && realQualified.has(row.team))
        pts += 3; // выход в плей-офф
      if (row.place === realPlace) pts += 2; // точное место
      teamPoints.set(row.team, pts);
      row.group_points = pts;
    }
  }
  // Аналогично для третьих мест
  for (const row of thirdPlaceTable) {
    row.group_points = teamPoints.get(row.team) ?? 0;
  }

  // Итого очков за групповой этап
  const totalGroupStagePoints = Array.from(teamPoints.values()).reduce(
    (sum, pts) => sum + pts,
    0,
  );

  const result = {
    groups,
    thirdPlaceTable,
    qualifiedThirds: [...realQualified],
    totalGroupStagePoints,
  };
  const json = JSON.stringify(result, null, 2) + "\n";

  console.log(json);
  fs.writeFileSync(outputPath, json, "utf-8");
  console.log(`\n💾 Сохранено в ${outputPath}`);

  const totalTeams = Object.values(groups).reduce((s, r) => s + r.length, 0);
  console.log("\n" + "═".repeat(50));
  console.log(`   Игрок: ${playerData.player || login}`);
  console.log(
    `   Групп: ${Object.keys(groups).length} | Команд: ${totalTeams} | Третьих мест: ${thirdPlaceTable.length}`,
  );
  console.log(`   🏆 Итого за групповой этап: ${totalGroupStagePoints} очков`);
  console.log("═".repeat(50));
}

main();
