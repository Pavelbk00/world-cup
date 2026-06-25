import type { MatchDef } from "./types";
import matchesData from "../data/matches.json";

/**
 * Каталог матчей: хэш-таблица (matchId → MatchDef) для O(1) доступа.
 * Данные загружаются из data/matches.json.
 */
export const MATCHES_MAP: Record<string, MatchDef> = matchesData as Record<
  string,
  MatchDef
>;

/** Упорядоченный список матчей (для итераций, рендера и т.д.) */
export const MATCHES_LIST: MatchDef[] = Object.values(MATCHES_MAP);

/** Множество всех допустимых matchId */
export const MATCH_IDS = new Set<string>(Object.keys(MATCHES_MAP));
