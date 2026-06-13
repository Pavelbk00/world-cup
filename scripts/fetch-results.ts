/**
 * CLI-скрипт для ручного обновления результатов матчей ЧМ 2026.
 * Использует общий модуль server/auto-fetch.ts.
 *
 * Использование:
 *   npm run fetch-results
 *   FOOTBALL_DATA_KEY=ключ npm run fetch-results
 *
 * Получить ключ: https://www.football-data.org/client/register
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchAndSaveResults } from "../server/auto-fetch.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.join(__dirname, "..", ".env");

// Читаем ключ из .env если не задан через переменную окружения
let apiKey = process.env.FOOTBALL_DATA_KEY;
if (!apiKey) {
  try {
    const envContent = fs.readFileSync(ENV_PATH, "utf-8");
    const match = envContent.match(/FOOTBALL_DATA_KEY=(.+)/);
    if (match?.[1]?.trim()) apiKey = match[1].trim();
  } catch {
    // .env нет — ок, используем переменную окружения
  }
}

if (!apiKey) {
  console.error(
    '❌ Укажите FOOTBALL_DATA_KEY (в .env или через переменную окружения):\n' +
    '   FOOTBALL_DATA_KEY=ваш_ключ npm run fetch-results\n\n' +
    '   Получить бесплатный ключ: https://www.football-data.org/client/register'
  );
  process.exit(1);
}

async function main() {
  console.log("⚽ Загрузка результатов матчей ЧМ 2026\n");
  console.log("📋 Источник: football-data.org (бесплатный API)\n");

  const r = await fetchAndSaveResults(apiKey as string);

  if (r.updated > 0) {
    console.log("🔄 Обновлённые результаты:");
    for (const m of r.updatedMatches) {
      const prev = m.prevHome !== null ? `${m.prevHome}:${m.prevAway}` : "—";
      console.log(`   ${m.matchId} ${m.home} ${m.homeScore}:${m.awayScore} ${m.away}  (было ${prev})`);
    }
    console.log();
  }

  console.log("═".repeat(45));
  console.log("📊 ИТОГО:");
  console.log(`   ✅ Сопоставлено:    ${r.matched}`);
  console.log(`   🔄 Обновлено:       ${r.updated}`);
  console.log(`   ✔️  Без изменений:   ${r.unchanged}`);
  console.log(`   ⚠️  Не сопоставлено: ${r.unmatched}`);
  console.log("═".repeat(45));
}

main().catch((err) => {
  console.error("\n❌ Ошибка:", err instanceof Error ? err.message : err);
  process.exit(1);
});