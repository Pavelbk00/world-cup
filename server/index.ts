import express from "express";
import cors from "cors";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const USERS_PATH = path.join(__dirname, "..", "src", "users.json");

// Ensure data dir exists
await fs.mkdir(DATA_DIR, { recursive: true });

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
    // Файла нет — создаём с пустыми данными
    const initial = {
      player: u.nickname,
      login: u.login,
      predictions: [],
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

function fileNameSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-zа-яё0-9-]/gi, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Парсит строку вида "DD.MM.YYYY HH:MM" в Date | null */
function parseMatchDateTime(dt: string): Date | null {
  const parts = dt.split(" ");
  if (parts.length !== 2) return null;
  const [day, month, year] = parts[0].split(".").map(Number);
  const [hours, minutes] = parts[1].split(":").map(Number);
  if (
    isNaN(day) || isNaN(month) || isNaN(year) ||
    isNaN(hours) || isNaN(minutes)
  ) return null;
  return new Date(year, month - 1, day, hours, minutes);
}

/** Дата и время первого матча турнира (блокировка выбора призёров и бомбардира) */
const FIRST_MATCH_TIME = new Date("2026-06-11T22:00:00+03:00").getTime();
function isFirstMatchStarted(): boolean {
  return Date.now() >= FIRST_MATCH_TIME;
}

// GET /api/results — read match results from results.json
app.get("/api/results", async (_req, res) => {
  try {
    const content = await fs.readFile(
      path.join(DATA_DIR, "results.json"),
      "utf-8",
    );
    const data = JSON.parse(content);
    res.json(data);
  } catch {
    res.json([]);
  }
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
        // Если запросивший пользователь не является владельцем — фильтруем
        if (!requesterLogin || requesterLogin !== login) {
          results.push(filterPlayerForNonOwner(data as Record<string, unknown>, hasResult));
        } else {
          results.push(data);
        }
      }
    } catch {
      // Файла нет — добавляем пустой объект для этого пользователя
      results.push({
        player: u.nickname,
        login: u.login,
        predictions: [],
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
    // Если не владелец — фильтруем данные
    if (!isOwner) {
      const hasResult = await getMatchResultsMap();
      res.json(filterPlayerForNonOwner(data as Record<string, unknown>, hasResult));
    } else {
      res.json(data);
    }
  } catch {
    // Файла нет — возвращаем пустые данные
    res.json({
      player: user.nickname,
      login: user.login,
      predictions: [],
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
    predictions: Array<{
      matchId: string;
      home: number;
      away: number;
      matchDateTime?: string;
      matchText?: string;
      groupName?: string;
    }>;
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
  const existingPredsMap = new Map<string, { home: number; away: number }>();
  if (existingData && Array.isArray(existingData.predictions)) {
    for (const p of existingData.predictions as Array<{
      matchId: string;
      home: number;
      away: number;
    }>) {
      if (typeof p.home === "number" && typeof p.away === "number") {
        existingPredsMap.set(p.matchId, { home: p.home, away: p.away });
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

  // Валидируем прогнозы: если matchDateTime уже прошёл, оставляем существующий
  const validatedPredictions: Array<{
    matchId: string;
    home: number;
    away: number;
    matchDateTime?: string;
    matchText?: string;
    groupName?: string;
  }> = [];

  for (const p of body.predictions ?? []) {
    const matchTime = p.matchDateTime ? parseMatchDateTime(p.matchDateTime) : null;

    if (matchTime && Date.now() >= matchTime.getTime()) {
      // Матч уже начался или завершился — берём существующий прогноз (или 0:0)
      const existing = existingPredsMap.get(p.matchId);
      validatedPredictions.push({
        matchId: p.matchId,
        home: existing?.home ?? 0,
        away: existing?.away ?? 0,
        matchDateTime: p.matchDateTime,
        matchText: p.matchText,
        groupName: p.groupName,
      });
    } else {
      // Матч ещё не начался (или matchDateTime не указан) — используем как есть
      validatedPredictions.push(p);
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

/** Загружает результаты матчей и возвращает Map<matchId, hasResult> */
async function getMatchResultsMap(): Promise<Map<string, boolean>> {
  try {
    const content = await fs.readFile(
      path.join(DATA_DIR, "results.json"),
      "utf-8",
    );
    const data = JSON.parse(content) as Array<{
      matchId: string;
      home: number | null;
      away: number | null;
    }>;
    const map = new Map<string, boolean>();
    for (const r of data) {
      map.set(r.matchId, r.home !== null && r.away !== null);
    }
    return map;
  } catch {
    return new Map();
  }
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
  if (Array.isArray(filtered.predictions)) {
    filtered.predictions = (filtered.predictions as Array<Record<string, unknown>>).filter(
      (p) => {
        const matchId = p.matchId as string | undefined;
        return matchId && hasResult.get(matchId) === true;
      },
    );
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
