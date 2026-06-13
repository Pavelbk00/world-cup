import express from "express";
import cors from "cors";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_MATCHES } from "../src/matches.js";
import { initDatabase, getPlayer, getResultsFresh, savePlayer, getCacheSize } from "./database.js";
import { fetchAndSaveResults } from "./auto-fetch.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const USERS_PATH = path.join(__dirname, "..", "src", "users.json");

// Ensure data dir exists
await fs.mkdir(DATA_DIR, { recursive: true });

// ---- Каталог матчей (для валидации по matchId) ----
interface MatchDef {
  id: string;
  date: string;
  time: string;
  homeTeam: string;
  awayTeam: string;
  phase: string;
  isPlaceholder?: boolean;
}

const matchesCatalog: Record<string, MatchDef> = DEFAULT_MATCHES;

// ---- Загрузка users.json и создание файлов для каждого пользователя ----
interface UserEntry {
  login: string;
  password: string;
  nickname: string;
}

interface UsersFile {
  users: UserEntry[];
}

let registeredUsers: UserEntry[] = [];

try {
  const usersContent = await fs.readFile(USERS_PATH, "utf-8");
  const usersData = JSON.parse(usersContent) as UsersFile;
  registeredUsers = Array.isArray(usersData.users) ? usersData.users : [];
} catch {
  console.warn("Could not read users.json, continuing without predefined users");
}

// Создаём начальные JSON-файлы для пользователей, если их ещё нет
for (const u of registeredUsers) {
  const filePath = path.join(DATA_DIR, `${u.login}.json`);
  try {
    await fs.access(filePath);
  } catch {
    // Файла нет — создаём с пустыми данными (predictions — хэш-таблица)
    const initial = {
      player: u.nickname,
      login: u.login,
      predictions: {},
      groupStandings: [],
      playoff: [],
      topScorer: null,
      medalists: null,
    };
    await fs.writeFile(filePath, JSON.stringify(initial, null, 2), "utf-8");
  }
}

// ──────────────────────────────────────────────────────────────────
// 🔥 ПРОГРЕВ ОЗУ: загружаем ВСЕ JSON-файлы в оперативную память
// После этого все чтения мгновенные (из RAM), записи — асинхронные
// ──────────────────────────────────────────────────────────────────
await initDatabase(DATA_DIR);

// ---- end of users.json initialisation ----

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

/** Парсит строку вида "DD.MM.YYYY HH:MM" в Date | null */
function parseMatchDateTime(date: string, time: string): Date | null {
  const [day, month, year] = date.split(".").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  if (
    isNaN(day) || isNaN(month) || isNaN(year) ||
    isNaN(hours) || isNaN(minutes)
  ) return null;
  return new Date(year, month - 1, day, hours, minutes);
}

/** Проверяет, начался ли матч по matchId (из каталога матчей) */
function hasMatchStarted(matchId: string): boolean {
  const match = matchesCatalog[matchId];
  if (!match) return true; // Неизвестный матч — считаем начавшимся (безопасно)
  if (match.isPlaceholder) return false; // Плейсхолдеры не блокируются
  const matchTime = parseMatchDateTime(match.date, match.time);
  if (!matchTime) return true;
  return Date.now() >= matchTime.getTime();
}

/** Дата и время первого матча турнира (блокировка выбора призёров и бомбардира) */
const FIRST_MATCH_TIME = new Date("2026-06-11T22:00:00+03:00").getTime();
function isFirstMatchStarted(): boolean {
  return Date.now() >= FIRST_MATCH_TIME;
}

/** Загружает результаты матчей и возвращает Map<matchId, hasResult> (из ОЗУ) */
async function getMatchResultsMap(): Promise<Map<string, boolean>> {
  const data = await getResultsFresh();
  const map = new Map<string, boolean>();
  for (const [matchId, result] of Object.entries(data)) {
    map.set(matchId, result.home !== null && result.away !== null);
  }
  return map;
}

// GET /api/results — результаты матчей из ОЗУ (мгновенно, с автообновлением)
app.get("/api/results", async (_req, res) => {
  res.json(await getResultsFresh());
});

