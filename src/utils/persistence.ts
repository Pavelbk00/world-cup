import type { PlayerState } from "../types";
import { PLAYER_SLOTS } from "../parsePlayerJson";

export { PLAYER_SLOTS };

export function newPlayerId(): string {
  return crypto.randomUUID();
}

export function emptyPlayers(): PlayerState[] {
  return Array.from({ length: PLAYER_SLOTS }, () => ({
    id: newPlayerId(),
    name: "",
    predictions: new Map(),
    groupStandings: [],
    playoff: [],
    topScorer: null,
    medalists: null,
    rawJson: "",
    parseError: null,
  }));
}