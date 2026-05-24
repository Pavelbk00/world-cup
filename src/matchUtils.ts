import type { MatchDef } from "./types";

/**
 * Проверяет, начался ли матч.
 * Если матч — заглушка (плей-офф, команды ещё не известны),
 * редактирование не блокируется.
 */
export function isMatchFinished(m: MatchDef): boolean {
  // Заглушки (матчи плей-офф без известных команд) не блокируем
  if (m.isPlaceholder) return false;

  const dateStr = m.date; // "DD.MM.YYYY"
  const timeStr = m.time; // "HH:MM"
  const [day, month, year] = dateStr.split(".").map(Number);
  const [hours, minutes] = timeStr.split(":").map(Number);
  const matchStart = new Date(year, month - 1, day, hours, minutes);
  return Date.now() >= matchStart.getTime();
}

/**
 * Возвращает true, если фаза является плей-офф (не группа).
 */
const PLAYOFF_PATTERNS = [
  /^1\/\d+\s+финала$/i,
  /^матч за 3-е место$/i,
  /^финал/i,
  /^полуфинал/i,
  /^четвертьфинал/i,
];

export function isPlayoffPhase(phase: string): boolean {
  const lower = phase.trim().toLowerCase();
  if (lower.startsWith("групп")) return false;
  return PLAYOFF_PATTERNS.some((p) => p.test(phase));
}

/**
 * Можно ли делать прогноз на матч?
 * Возвращает false для матчей-заглушек (команды ещё не известны).
 */
export function isMatchPredictable(m: MatchDef): boolean {
  return !m.isPlaceholder;
}