// GET /api/players — список всех игроков из ОЗУ (мгновенно)
app.get("/api/players", async (req, res) => {
  const requesterLogin = (req.headers["x-user-login"] as string | undefined)?.trim().toLowerCase();
  const hasResult = await getMatchResultsMap();
  const results: unknown[] = [];

  for (const u of registeredUsers) {
    const login = u.login;
    const data = await getPlayer(login);
    if (data) {
      // Если запросивший пользователь не является владельцем — фильтруем
      if (!requesterLogin || requesterLogin !== login) {
        results.push(filterPlayerForNonOwner(data, hasResult));
      } else {
        results.push(data);
      }
    } else {
      // Данных нет в кэше — добавляем пустой объект
      results.push({
        player: u.nickname,
        login: u.login,
        predictions: {},
        groupStandings: [],
        playoff: [],
        topScorer: null,
        medalists: null,
      });
    }
  }

  res.json(results);
});

// GET /api/players/:login — данные одного игрока из ОЗУ (мгновенно)
app.get("/api/players/:login", async (req, res) => {
  const login = req.params.login.trim().toLowerCase();
  if (!login) {
    res.status(400).json({ error: "Invalid login" });
    return;
  }

  // Проверяем, что такой пользователь есть в users.json
  const user = registeredUsers.find((u) => u.login === login);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Проверяем, является ли запросивший пользователь владельцем
  const requesterLogin = (req.headers["x-user-login"] as string | undefined)?.trim().toLowerCase();
  const isOwner = requesterLogin === login;

  const data = await getPlayer(login);
  if (data) {
    // Если не владелец — фильтруем данные
    if (!isOwner) {
      const hasResult = await getMatchResultsMap();
      res.json(filterPlayerForNonOwner(data, hasResult));
    } else {
      res.json(data);
    }
  } else {
    // Данных нет в кэше — возвращаем пустые данные
    res.json({
      player: user.nickname,
      login: user.login,
      predictions: {},
      groupStandings: [],
      playoff: [],
      topScorer: null,
      medalists: null,
    });
  }
});

