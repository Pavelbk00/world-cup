/**
 * Скрипт для автоматического обновления результатов матчей ЧМ 2026.
 * Использует football-data.org (бесплатный API).
 *
 * Использование:
 *   FOOTBALL_DATA_KEY=ваш_ключ npm run fetch-results
 *
 * Получить ключ: https://www.football-data.org/client/register
 * (бесплатно, 10 запросов/мин, достаточно для 4-5 запусков в день)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const RESULTS_PATH = path.join(DATA_DIR, "results.json");
const MATCHES_PATH = path.join(DATA_DIR, "matches.json");

// ─── Конфигурация ────────────────────────────────────────────────

const API_BASE = "https://api.football-data.org/v4";
const API_KEY = "e6259ac33ebd4ecbae2fef4788e347f7";

if (!API_KEY) {
  console.error(
    '❌ Укажите FOOTBALL_DATA_KEY:\n' +
    '   FOOTBALL_DATA_KEY=ваш_ключ npm run fetch-results\n\n' +
    '   Получить бесплатный ключ: https://www.football-data.org/client/register'
  );
  process.exit(1);
}

// ─── Маппинг названий команд: русское → английские варианты из API ─

const TEAM_NAME_MAP: Record<string, string[]> = {
  "Мексика": ["Mexico"],
  "ЮАР": ["South Africa"],
  "Южная Корея": ["Korea Republic", "South Korea"],
  "Чехия": ["Czech Republic", "Czechia"],
  "Канада": ["Canada"],
  "Босния": ["Bosnia and Herzegovina", "Bosnia", "Bosnia-Herzegovina"],
  "Катар": ["Qatar"],
  "Швейцария": ["Switzerland"],
  "Бразилия": ["Brazil"],
  "Марокко": ["Morocco"],
  "Гаити": ["Haiti"],
  "Шотландия": ["Scotland"],
  "США": ["USA", "United States"],
  "Парагвай": ["Paraguay"],
  "Австралия": ["Australia"],
  "Турция": ["Turkey", "Türkiye"],
  "Нидерланды": ["Netherlands"],
  "Япония": ["Japan"],
  "Швеция": ["Sweden"],
  "Тунис": ["Tunisia"],
  "Германия": ["Germany"],
  "Кюрасао": ["Curaçao", "Curacao"],
  "Кот-д'Ивуар": ["Ivory Coast", "Cote d'Ivoire", "Côte d'Ivoire"],
  "Эквадор": ["Ecuador"],
  "Испания": ["Spain"],
  "Кабо-Верде": ["Cape Verde"],
  "Саудовская Аравия": ["Saudi Arabia"],
  "Уругвай": ["Uruguay"],
  "Бельгия": ["Belgium"],
  "Египет": ["Egypt"],
  "Иран": ["Iran"],
  "Новая Зеландия": ["New Zealand"],
  "Франция": ["France"],
  "Сенегал": ["Senegal"],
  "Ирак": ["Iraq"],
  "Норвегия": ["Norway"],
  "Аргентина": ["Argentina"],
  "Алжир": ["Algeria"],
  "Австрия": ["Austria"],
  "Иордания": ["Jordan"],
  "Англия": ["England"],
  "Хорватия": ["Croatia"],
  "Гана": ["Ghana"],
  "Панама": ["Panama"],
  "Португалия": ["Portugal"],
  "ДР Конго": ["DR Congo", "Congo DR"],
  "Узбекистан": ["Uzbekistan"],
  "Колумбия": ["Colombia"],
};

/** Обратный маппинг: английское (нижний регистр) → русское */
const EN_TO_RU = new Map<string, string>();
for (const [ru, variants] of Object.entries(TEAM_NAME_MAP)) {
  for (const en of variants) {
    EN_TO_RU.set(en.toLowerCase(), ru);
  }
}

function teamToRu(name: string): string | undefined {
  return EN_TO_RU.get(name.toLowerCase());
}

// ─── Типы API football-data.org ──────────────────────────────────

interface ApiMatch {
  id: number;
  utcDate: string;
  status: string;
  homeTeam: { name: string; shortName: string; tla: string };
  awayTeam: { name: string; shortName: string; tla: string };
  score: {
    halfTime: { home: number | null; away: number | null };
    fullTime: { home: number | null; away: number | null };
    extraTime: { home: number | null; away: number | null };
    penalties: { home: number | null; away: number | null };
  };
}

