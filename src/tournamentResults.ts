import type { MedalistsPrediction, PlayerPrediction } from "./types";

/** Фактические результаты матчей плей-офф для бонуса за проход (хэш-таблица matchId -> результат). */
export const PLAYOFF_RESULTS: Record<string, PlayerPrediction & { winner: string; method: "regular" | "extraTime" | "penalties" }> = {};

/** Официальный обладатель "Золотой бутсы" ФИФА. */
export const GOLDEN_BOOT_WINNER: string | null = null;

/** Голы игроков на турнире (без пенальти в послематчевых сериях). */
export const PLAYER_GOALS: Record<string, number> = {};

/** Фактические призеры турнира. */
export const MEDALISTS_RESULT: MedalistsPrediction | null = null;