// POST /api/players/save — сохранить прогнозы (ОЗУ мгновенно + диск в фоне)
app.post("/api/players/save", async (req, res) => {
  try {
    const body = req.body as {
      login: string;
      player: string;
      predictions: Record<string, { home: number; away: number; winner?: string; method?: string }>;
      groupStandings?: unknown[];
      playoff?: unknown[];
      topScorer?: unknown;
      medalists?: unknown;
    };

    if (!body.login || !body.login.trim()) {
      res.status(400).json({ error: "Login required" });
      return;
    }

    console.log(`[SAVE-RAW] body keys=${Object.keys(body).join(",")} predictions=${body.predictions ? `object(${Object.keys(body.predictions).length} keys)` : typeof body.predictions} topScorer=${JSON.stringify(body.topScorer)} medalists=${JSON.stringify(body.medalists)} groupStandings=${Array.isArray(body.groupStandings) ? `array(${body.groupStandings.length})` : typeof body.groupStandings} playoff=${Array.isArray(body.playoff) ? `array(${body.playoff.length})` : typeof body.playoff}`);

    const login = body.login.trim().toLowerCase();

    // Проверяем, что пользователь есть в users.json
    const user = registeredUsers.find((u) => u.login === login);
    if (!user) {
      res.status(403).json({ error: "Unknown user" });
      return;
    }

    // Читаем существующие данные из ОЗУ (мгновенно!)
    let existingData: Record<string, unknown> | null = await getPlayer(login);

    // Собираем существующие прогнозы по matchId для начавшихся матчей
    const existingPredsMap = new Map<string, { home: number; away: number }>();
    if (existingData) {
      const preds = existingData.predictions;
      if (preds && typeof preds === "object" && !Array.isArray(preds)) {
        for (const [matchId, val] of Object.entries(preds as Record<string, unknown>)) {
          if (val && typeof val === "object" && typeof (val as Record<string, unknown>).home === "number" && typeof (val as Record<string, unknown>).away === "number") {
            existingPredsMap.set(matchId, { home: (val as { home: number; away: number }).home, away: (val as { home: number; away: number }).away });
          }
        }
      }
    }

    let topScorer = body.topScorer ?? null;
    let medalists = body.medalists ?? null;

    // Если первый матч начался — игнорируем новые значения призёров и бомбардира,
    // используем существующие (защита от прямых запросов к API)
    if (isFirstMatchStarted()) {
      topScorer = existingData?.topScorer ?? null;
      medalists = existingData?.medalists ?? null;
    }

    // Валидируем прогнозы: если матч уже начался, оставляем существующий
    const validatedPredictions: Record<string, { home: number; away: number; winner?: string; method?: string }> = {};

    if (body.predictions && typeof body.predictions === "object" && !Array.isArray(body.predictions)) {
      for (const [matchId, pred] of Object.entries(body.predictions)) {
        if (typeof pred !== "object" || pred === null) continue;
        if (typeof pred.home !== "number" || typeof pred.away !== "number") continue;

        if (hasMatchStarted(matchId)) {
          // Матч уже начался — берём существующий прогноз (или 0:0)
          const existing = existingPredsMap.get(matchId);
          validatedPredictions[matchId] = {
            home: existing?.home ?? 0,
            away: existing?.away ?? 0,
          };
        } else {
          // Матч ещё не начался — используем как есть
          const validated: { home: number; away: number; winner?: string; method?: string } = {
            home: pred.home,
            away: pred.away,
          };
          if (pred.winner && typeof pred.winner === "string") validated.winner = pred.winner;
          if (pred.method && typeof pred.method === "string") validated.method = pred.method;
          validatedPredictions[matchId] = validated;
        }
      }
    }

    const payload: Record<string, unknown> = {
      player: user.nickname,
      login: user.login,
      predictions: validatedPredictions,
      groupStandings: body.groupStandings ?? [],
      playoff: body.playoff ?? [],
      topScorer,
      medalists,
    };

    // 💾 Сохраняем: ОЗУ мгновенно + диск в фоне (юзер не ждёт!)
    savePlayer(login, payload);
    console.log(`[SAVE] login=${login} preds=${Object.keys(validatedPredictions).length} topScorer=${JSON.stringify(topScorer)} medalists=${JSON.stringify(medalists)} groupStandings=${JSON.stringify(body.groupStandings)?.length ?? 0} playoff=${JSON.stringify(body.playoff)?.length ?? 0}`);
    res.json({ ok: true, saved: { predictions: Object.keys(validatedPredictions).length, topScorer: !!topScorer, medalists: !!medalists } });
  } catch (err) {
    console.error("=== SAVE HANDLER ERROR ===");
    console.error("Message:", err instanceof Error ? err.message : String(err));
    console.error("Stack:", err instanceof Error ? err.stack : "N/A");
    console.error("Body type:", typeof req.body);
    console.error("Body keys:", req.body ? Object.keys(req.body) : "null");
    console.error("Predictions type:", typeof req.body?.predictions);
    console.error("Predictions constructor:", req.body?.predictions?.constructor?.name);
    console.error("=========================");
    res.status(500).json({ error: "Internal server error", details: err instanceof Error ? err.message : String(err) });
  }
});

/**
 * Фильтрует данные игрока для не-владельца:
 * — оставляет только прогнозы на матчи с результатами
 * — скрывает topScorer/medalists до старта первого матча
 * — скрывает groupStandings
 */
function filterPlayerForNonOwner(data: Record<string, unknown>, hasResult: Map<string, boolean>): Record<string, unknown> {
  const filtered = { ...data };

  // Фильтруем прогнозы: оставляем только матчи с результатами
  if (filtered.predictions && typeof filtered.predictions === "object" && !Array.isArray(filtered.predictions)) {
    const filteredPreds: Record<string, unknown> = {};
    for (const [matchId, pred] of Object.entries(filtered.predictions as Record<string, unknown>)) {
      if (hasResult.get(matchId) === true) {
        filteredPreds[matchId] = pred;
      }
    }
    filtered.predictions = filteredPreds;
  }

  // Скрываем topScorer и medalists до старта первого матча
  if (!isFirstMatchStarted()) {
    filtered.topScorer = null;
    filtered.medalists = null;
  }

  // Скрываем groupStandings для не-владельцев
  filtered.groupStandings = [];

  // Скрываем rawJson — там могут быть полные прогнозы
  delete filtered.rawJson;

  return filtered;
}

