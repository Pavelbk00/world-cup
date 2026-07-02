/** Идентификатор матча из каталога турнира */
export type MatchId = string;

export interface MatchDef {
  id: MatchId;
  /** Дата матча (календарь) */
  date: string;
  /** Время начала матча (МСК) */
  time: string;
  /** Название хозяев (условно первая команда) */
  homeTeam: string;
  /** Гости */
  awayTeam: string;
  /** Фаза / группа для отображения */
  phase: string;
  /**
   * Если true — матч плей-офф, команды ещё не известны (заглушка).
   * Редактирование прогнозов разрешено всегда.
   */
  isPlaceholder?: boolean;
}

/** Фактический или прогнозируемый счёт */
export interface Score {
  home: number;
  away: number;
}

export type PlayoffWinMethod = "regular" | "extraTime" | "penalties";

export interface PlayerPrediction {
  home: number;
  away: number;
  /** Для ничейных матчей плей-офф — прогнозируемый победитель */
  winner?: string;
  /** Для ничейных матчей плей-офф — способ определения победителя */
  method?: PlayoffWinMethod;
}

export interface GroupStandingPrediction {
  group: string;
  first: string;
  second: string;
  third?: string;
  fourth?: string;
}

export interface MedalistsPrediction {
  gold: string;
  silver: string;
  bronze: string;
}

/** Формат JSON одного игрока (predictions — хэш-таблица matchId → счёт) */
export interface PlayerJson {
  player: string;
  predictions: Record<MatchId, PlayerPrediction>;
  groupStandings?: GroupStandingPrediction[];
  topScorer?: string;
  medalists?: MedalistsPrediction;
}

export interface PlayerState {
  id: string;
  login?: string;
  name: string;
  predictions: Map<MatchId, PlayerPrediction>;
  groupStandings: GroupStandingPrediction[];
  topScorer: string | null;
  medalists: MedalistsPrediction | null;
  rawJson: string;
  parseError: string | null;
}

export interface MatchResultState {
  def: MatchDef;
  /** Строки полей ввода; итог для подсчёта — только если оба поля — неотрицательные целые */
  homeInput: string;
  awayInput: string;
}

/** Сводка по одному игроку после подсчёта */
export interface PlayerScoreRow {
  playerId: string;
  name: string;
  /** Сколько матчей с 3 / 2 / 1 / 0 очками */
  byTier: { t3: number; t2: number; t1: number; t0: number };
  /** Очки за угаданные команды в 1/16 финала */
  groupStagePoints: number;
  /** Очки за способ победы в плей-офф */
  playoffBonusPoints: number;
  /** Очки за угаданный проход команды в следующую стадию */
  advancementPoints: number;
  /** Очки за лучшего бомбардира */
  topScorerPoints: number;
  /** Очки за призеров турнира */
  medalistPoints: number;
  total: number;
}

/** Расширенная запись для draft-состояния на форме прогнозов */
export interface ScoreDraftEntry {
  h: string;
  a: string;
  winner?: string;
  method?: PlayoffWinMethod;
}
