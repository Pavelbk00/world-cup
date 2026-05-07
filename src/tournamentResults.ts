import type { MedalistsPrediction, PlayoffPrediction } from "./types";

/** Фактические результаты матчей плей-офф для бонуса за проход. */
export const PLAYOFF_RESULTS: PlayoffPrediction[] = [];

/** Официальный обладатель "Золотой бутсы" ФИФА. */
export const GOLDEN_BOOT_WINNER: string | null = null;

/** Голы игроков на турнире (без пенальти в послематчевых сериях). */
export const PLAYER_GOALS: Record<string, number> = {};

/** Фактические призеры турнира. */
export const MEDALISTS_RESULT: MedalistsPrediction | null = null;
