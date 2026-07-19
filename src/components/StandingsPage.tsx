import type { PlayerState } from "../types";
import { TOURNAMENT_RESULTS } from "../tournamentResults";

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

interface StandingsRow {
  key: string;
  name: string;
  hasValidData: boolean;
  byTier: { t3: number; t2: number; t1: number; t0: number };
  groupStagePoints: number;
  playoffBonusPoints: number;
  advancementPoints: number;
  topScorerPoints: number;
  medalistPoints: number;
  total: number;
}

interface StandingsPageProps {
  standingsByPlayerId: StandingsRow[];
  players: PlayerState[];
  isTournamentFinished: boolean;
  lastFinishedMatchLabel: string | null;
  onSelectPlayer: (playerId: string) => void;
}

export function StandingsPage({
  standingsByPlayerId,
  players,
  isTournamentFinished,
  lastFinishedMatchLabel,
  onSelectPlayer,
}: StandingsPageProps) {
  const playerMap = new Map(players.map((p) => [p.id, p]));

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <h2>Итоговая таблица</h2>
        </div>
        <div className="table-wrap">
          <table className="standings">
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>#</th>
                <th style={{ textAlign: "left" }}>Игрок</th>
                <th className="num">Точный счёт (3)</th>
                <th className="num">Разница (2)</th>
                <th className="num">Исход (1)</th>
                <th className="num">Группы</th>
                <th className="num">Способ</th>
                <th className="num">Проход</th>
                {isTournamentFinished && <th className="num">Бомбардир</th>}
                {isTournamentFinished && <th className="num">Призёры</th>}
                <th>Очки</th>
              </tr>
            </thead>
            <tbody>
              {standingsByPlayerId.map((row, idx) => (
                <tr key={row.key}>
                  <td className="place">{idx + 1}</td>
                  <td>
                    {row.hasValidData ? (
                      <button
                        type="button"
                        className="btn btn-link"
                        onClick={() => onSelectPlayer(row.key)}
                      >
                        {row.name}
                      </button>
                    ) : (
                      row.name
                    )}
                  </td>
                  <td className="num">{row.byTier.t3 * 3}</td>
                  <td className="num">{row.byTier.t2 * 2}</td>
                  <td className="num">{row.byTier.t1}</td>
                  <td className="num">{row.groupStagePoints}</td>
                  <td className="num">{row.playoffBonusPoints}</td>
                  <td className="num">{row.advancementPoints}</td>
                  {isTournamentFinished && (
                    <td className="num">{row.topScorerPoints}</td>
                  )}
                  {isTournamentFinished && (
                    <td className="num">{row.medalistPoints}</td>
                  )}
                  <td className="total">{row.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {lastFinishedMatchLabel && (
            <p
              className="hint"
              style={{ marginTop: "0.5rem", textAlign: "center" }}
            >
              Последний сыгранный матч: {lastFinishedMatchLabel}
            </p>
          )}
        </div>
      </section>

      {isTournamentFinished && (
        <section className="panel" style={{ marginTop: "1rem" }}>
          <div className="panel-head">
            <h2>Долгосрочные прогнозы</h2>
          </div>
          <div className="table-wrap">
            <table className="standings">
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Игрок</th>
                  <th style={{ textAlign: "left" }}>Бомбардир</th>
                  <th style={{ textAlign: "left" }}>1 место 🥇</th>
                  <th style={{ textAlign: "left" }}>2 место 🥈</th>
                  <th style={{ textAlign: "left" }}>3 место 🥉</th>
                </tr>
              </thead>
              <tbody>
                {standingsByPlayerId.map((row) => {
                  const p = playerMap.get(row.key);
                  return (
                    <tr key={row.key}>
                      <td>{row.name}</td>
                      <td>{p?.topScorer || "—"}</td>
                      {(() => {
                        const predicted = p?.medalists?.gold || "";
                        const actual =
                          TOURNAMENT_RESULTS.medalistsResult?.gold ?? "";
                        const correct =
                          predicted &&
                          actual &&
                          normalizeName(predicted) === normalizeName(actual);
                        return (
                          <td
                            style={
                              predicted
                                ? { color: correct ? "#4ade80" : "#f87171" }
                                : {}
                            }
                          >
                            {predicted || "—"}
                          </td>
                        );
                      })()}
                      {(() => {
                        const predicted = p?.medalists?.silver || "";
                        const actual =
                          TOURNAMENT_RESULTS.medalistsResult?.silver ?? "";
                        const correct =
                          predicted &&
                          actual &&
                          normalizeName(predicted) === normalizeName(actual);
                        return (
                          <td
                            style={
                              predicted
                                ? { color: correct ? "#4ade80" : "#f87171" }
                                : {}
                            }
                          >
                            {predicted || "—"}
                          </td>
                        );
                      })()}
                      {(() => {
                        const predicted = p?.medalists?.bronze || "";
                        const actual =
                          TOURNAMENT_RESULTS.medalistsResult?.bronze ?? "";
                        const correct =
                          predicted &&
                          actual &&
                          normalizeName(predicted) === normalizeName(actual);
                        return (
                          <td
                            style={
                              predicted
                                ? { color: correct ? "#4ade80" : "#f87171" }
                                : {}
                            }
                          >
                            {predicted || "—"}
                          </td>
                        );
                      })()}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
