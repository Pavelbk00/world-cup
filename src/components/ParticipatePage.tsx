import { useState } from "react";
import type {
  MatchId,
  MedalistsPrediction,
  PlayerState,
  MatchDef,
  ScoreDraftEntry,
} from "../types";
import { MATCHES_LIST } from "../matches";
import {
  isMatchFinished,
  isMatchPredictable,
  isPlayoffPhase,
} from "../matchUtils";
import { getCurrentUser } from "../auth";

/** Парсит "DD.MM.YYYY HH:MM" в число для сравнения */
function matchDateTimeToMs(dateStr: string, timeStr: string): number {
  const [day, month, year] = dateStr.split(".").map(Number);
  const [hours, minutes] = timeStr.split(":").map(Number);
  return new Date(year, month - 1, day, hours, minutes).getTime();
}

/** Матчи, отсортированные по дате/времени (константа, вычисляется один раз) */
const SORTED_MATCHES: MatchDef[] = (() => {
  const sorted = [...MATCHES_LIST];
  sorted.sort((a, b) => {
    const aMs = matchDateTimeToMs(a.date, a.time);
    const bMs = matchDateTimeToMs(b.date, b.time);
    return aMs - bMs;
  });
  return sorted;
})();

/** Все уникальные команды группового этапа (не заглушки) для выбора призёров */
const ALL_TEAMS: string[] = (() => {
  const set = new Set<string>();
  for (const m of MATCHES_LIST) {
    if (m.isPlaceholder) continue;
    set.add(m.homeTeam);
    set.add(m.awayTeam);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "ru"));
})();

/** Дата и время первого матча турнира */
const FIRST_MATCH = (() => {
  const first = MATCHES_LIST.find((m) => !m.isPlaceholder);
  if (!first) return new Date(0);
  const [day, month, year] = first.date.split(".").map(Number);
  const [hours, minutes] = first.time.split(":").map(Number);
  return new Date(year, month - 1, day, hours, minutes);
})();

interface ParticipatePageProps {
  player: PlayerState;
  scoreDraft: Record<MatchId, ScoreDraftEntry>;
  onScoreChange: (matchId: string, home: string, away: string) => void;
  onWinnerChange: (matchId: string, winner: string) => void;
  onMethodChange: (matchId: string, method: ScoreDraftEntry["method"]) => void;
  medalistsDraft: MedalistsPrediction;
  onMedalistsChange: (m: MedalistsPrediction) => void;
  topScorerDraft: string;
  onTopScorerChange: (v: string) => void;
  onSave: () => void;
  saveStatus: "idle" | "saving" | "saved" | "error";
}

