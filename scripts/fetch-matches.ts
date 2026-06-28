/**
 * CLI-скрипт для загрузки расписания матчей ЧМ 2026 из football-data.org
 * и обновления data/matches.json.
 *
 * Использование:
 *   npm run fetch-matches
 *   FOOTBALL_DATA_KEY=ключ npm run fetch-matches
 *
 * Получить ключ: https://www.football-data.org/client/register
 *
 * Что делает:
 * - Обновляет время матчей, если оно изменилось в API
 * - Подставляет реальные команды в плей-офф матчи (вместо placeholder'ов)
 * - Сохраняет существующие ID матчей (чтобы не сломать прогнозы)
 * - Пишет файл только если есть реальные изменения
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.join(__dirname, "..", ".env");
const MATCHES_PATH = path.join(__dirname, "..", "data", "matches.json");

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

function teamToRu(name: string | null): string | undefined {
  if (!name) return undefined;
  return EN_TO_RU.get(name.toLowerCase());
}

// ─── Маппинг стадий API → русские названия ─

const GROUP_LETTERS = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
];

const STAGE_MAP: Record<string, string> = {
  GROUP_STAGE: "Группа",
  LAST_32: "1/16 финала",
  LAST_16: "1/8 финала",
  QUARTER_FINALS: "1/4 финала",
  SEMI_FINALS: "1/2 финала",
  THIRD_PLACE: "Матч за 3-е место",
  FINAL: "Финал",
};

function stageToPhase(stage: string, group?: string): string | null {
  const base = STAGE_MAP[stage];
  if (!base) return null;
  if (stage === "GROUP_STAGE" && group) {
    // API возвращает group в виде "GROUP_A", "GROUP_B" — извлекаем букву
    const letter = group.replace(/^GROUP_/, "");
    if (GROUP_LETTERS.includes(letter)) {
      return `${base} ${letter}`;
    }
  }
  return base;
}

// ─── Типы API ────────────────────────────────────────────────────

interface ApiMatch {
  id: number;
  utcDate: string;
  status: string;
  stage: string;
  group?: string;
  matchday?: number;
  homeTeam: {
    name: string | null;
    shortName: string | null;
    tla: string | null;
  };
  awayTeam: {
    name: string | null;
    shortName: string | null;
    tla: string | null;
  };
}

interface ApiResponse {
  resultSet?: { count: number };
  matches?: ApiMatch[];
}

// ─── Локальный тип матча ─────────────────────────────────────────

interface MatchEntry {
  id: string;
  date: string;
  time: string;
  homeTeam: string;
  awayTeam: string;
  phase: string;
  isPlaceholder?: boolean;
}

// ─── Утилиты ─────────────────────────────────────────────────────

/** DD.MM.YYYY → YYYY-MM-DD */
function dateToISO(date: string): string {
  const [d, m, y] = date.split(".").map(Number);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Преобразует UTC-дату API в формат МСК (DD.MM.YYYY HH:MM) */
function utcToMsk(utcDate: string): { date: string; time: string } {
  const utc = new Date(utcDate);
  const msk = new Date(utc.getTime() + 3 * 60 * 60 * 1000);
  const day = String(msk.getUTCDate()).padStart(2, "0");
  const month = String(msk.getUTCMonth() + 1).padStart(2, "0");
  const year = msk.getUTCFullYear();
  const hours = String(msk.getUTCHours()).padStart(2, "0");
  const minutes = String(msk.getUTCMinutes()).padStart(2, "0");
  return {
    date: `${day}.${month}.${year}`,
    time: `${hours}:${minutes}`,
  };
}

/** Пагинация: загружает все матчи соревнования */
async function fetchAllMatches(apiKey: string): Promise<ApiMatch[]> {
  const allMatches: ApiMatch[] = [];
  let page = 0;

  while (true) {
    const url = `${API_BASE}/competitions/WC/matches?season=2026&page=${page}`;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, {
          headers: { "X-Auth-Token": apiKey },
        });

        if (res.status === 429) {
          const wait = 2 ** attempt * 2000;
          console.log(`   ⏳ Rate limited, ждём ${wait / 1000}с...`);
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

/** Сравнивает две записи матча (без учёта id) */
function matchEquals(a: MatchEntry, b: MatchEntry): boolean {
  return (
    a.date === b.date &&
    a.time === b.time &&
    a.homeTeam === b.homeTeam &&
    a.awayTeam === b.awayTeam &&
    a.phase === b.phase &&
    !!a.isPlaceholder === !!b.isPlaceholder
  );
}

// ─── Главный код ─────────────────────────────────────────────────

async function main() {
  // Читаем ключ из .env если не задан через переменную окружения
  let apiKey = process.env.FOOTBALL_DATA_KEY;
  if (!apiKey) {
    try {
      const envContent = fs.readFileSync(ENV_PATH, "utf-8");
      const match = envContent.match(/FOOTBALL_DATA_KEY=(.+)/);
      if (match?.[1]?.trim()) apiKey = match[1].trim();
    } catch {
      // .env нет — ок
    }
  }

  if (!apiKey) {
    console.error(
      "❌ Укажите FOOTBALL_DATA_KEY (в .env или через переменную окружения):\n" +
        "   FOOTBALL_DATA_KEY=ваш_ключ npm run fetch-matches\n\n" +
        "   Получить бесплатный ключ: https://www.football-data.org/client/register",
    );
    process.exit(1);
  }

  console.log("📅 Загрузка расписания матчей ЧМ 2026\n");
  console.log("📋 Источник: football-data.org (бесплатный API)\n");

  // Загружаем текущие матчи
  const existingMatches: Record<string, MatchEntry> = JSON.parse(
    fs.readFileSync(MATCHES_PATH, "utf-8"),
  );

  // ── Шаг 1: Строим индексы для сопоставления ──

  // Групповые: "ISO_дата|homeRu|awayRu" → matchId
  const groupIndex = new Map<string, string>();
  // Плей-офф: "фаза" → [{ matchId, dateISO }] (отсортированы по дате)
  const playoffIndex = new Map<
    string,
    Array<{ matchId: string; dateISO: string }>
  >();

  for (const [id, m] of Object.entries(existingMatches)) {
    const iso = dateToISO(m.date);
    if (!m.isPlaceholder && m.phase.startsWith("Группа")) {
      const key = `${iso}|${m.homeTeam}|${m.awayTeam}`;
      groupIndex.set(key, id);
    } else {
      // Плей-офф или placeholder
      if (!playoffIndex.has(m.phase)) playoffIndex.set(m.phase, []);
      playoffIndex.get(m.phase)!.push({ matchId: id, dateISO: iso });
    }
  }

  // Сортируем плей-офф по дате для последовательного сопоставления
  for (const arr of playoffIndex.values()) {
    arr.sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  }

  // ── Шаг 2: Запрашиваем API ──

  const apiMatches = await fetchAllMatches(apiKey as string);
  console.log(`   📡 Получено матчей из API: ${apiMatches.length}\n`);

  // Сортируем по дате
  apiMatches.sort(
    (a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime(),
  );

  // ── Шаг 3: Сопоставляем и строим новый каталог ──

  const newMatches: Record<string, MatchEntry> = {};
  const usedOldIds = new Set<string>();
  let updated = 0;
  let unchanged = 0;
  let newFromApi = 0;
  const unrecognized: string[] = [];
  // Счётчики для плей-офф по фазе (какой по порядку матч в фазе)
  const playoffCounters = new Map<string, number>();

  for (const apiMatch of apiMatches) {
    const phase = stageToPhase(apiMatch.stage, apiMatch.group);
    if (!phase) continue;

    const homeRu = teamToRu(apiMatch.homeTeam.name);
    const awayRu = teamToRu(apiMatch.awayTeam.name);
    const { date, time } = utcToMsk(apiMatch.utcDate);
    const isGroup = apiMatch.stage === "GROUP_STAGE";

    // Для групповых — обе команды должны быть распознаны
    if (isGroup && (!homeRu || !awayRu)) {
      const names = `${apiMatch.homeTeam.name ?? "null"} vs ${apiMatch.awayTeam.name ?? "null"}`;
      if (!unrecognized.includes(names)) unrecognized.push(names);
      continue;
    }

    let matchedId: string | null = null;

    if (isGroup && homeRu && awayRu) {
      // Групповой: ищем по дата + команды
      const iso = dateToISO(date);
      const key = `${iso}|${homeRu}|${awayRu}`;
      matchedId = groupIndex.get(key) ?? null;

      // Если не нашли по точной дате, попробуем ±1 день (на случай смещения времени)
      if (!matchedId) {
        const d = new Date(iso);
        for (const offset of [-1, 1]) {
          const adj = new Date(d.getTime() + offset * 86400000);
          const adjISO = adj.toISOString().slice(0, 10);
          const adjKey = `${adjISO}|${homeRu}|${awayRu}`;
          matchedId = groupIndex.get(adjKey) ?? null;
          if (matchedId) break;
        }
      }
    } else {
      // Плей-офф: сопоставляем по порядку внутри фазы
      const count = playoffCounters.get(phase) ?? 0;
      playoffCounters.set(phase, count + 1);

      const phaseEntries = playoffIndex.get(phase);
      if (phaseEntries && count < phaseEntries.length) {
        matchedId = phaseEntries[count].matchId;
      }
    }

    if (matchedId && !usedOldIds.has(matchedId)) {
      usedOldIds.add(matchedId);
      const old = existingMatches[matchedId];
      const isPlaceholder = !isGroup && (!homeRu || !awayRu);

      // Для групповых матчей используем фазу из API (с буквой группы),
      // чтобы состав групп соответствовал реальному расписанию.
      // Если API не вернул букву группы — сохраняем оригинальный phase.
      const finalPhase =
        isGroup && phase !== "Группа" ? phase : isGroup ? old.phase : phase;

      const updatedEntry: MatchEntry = {
        id: matchedId,
        date,
        time,
        homeTeam: isGroup ? homeRu! : (homeRu ?? old.homeTeam),
        awayTeam: isGroup ? awayRu! : (awayRu ?? old.awayTeam),
        phase: finalPhase,
        ...(isPlaceholder ? { isPlaceholder: true } : {}),
      };

      if (matchEquals(old, updatedEntry)) {
        unchanged++;
      } else {
        updated++;
        const changes: string[] = [];
        if (old.date !== date || old.time !== time) {
          changes.push(`время ${old.date} ${old.time} → ${date} ${time}`);
        }
        if (old.homeTeam !== updatedEntry.homeTeam) {
          changes.push(`дома: ${old.homeTeam} → ${updatedEntry.homeTeam}`);
        }
        if (old.awayTeam !== updatedEntry.awayTeam) {
          changes.push(`гости: ${old.awayTeam} → ${updatedEntry.awayTeam}`);
        }
        if (old.phase !== updatedEntry.phase) {
          changes.push(`фаза: ${old.phase} → ${updatedEntry.phase}`);
        }
        if (old.isPlaceholder && !isPlaceholder) {
          changes.push("placeholder → реальные команды");
        }
        console.log(`   🔄 ${matchedId}: ${changes.join(", ")}`);
      }

      newMatches[matchedId] = updatedEntry;
    } else if (!matchedId) {
      // Новый матч из API (не было в локальном файле)
      newFromApi++;
      const id = `wc-new-${String(newFromApi).padStart(3, "0")}`;
      const isPlaceholder = !isGroup && (!homeRu || !awayRu);

      newMatches[id] = {
        id,
        date,
        time,
        homeTeam: isGroup ? homeRu! : (homeRu ?? "TBD"),
        awayTeam: isGroup ? awayRu! : (awayRu ?? "TBD"),
        phase,
        ...(isPlaceholder ? { isPlaceholder: true } : {}),
      };
      console.log(
        `   ➕ ${id}: ${date} ${time} ${newMatches[id].homeTeam} vs ${newMatches[id].awayTeam} (${phase})`,
      );
    }
    // Если matchedId уже использован — пропускаем (дубликат)
  }

  if (unrecognized.length > 0) {
    console.log("\n   ⚠️  Не распознаны команды:");
    for (const n of unrecognized) console.log(`      - ${n}`);
  }

  // ── Шаг 3.5: Сохраняем матчи, которых нет в API (1/16, 1/8 и т.д.) ──
  let preserved = 0;
  for (const [id, m] of Object.entries(existingMatches)) {
    if (!usedOldIds.has(id)) {
      newMatches[id] = m;
      preserved++;
    }
  }
  if (preserved > 0) {
    console.log(`\n   📌 Сохранено матчей отсутствующих в API: ${preserved}`);
  }

  // ── Шаг 4: Сравниваем с оригиналом и пишем только при изменениях ──

  const sortedNew = Object.fromEntries(
    Object.entries(newMatches).sort(([a], [b]) => a.localeCompare(b)),
  );
  const sortedOld = Object.fromEntries(
    Object.entries(existingMatches).sort(([a], [b]) => a.localeCompare(b)),
  );
  const newJson = JSON.stringify(sortedNew, null, 2) + "\n";
  const oldJson = JSON.stringify(sortedOld, null, 2) + "\n";

  if (newJson === oldJson) {
    console.log("\n✅ Изменений нет, matches.json не обновлён");
  } else {
    fs.writeFileSync(MATCHES_PATH, newJson, "utf-8");
    console.log("\n💾 matches.json обновлён");
  }

  const groupCount = Object.values(newMatches).filter(
    (m) => !m.isPlaceholder,
  ).length;
  const placeholderCount = Object.values(newMatches).filter(
    (m) => m.isPlaceholder,
  ).length;

  console.log("\n" + "═".repeat(50));
  console.log("📊 ИТОГО:");
  console.log(`   📅 Групповых матчей:      ${groupCount}`);
  console.log(`   🏟️  Плей-офф (placeholder): ${placeholderCount}`);
  console.log(`   📝 Всего записей:         ${Object.keys(newMatches).length}`);
  console.log(`   🔄 Обновлено:            ${updated}`);
  console.log(`   ✔️  Без изменений:        ${unchanged}`);
  console.log(`   ➕ Новых из API:          ${newFromApi}`);
  console.log("═".repeat(50));
}

main().catch((err) => {
  console.error("\n❌ Ошибка:", err instanceof Error ? err.message : err);
  process.exit(1);
});
