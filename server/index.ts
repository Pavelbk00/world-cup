import express from "express";
import cors from "cors";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const USERS_PATH = path.join(__dirname, "..", "src", "users.json");
const MATCHES_PATH = path.join(DATA_DIR, "matches.json");

// Ensure data dir exists
await fs.mkdir(DATA_DIR, { recursive: true });

// ---- Загрузка каталога матчей (для валидации по matchId) ----
interface MatchDef {
  id: string;
  date: string;
  time: string;
  homeTeam: string;
  awayTeam: string;
  phase: string;
  isPlaceholder?: boolean;
}

let matchesCatalog: Record<string, MatchDef> = {};
try {
  const matchesContent = await fs.readFile(MATCHES_PATH, "utf-8");
  matchesCatalog = JSON.parse(matchesContent);
} catch {
  console.warn("Could not read data/matches.json, match time validation disabled");
}

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
  registeredUsers = usersData.users ?? [];
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
      updated_at: new Date().toISOString(),
    };
    await fs.writeFile(filePath, JSON.stringify(initial, null, 2), "utf-8");
  }
}

// Карта логин -> никнейм для быстрого доступа
const loginToNickname = new Map(registeredUsers.map((u) => [u.login, u.nickname]));

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

// Кэш результатов матчей (хэш-таблица matchId -> {home, away})
let resultsCache: Record<string, { home: number | null; away: number | null }> | null = null;
let resultsCacheTime = 0;
const RESULTS_CACHE_TTL = 5_000; // 5 секунд

async function loadResults(): Promise<Record<string, { home: number | null; away: number | null }>> {
  const now = Date.now();
  if (resultsCache && now - resultsCacheTime < RESULTS_CACHE_TTL) {
    return resultsCache;
  }
  try {
    const content = await fs.readFile(
      path.join(DATA_DIR, "results.json"),
      "utf-8",
    );
    resultsCache = JSON.parse(content);
    resultsCacheTime = now;
    return resultsCache!;
  } catch {
    resultsCache = {};
    resultsCacheTime = now;
    return {};
  }
}

// GET /api/results — read match results from results.json (хэш-таблица)
app.get("/api/results", async (_req, res) => {
  const data = await loadResults();
  res.json(data);
});

// GET /api/players — list all players from users.json with their saved data
app.get("/api/players", async (req, res) => {
  const requesterLogin = (req.headers["x-user-login"] as string | undefined)?.trim().toLowerCase();
  const hasResult = await getMatchResultsMap();
  const results: unknown[] = [];

  for (const u of registeredUsers) {
    const login = u.login;
    const filePath = path.join(DATA_DIR, `${login}.json`);
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const data = JSON.parse(content);
      if (typeof data === "object" && data !== null && !Array.isArray(data)) {
        // Нормализуем predictions к хэш-таблице
        const normalized = normalizePredictions(data as Record<string, unknown>);
        // Если запросивший пользователь не является владельцем — фильтруем
        if (!requesterLogin || requesterLogin !== login) {
          results.push(filterPlayerForNonOwner(normalized, hasResult));
        } else {
          results.push(normalized);
        }
      }
    } catch {
      // Файла нет — добавляем пустой объект для этого пользователя
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

// GET /api/players/:login — load one player by login from users.json
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

  try {
    const content = await fs.readFile(
      path.join(DATA_DIR, `${login}.json`),
      "utf-8",
    );
    const data = JSON.parse(content);
    // Нормализуем predictions к хэш-таблице
    const normalized = normalizePredictions(data as Record<string, unknown>);
    // Если не владелец — фильтруем данные
    if (!isOwner) {
      const hasResult = await getMatchResultsMap();
      res.json(filterPlayerForNonOwner(normalized, hasResult));
    } else {
      res.json(normalized);
    }
  } catch {
    // Файла нет — возвращаем пустые данные
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

// POST /api/players/save — save (create or overwrite) player predictions by login
app.post("/api/players/save", async (req, res) => {
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

  const login = body.login.trim().toLowerCase();

  // Проверяем, что пользователь есть в users.json
  const user = registeredUsers.find((u) => u.login === login);
  if (!user) {
    res.status(403).json({ error: "Unknown user" });
    return;
  }

  // Загружаем существующие данные, если есть
  let existingData: Record<string, unknown> | null = null;
  try {
    const existingContent = await fs.readFile(
      path.join(DATA_DIR, `${login}.json`),
      "utf-8",
    );
    existingData = JSON.parse(existingContent);
  } catch {
    // Файла нет — первый раз
  }

  // Собираем существующие прогнозы по matchId для начавшихся матчей
  // Поддержка старого формата (массив) и нового (хэш-таблица)
  const existingPredsMap = new Map<string, { home: number; away: number }>();
  if (existingData) {
    const preds = existingData.predictions;
    if (Array.isArray(preds)) {
      for (const p of preds as Array<{ matchId: string; home: number; away: number }>) {
        if (typeof p.home === "number" && typeof p.away === "number" && p.matchId) {
          existingPredsMap.set(p.matchId, { home: p.home, away: p.away });
        }
      }
    } else if (preds && typeof preds === "object") {
      for (const [matchId, val] of Object.entries(preds as Record<string, { home: number; away: number }>)) {
        if (typeof val?.home === "number" && typeof val?.away === "number") {
          existingPredsMap.set(matchId, { home: val.home, away: val.away });
        }
      }
    }
  }

  let topScorer = body.topScorer ?? null;
  let medalists = body.medalists ?? null;

  // Если первый матч начался — игнорируем новые значения призёров и бомбардира,
  // используем существующие из файла (защита от прямых запросов к API)
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

  const payload = {
    player: user.nickname,
    login: user.login,
    predictions: validatedPredictions,
    groupStandings: body.groupStandings ?? [],
    playoff: body.playoff ?? [],
    topScorer,
    medalists,
    updated_at: new Date().toISOString(),
  };

  try {
    await fs.writeFile(
      path.join(DATA_DIR, `${login}.json`),
      JSON.stringify(payload, null, 2),
      "utf-8",
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("Save error:", err);
    res.status(500).json({ error: "Failed to save" });
  }
});

/** Загружает результаты матчей и возвращает Map<matchId, hasResult> (из кэша) */
async function getMatchResultsMap(): Promise<Map<string, boolean>> {
  const data = await loadResults();
  const map = new Map<string, boolean>();
  for (const [matchId, result] of Object.entries(data)) {
    map.set(matchId, result.home !== null && result.away !== null);
  }
  return map;
}

/** Нормализует predictions к хэш-таблице (если старый формат — массив) */
function normalizePredictions(data: Record<string, unknown>): Record<string, unknown> {
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

app.listen(3001, '127.0.0.1', () => {
  console.log(`Server running on http://localhost:3001`);
});