export function ParticipatePage({
  player,
  scoreDraft,
  onScoreChange,
  onWinnerChange,
  onMethodChange,
  medalistsDraft,
  onMedalistsChange,
  topScorerDraft,
  onTopScorerChange,
  onSave,
  saveStatus,
}: ParticipatePageProps) {
  /** Показывать ли матчи группового этапа (по умолчанию скрыты) */
  const [showGroupStage, setShowGroupStage] = useState(false);

  /** Проверяет, начался ли первый матч турнира (блокировка выбора призёров и бомбардира) */
  const isFirstMatchStarted = Date.now() >= FIRST_MATCH.getTime();

  /** Матчи для отображения: плей-офф всегда, групповой этап — только если включён фильтр */
  const visibleMatches = showGroupStage
    ? SORTED_MATCHES
    : SORTED_MATCHES.filter(
        (m) => !m.phase.trim().toLowerCase().startsWith("группа"),
      );

  // Имя: приоритет из загруженных данных, fallback на nickname из авторизации
  const displayName =
    player.name?.trim() || getCurrentUser()?.nickname || player.login || "";

  /** Есть ли хотя бы один заполненный счёт в матчах */
  const hasAnyScore = Object.values(scoreDraft).some(
    (s) => s.h !== "" && s.a !== "",
  );

  /** Есть ли незавершённые ничьи в плей-офф (счёт указан, но не выбран победитель или способ) */
  const hasIncompletePlayoffDraws = SORTED_MATCHES.filter(
    (m) =>
      isPlayoffPhase(m.phase) && isMatchPredictable(m) && !isMatchFinished(m),
  ).some((m) => {
    const d = scoreDraft[m.id];
    return (
      d && d.h !== "" && d.a !== "" && d.h === d.a && (!d.winner || !d.method)
    );
  });

  const canSave = hasAnyScore && !hasIncompletePlayoffDraws;

  return (
    <section className="panel participate-panel" style={{ maxWidth: "800px" }}>
      <div className="panel-head">
        <h2>Ваши прогнозы</h2>
      </div>
      <div className="participate-fields">
        <div className="participate-name-static">
          <span className="participate-label-text">Ваше имя</span>
          <span className="participate-name-value">{displayName}</span>
        </div>
        <div className="save-row">
          {saveStatus === "saved" ? (
            <span className="btn btn-primary save-success">✓ Сохранено</span>
          ) : saveStatus === "error" ? (
            <span className="btn btn-danger save-error">Ошибка сохранения</span>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={onSave}
              disabled={saveStatus === "saving" || !canSave}
            >
              {saveStatus === "saving" ? "Сохранение..." : "Сохранить"}
            </button>
          )}
          {!hasAnyScore && saveStatus !== "saved" && saveStatus !== "error" && (
            <span
              className="hint"
              style={{ display: "block", marginTop: "6px" }}
            >
              Укажите счёт хотя бы в одном матче, чтобы сохранить прогноз
            </span>
          )}
          {hasIncompletePlayoffDraws && (
            <span
              className="hint"
              style={{ display: "block", marginTop: "6px", color: "#e65100" }}
            >
              Для ничейных матчей плей-офф укажите победителя и способ
            </span>
          )}
        </div>
      </div>

      {/* Фильтр: показывать групповой этап */}
      <div className="participate-filter">
        <label className="participate-filter-label">
          <input
            type="checkbox"
            checked={showGroupStage}
            onChange={(e) => setShowGroupStage(e.target.checked)}
          />
          Показать групповой этап
        </label>
      </div>

      {/* Сначала матчи */}
      <div className="participate-matches">
        {visibleMatches.map((m) => {
          const d = scoreDraft[m.id] ?? { h: "", a: "" };
          const isDrawPlayoff =
            isPlayoffPhase(m.phase) &&
            isMatchPredictable(m) &&
            d.h !== "" &&
            d.a !== "" &&
            d.h === d.a;
          return (
            <div key={m.id} className="match-row">
              <div className="match-meta">
                <div className="match-phase">{m.phase}</div>
                <div className="match-teams">
                  <span>{m.homeTeam}</span>
                  <span className="vs"> — </span>
                  <span>{m.awayTeam}</span>
                </div>
                <div className="hint" style={{ margin: 0 }}>
                  {m.date} {m.time}
                </div>
              </div>
              <div className="score-inputs">
                {!isMatchPredictable(m) ? (
                  <span
                    className="score-disabled"
                    title="Команды ещё не известны"
                  >
                    — : —
                  </span>
                ) : isMatchFinished(m) ? (
                  <>
                    <span className="score-display">{d.h}</span>
                    <span>:</span>
                    <span className="score-display">{d.a}</span>
                    <span className="finished-icon" title="Матч завершён">
                      🔒
                    </span>
                  </>
                ) : (
                  <>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={2}
                      aria-label={`Голы ${m.homeTeam}`}
                      value={d.h}
                      onChange={(e) => {
                        const v = e.target.value.replace(/\D/g, "");
                        onScoreChange(m.id, v, d.a);
                      }}
                    />
                    <span>:</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={2}
                      aria-label={`Голы ${m.awayTeam}`}
                      value={d.a}
                      onChange={(e) => {
                        const v = e.target.value.replace(/\D/g, "");
                        onScoreChange(m.id, d.h, v);
                      }}
                    />
                  </>
                )}
              </div>
              {/* Для плей-офф при ничейном счёте — выбор победителя и способа */}
              {isDrawPlayoff && (
                <div className="playoff-prediction">
                  <label className="playoff-winner-label">
                    Победитель:
                    <select
                      value={d.winner ?? ""}
                      onChange={(e) => onWinnerChange(m.id, e.target.value)}
                      className="playoff-select"
                    >
                      <option value="">— выберите —</option>
                      <option value={m.homeTeam}>{m.homeTeam}</option>
                      <option value={m.awayTeam}>{m.awayTeam}</option>
                    </select>
                  </label>
                  <label className="playoff-method-label">
                    Способ:
                    <select
                      value={d.method ?? ""}
                      onChange={(e) =>
                        onMethodChange(
                          m.id,
                          e.target.value as ScoreDraftEntry["method"],
                        )
                      }
                      className="playoff-select"
                    >
                      <option value="">— выберите —</option>
                      <option value="extraTime">Дополнительное время</option>
                      <option value="penalties">Серия пенальти</option>
                    </select>
                  </label>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Призёры и бомбардир после матчей */}
      <div className="tournament-picks-section">
        <h3>Призёры турнира</h3>
        <p className="hint tournament-picks-hint">
          🔒 Прогноз принимается строго до первого матча турнира — после старта
          изменить выбор нельзя
        </p>
        <div className="medalists-grid">
          <label className="medalist-field">
            <span className="medalist-label-line">
              <span className="medal-icon">🥇</span>
              <span>Чемпион</span>
            </span>
            {isFirstMatchStarted ? (
              <span className="medalist-value">
                {medalistsDraft.gold ? medalistsDraft.gold : "— не указан —"}
              </span>
            ) : (
              <select
                value={medalistsDraft.gold}
                onChange={(e) =>
                  onMedalistsChange({ ...medalistsDraft, gold: e.target.value })
                }
              >
                <option value="">— выберите —</option>
                {ALL_TEAMS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            )}
          </label>
          <label className="medalist-field">
            <span className="medalist-label-line">
              <span className="medal-icon">🥈</span>
              <span>Финалист</span>
            </span>
            {isFirstMatchStarted ? (
              <span className="medalist-value">
                {medalistsDraft.silver
                  ? medalistsDraft.silver
                  : "— не указан —"}
              </span>
            ) : (
              <select
                value={medalistsDraft.silver}
                onChange={(e) =>
                  onMedalistsChange({
                    ...medalistsDraft,
                    silver: e.target.value,
                  })
                }
              >
                <option value="">— выберите —</option>
                {ALL_TEAMS.filter((t) => t !== medalistsDraft.gold).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            )}
          </label>
          <label className="medalist-field">
            <span className="medalist-label-line">
              <span className="medal-icon">🥉</span>
              <span>3-е место</span>
            </span>
            {isFirstMatchStarted ? (
              <span className="medalist-value">
                {medalistsDraft.bronze
                  ? medalistsDraft.bronze
                  : "— не указан —"}
              </span>
            ) : (
              <select
                value={medalistsDraft.bronze}
                onChange={(e) =>
                  onMedalistsChange({
                    ...medalistsDraft,
                    bronze: e.target.value,
                  })
                }
              >
                <option value="">— выберите —</option>
                {ALL_TEAMS.filter(
                  (t) =>
                    t !== medalistsDraft.gold && t !== medalistsDraft.silver,
                ).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            )}
          </label>
        </div>

        <h3>Лучший бомбардир</h3>
        <div className="top-scorer-field">
          {isFirstMatchStarted ? (
            <span className="medalist-value">
              {topScorerDraft || "— не указан —"}
            </span>
          ) : (
            <input
              type="text"
              placeholder="Фамилия футболиста"
              value={topScorerDraft}
              onChange={(e) => onTopScorerChange(e.target.value)}
              className="top-scorer-input"
            />
          )}
        </div>
        {isFirstMatchStarted && (
          <p className="hint tournament-picks-locked">
            🔒 Первый матч уже начался — выбор призёров и бомбардира
            заблокирован
          </p>
        )}
      </div>
    </section>
  );
}