interface ApiResponse {
  resultSet?: { count: number };
  matches?: ApiMatch[];
  _links?: { self?: { href: string } };
}

/** Статусы завершённых матчей в football-data.org */
const FINISHED_STATUSES = new Set([
  "FINISHED", "AWARDED", "CANCELLED",
]);

// ─── Утилиты ─────────────────────────────────────────────────────

/** "DD.MM.YYYY" → "YYYY-MM-DD" */
function dateToISO(date: string): string {
  const [d, m, y] = date.split(".").map(Number);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

async function fetchMatches(): Promise<ApiMatch[]> {
  const allMatches: ApiMatch[] = [];
  let page = 0;

  while (true) {
    const url = `${API_BASE}/competitions/WC/matches?season=2026&status=FINISHED&page=${page}`;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, {
          headers: { "X-Auth-Token": API_KEY! },
        });

        if (res.status === 429) {
          const wait = 2 ** attempt * 2000;
          console.log(`⏳ Rate limit, ждём ${wait / 1000}с...`);
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
        console.log(`   Страница ${page + 1}: ${matches.length} матчей (всего: ${total})`);

        // Если получили все матчи или страница пуста — выходим
        if (allMatches.length >= total || matches.length === 0) {
          return allMatches;
        }

        // Следующая страница
        page++;
        await new Promise((r) => setTimeout(r, 300)); // пауза между запросами
        break;
      } catch (err) {
        if (attempt === 2) throw err;
        const wait = 2 ** attempt * 1000;
        console.log(`⚠️  Попытка ${attempt + 1} не удалась, повтор через ${wait / 1000}с...`);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
}

// ─── Основная логика ─────────────────────────────────────────────

interface LocalMatch {
  matchId: string;
  homeRu: string;
  awayRu: string;
  dateISO: string;
  time: string;
}

async function main() {
  console.log("⚽ Загрузка результатов матчей ЧМ 2026\n");
  console.log("📋 Источник: football-data.org (бесплатный API)");
  console.log("📋 Соревнование: WC (FIFA World Cup), сезон 2026\n");

  // 1. Загружаем наш каталог матчей
  const matches = JSON.parse(
    fs.readFileSync(MATCHES_PATH, "utf-8")
  ) as Record<string, {
    id: string;
    date: string;
    time: string;
    homeTeam: string;
    awayTeam: string;
    phase: string;
    isPlaceholder?: boolean;
  }>;

  // 2. Загружаем текущие результаты
  const results = JSON.parse(
    fs.readFileSync(RESULTS_PATH, "utf-8")
  ) as Record<string, { home: number | null; away: number | null }>;

  // 3. Строим индекс: "YYYY-MM-DD" → LocalMatch[]
  const localByDate = new Map<string, LocalMatch[]>();
  for (const [matchId, m] of Object.entries(matches)) {
    if (m.isPlaceholder) continue;
    const iso = dateToISO(m.date);
    if (!localByDate.has(iso)) localByDate.set(iso, []);
    localByDate.get(iso)!.push({
      matchId,
      homeRu: m.homeTeam,
      awayRu: m.awayTeam,
      dateISO: iso,
      time: m.time,
    });
  }

  const localCount = Object.keys(matches).filter((k) => !matches[k].isPlaceholder).length;
  console.log(`📦 Локальных матчей (без плейсхолдеров): ${localCount}`);
  console.log(`📦 Уникальных дат: ${localByDate.size}\n`);

  // 4. Запрашиваем завершённые матчи из API
  console.log("📡 Запрос завершённых матчей из football-data.org...");
  const apiMatches = await fetchMatches();
  console.log(`\n✅ Получено ${apiMatches.length} завершённых матчей из API\n`);

  if (apiMatches.length === 0) {
    console.log("ℹ️  Нет завершённых матчей. Нечего обновлять.");
    return;
  }

  // 5. Сопоставляем с нашими матчами
  let matched = 0;
  let updated = 0;
  let unchanged = 0;
  let unmatched = 0;
  const unmatchedLines: string[] = [];

  for (const apiMatch of apiMatches) {
    // football-data.org возвращает дату в UTC, конвертируем в МСК (UTC+3)
    const utcDate = new Date(apiMatch.utcDate);
    const mskDate = new Date(utcDate.getTime() + 3 * 60 * 60 * 1000);
    const fixtureDateISO = mskDate.toISOString().slice(0, 10); // "YYYY-MM-DD"

    const homeRu = teamToRu(apiMatch.homeTeam.name);
    const awayRu = teamToRu(apiMatch.awayTeam.name);

    const locals = localByDate.get(fixtureDateISO) ?? [];
    let found = false;

    for (const local of locals) {
      if (local.homeRu === homeRu && local.awayRu === awayRu) {
        // Берём основное время (fullTime), для пенальти — итоговый счёт
        const newHome = apiMatch.score.fullTime.home;
        const newAway = apiMatch.score.fullTime.away;
        const prev = results[local.matchId];

        const changed =
          !prev ||
          prev.home !== newHome ||
          prev.away !== newAway;

        results[local.matchId] = { home: newHome, away: newAway };
        matched++;

        if (changed) {
          updated++;
          const prevStr = prev ? `${prev.home}:${prev.away}` : "null:null";
          const statusNote = apiMatch.status !== "FINISHED" ? ` [${apiMatch.status}]` : "";
          console.log(
            `🔄 ${local.matchId} ${local.homeRu} ${newHome}:${newAway} ${local.awayRu}` +
            `  (было ${prevStr})${statusNote}`
          );
        } else {
          unchanged++;
        }

        found = true;
        break;
      }
    }

    if (!found) {
      unmatched++;
      if (unmatchedLines.length < 15) {
        const mskTime = mskDate.toISOString().slice(11, 16);
        unmatchedLines.push(
          `  ${fixtureDateISO} ${mskTime} ${apiMatch.homeTeam.name} ${apiMatch.score.fullTime.home}:${apiMatch.score.fullTime.away} ${apiMatch.awayTeam.name}` +
          ` → ${homeRu ?? "???"} vs ${awayRu ?? "???"}`
        );
      }
    }
  }

  // 6. Лог несовпадений
  if (unmatched > 0) {
    console.log(`\n⚠️  Не сопоставлено ${unmatched} завершённых матчей из API:`);
    for (const line of unmatchedLines) {
      console.log(line);
    }
    if (unmatched > 15) {
      console.log(`  ... и ещё ${unmatched - 15}`);
    }
    console.log(
      '\n   Это нормально, если среди них матчи, которых нет в нашем каталоге ' +
      '(стыковые, плей-офф с неизвестными командами и т.д.).'
    );
  }

  // 7. Проверяем матчи без результатов, которые уже должны были закончиться
  const now = new Date();
  let missing = 0;
  for (const [matchId, m] of Object.entries(matches)) {
    if (m.isPlaceholder) continue;
    const r = results[matchId];
    if (!r || (r.home === null && r.away === null)) {
      const [d, mo, y] = m.date.split(".").map(Number);
      const [h, mi] = m.time.split(":").map(Number);
      const matchEnd = new Date(y, mo - 1, d, h, mi + 120); // +2 часа
      if (now.getTime() > matchEnd.getTime()) {
        console.log(`❌ Нет результата: ${matchId} ${m.homeTeam} vs ${m.awayTeam} (${m.date} ${m.time})`);
        missing++;
      }
    }
  }

  // 8. Записываем
  fs.writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2) + "\n", "utf-8");

  // 9. Итоги
  console.log("\n" + "═".repeat(50));
  console.log("📊 ИТОГО:");
  console.log(`   ✅ Сопоставлено:     ${matched}`);
  console.log(`   🔄 Обновлено:        ${updated}`);
  console.log(`   ✔️  Без изменений:    ${unchanged}`);
  console.log(`   ⚠️  Не сопоставлено:  ${unmatched}`);
  if (missing > 0) {
    console.log(`   ❌ Пропущено:        ${missing}`);
  }
  console.log(`\n💾 Сохранено в: ${RESULTS_PATH}`);
  console.log("   (сервер подхватит изменения автоматически в течение 5 сек)");
  console.log("═".repeat(50));
}

main().catch((err) => {
  console.error("\n❌ Ошибка:", err instanceof Error ? err.message : err);
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});