// GET /api/health — лёгкий эндпоинт для cron-прогрева (не грузит диск)
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", uptime: Math.round(process.uptime()), playersInCache: getCacheSize() });
});

// ──────────────────────────────────────────────────────────────────
// 🤖 АВТОЗАПУСК: планирует запрос результатов после окончания
// каждого матча (время старта + 2 часа). Один запрос на матч.
// ──────────────────────────────────────────────────────────────────

const ENV_PATH = path.join(__dirname, "..", ".env");

async function loadApiKey(): Promise<string | null> {
  if (process.env.FOOTBALL_DATA_KEY) return process.env.FOOTBALL_DATA_KEY;
  try {
    const envContent = await fs.readFile(ENV_PATH, "utf-8");
    const match = envContent.match(/FOOTBALL_DATA_KEY=(.+)/);
    if (match?.[1]?.trim()) return match[1].trim();
  } catch { /* .env нет */ }
  return null;
}

async function scheduleAutoFetch() {
  const _key = await loadApiKey();
  if (!_key) {
    console.log("🤖 Автозапуск: нет FOOTBALL_DATA_KEY, пропускаем");
    return;
  }
  const key: string = _key;

  // Читаем текущие результаты
  const resultsData = JSON.parse(
    await fs.readFile(path.join(DATA_DIR, "results.json"), "utf-8")
  ) as Record<string, { home: number | null; away: number | null }>;

  const MATCH_DURATION_MS = 2 * 60 * 60 * 1000; // 2 часа после старта
  const RETRY_DELAY_MS = 10 * 60 * 1000; // повтор через 10 мин, если результата ещё нет
  const now = Date.now();
  let scheduled = 0;
  let immediate = 0;

  for (const [matchId, match] of Object.entries(matchesCatalog)) {
    if (match.isPlaceholder) continue;

    // Если результат уже есть — пропускаем
    if (resultsData[matchId]?.home !== null && resultsData[matchId]?.away !== null) continue;

    const matchTime = parseMatchDateTime(match.date, match.time);
    if (!matchTime) continue;

    const fetchAt = matchTime.getTime() + MATCH_DURATION_MS;

    function scheduleFetch(at: number) {
      const delay = at - now;
      if (delay <= 0) {
        // Время уже прошло — запускаем сразу
        immediate++;
        setTimeout(() => doFetch(matchId, match.homeTeam, match.awayTeam, key), 0);
      } else {
        // Планируем на точное время
        scheduled++;
        const mins = Math.round(delay / 60_000);
        console.log(`   ⏰ ${matchId} ${match.homeTeam} vs ${match.awayTeam} → через ${mins} мин`);
        setTimeout(() => doFetch(matchId, match.homeTeam, match.awayTeam, key), delay);
      }
    }

    scheduleFetch(fetchAt);
  }

  if (scheduled > 0 || immediate > 0) {
    console.log(`🤖 Автозапуск: ${scheduled} запланировано, ${immediate} немедленно`);
  } else {
    console.log("🤖 Автозапуск: все результаты на месте, нечего планировать");
  }

  async function doFetch(matchId: string, home: string, away: string, key: string) {
    try {
      console.log(`🤖 Запрос результатов (${home} vs ${away})...`);
      const r = await fetchAndSaveResults(key);

      if (r.updated > 0) {
        for (const m of r.updatedMatches) {
          console.log(`   🔄 ${m.matchId} ${m.home} ${m.homeScore}:${m.awayScore} ${m.away}`);
        }
      } else {
        // Результата ещё нет — повторим через 10 минут
        console.log(`   ⏳ Результата ${matchId} ещё нет в API, повтор через 10 мин`);
        setTimeout(() => doFetch(matchId, home, away, key), RETRY_DELAY_MS);
      }
    } catch (err) {
      console.error(`🤖 Ошибка ${matchId}:`, err instanceof Error ? err.message : err);
      // Повторим через 10 минут при ошибке
      setTimeout(() => doFetch(matchId, home, away, key), RETRY_DELAY_MS);
    }
  }
}

scheduleAutoFetch();

app.listen(3001, '127.0.0.1', () => {
  console.log(`Server running on http://localhost:3001`);
});
