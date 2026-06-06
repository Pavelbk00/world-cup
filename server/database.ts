/**
 * singleton-database.ts
 *
 * Загружает ВСЕ JSON-файлы из data/ в оперативную память при старте сервера.
 * После этого все чтения мгновенные (из RAM), а записи — асинхронные (в фоне).
 *
 * Решает проблему медленной первой загрузки из-за холодного Page Cache на HDD.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

// ─── In-memory кэш ───────────────────────────────────────────────
const playerCache = new Map<string, Record<string, unknown>>();
const playerCacheTime = new Map<string, number>(); // Время загрузки каждого файла
let resultsCache: Record<string, { home: number | null; away: number | null }> = {};
let resultsCacheTime = 0; // Время последней загрузки results.json
const CACHE_TTL = 5_000; // Проверять обновление файлов каждые 5 секунд

let DATA_DIR = "";

// ─── Утилита нормализации ────────────────────────────────────────

/** Нормализует predictions к хэш-таблице (если старый формат — массив) */
export function normalizePredictions(data: Record<string, unknown>): Record<string, unknown> {
  const result = { ...data };
  if (Array.isArray(result.predictions)) {
    const map: Record<string, unknown> = {};
    for (const p of result.predictions as Array<Record<string, unknown>>) {
      const matchId = p.matchId as string | undefined;
      if (matchId) {
        const entry: Record<string, unknown> = { home: p.home, away: p.away };
        if (p.winner) entry.winner = p.winner;
        if (p.method) entry.method = p.method;
        map[matchId] = entry;
      }
    }
    result.predictions = map;
  }
  return result;
}

// ─── Инициализация (вызывается ОДИН раз при старте) ──────────────

/**
 * Загружает все JSON-файлы из data/ в оперативную память.
 * Вызывается ОДИН раз при старте сервера (в server/index.ts).
 */
export async function initDatabase(dataDir: string): Promise<void> {
  DATA_DIR = dataDir;

  // 1. Загружаем результаты матчей
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, "results.json"), "utf-8");
    resultsCache = JSON.parse(raw);
    resultsCacheTime = Date.now();
    console.log(`[DB] ✓ results.json → ОЗУ (${Object.keys(resultsCache).length} записей)`);
  } catch {
    resultsCache = {};
    resultsCacheTime = Date.now();
    console.log("[DB] results.json не найден, используем пустой кэш");
  }

  // 2. Загружаем все файлы игроков (*.json, кроме results.json и matches.json)
  let loadedCount = 0;
  try {
    const files = await fs.readdir(DATA_DIR);
    const playerFiles = files.filter(
      (f) => f.endsWith(".json") && f !== "results.json" && f !== "matches.json",
    );

    for (const file of playerFiles) {
      const login = file.replace(".json", "");
      try {
        const raw = await fs.readFile(path.join(DATA_DIR, file), "utf-8");
        const data = JSON.parse(raw);
        if (typeof data === "object" && data !== null && !Array.isArray(data)) {
          // Нормализуем один раз при загрузке — дальше всегда хэш-таблица
          playerCache.set(login, normalizePredictions(data as Record<string, unknown>));
          playerCacheTime.set(login, Date.now());
          loadedCount++;
        }
      } catch {
        console.warn(`[DB] ⚠ Не удалось загрузить ${file}`);
      }
    }
  } catch {
    console.warn("[DB] ⚠ Не удалось прочитать директорию data/");
  }

  console.log(`[DB] ✓ ${loadedCount} файлов игроков → ОЗУ`);
  console.log("[DB] JSON база успешно прогрета! Все данные в оперативной памяти.");
}

// ─── Чтение (мгновенно из RAM) ───────────────────────────────────

/**
 * Получить данные игрока из файла.
 * Раз в CACHE_TTL миллисекунд проверяет, изменился ли файл на диске.
 * Если да — перезагружает. Ручное обновление файла подхватится автоматически.
 */
export async function getPlayer(login: string): Promise<Record<string, unknown> | null> {
  const now = Date.now();
  const cachedTime = playerCacheTime.get(login) ?? 0;

  // Если кэш свежий — отдаём из ОЗУ
  if (now - cachedTime < CACHE_TTL) {
    return playerCache.get(login) ?? null;
  }

  // TTL истёк — перечитываем файл с диска
  const filePath = path.join(DATA_DIR, `${login}.json`);
  try {
    const stat = await fs.stat(filePath);
    if (stat.mtimeMs > cachedTime || !playerCache.has(login)) {
      // Файл изменился (или ещё не загружен) — перезагружаем
      const raw = await fs.readFile(filePath, "utf-8");
      const data = JSON.parse(raw);
      if (typeof data === "object" && data !== null && !Array.isArray(data)) {
        playerCache.set(login, normalizePredictions(data as Record<string, unknown>));
        console.log(`[DB] 🔄 ${login}.json обновлён с диска`);
      }
    }
  } catch {
    // Файл не найден — оставляем старый кэш (или null)
  }
  playerCacheTime.set(login, now);
  return playerCache.get(login) ?? null;
}

/**
 * Получить результаты матчей из файла.
 * Раз в CACHE_TTL миллисекунд проверяет, изменился ли results.json на диске.
 * Если да — перезагружает. Ручное обновление файла подхватится автоматически.
 */
export async function getResultsFresh(): Promise<Record<string, { home: number | null; away: number | null }>> {
  const now = Date.now();
  if (now - resultsCacheTime < CACHE_TTL) {
    return resultsCache;
  }
  // TTL истёк — проверяем, изменился ли файл
  try {
    const stat = await fs.stat(path.join(DATA_DIR, "results.json"));
    if (stat.mtimeMs > resultsCacheTime) {
      // Файл изменился — перезагружаем
      const raw = await fs.readFile(path.join(DATA_DIR, "results.json"), "utf-8");
      resultsCache = JSON.parse(raw);
      console.log(`[DB] 🔄 results.json обновлён с диска (${Object.keys(resultsCache).length} записей)`);
    }
  } catch {
    // Файл не найден или ошибка — оставляем старый кэш
  }
  resultsCacheTime = now;
  return resultsCache;
}

/** Количество игроков в ОЗУ-кэше */
export function getCacheSize(): number {
  return playerCache.size;
}

// ─── Запись (RAM мгновенно + диск в фоне) ────────────────────────

/**
 * Сохранить данные игрока:
 * 1. Обновляет кэш в ОЗУ мгновенно → следующий запрос увидит новые данные
 * 2. Пишет на диск в фоне (без await) → юзер не ждёт медленного HDD
 */
export function savePlayer(login: string, data: Record<string, unknown>): void {
  playerCache.set(login, data);
  playerCacheTime.set(login, Date.now()); // Обновляем время кэша — не перечитаем файл сразу после записи
  // Асинхронная запись на диск — не блокируем ответ пользователю
  fs.writeFile(path.join(DATA_DIR, `${login}.json`), JSON.stringify(data, null, 2), "utf-8").catch(
    (err) => {
      console.error(`[DB] ❌ Ошибка записи ${login}.json на диск:`, err);
    },
  );
}