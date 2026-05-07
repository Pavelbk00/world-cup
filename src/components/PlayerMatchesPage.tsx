import { useMemo } from "react";
import type { MatchResultState, PlayerState, Score } from "../types";
import { resultFromState } from "../matchResultUtils";
import { pointsForSingleMatch } from "../scoring";

interface PlayerMatchRow {
  match: MatchResultState;
  pred: Score | undefined;
  actual: Score | null;
  points: number | null;
}

/** Парсит "DD.MM.YYYY HH:MM" в число для сравнения */
function matchDateTimeToMs(dateStr: string, timeStr: string): number {
  const [day, month, year] = dateStr.split(".").map(Number);
  const [hours, minutes] = timeStr.split(":").map(Number);
  return new Date(year, month - 1, day, hours, minutes).getTime();
}

interface PlayerMatchesPageProps {
  selectedPlayer: PlayerState;
  matches: MatchResultState[];
}

export function PlayerMatchesPage({
  selectedPlayer,
  matches,
}: PlayerMatchesPageProps) {
  const playerMatches: PlayerMatchRow[] = useMemo(() => {
    const rows = matches.map((m) => {
      const pred = selectedPlayer.predictions.get(m.def.id);
      const actual = resultFromState(m);
      const pointsData = pointsForSingleMatch(m.def.id, matches, pred);
      const points = pointsData?.points ?? null;
      return { match: m, pred, actual, points };
    });
    // Сортируем по дате/времени матча (возрастание)
    rows.sort((a, b) => {
      const aMs = matchDateTimeToMs(a.match.def.date, a.match.def.time);
      const bMs = matchDateTimeToMs(b.match.def.date, b.match.def.time);
      return aMs - bMs;
    });
    return rows;
  }, [matches, selectedPlayer]);

  const playerTotalPoints = playerMatches.reduce(
    (sum, row) => sum + (row.points ?? 0),
    0,
  );

  return (
    <section className="panel player-matches-section">
      <div className="panel-head">
        <h2>Прогнозы: {selectedPlayer.name}</h2>
      </div>
      <p className="hint player-matches-summary">
        Сумма очков по матчам: <strong>{playerTotalPoints}</strong>
      </p>
      <div className="table-wrap">
        <table className="standings player-matches-table">
          <thead>
            <tr>
              <th className="match-col">Матч</th>
              <th>Прогноз</th>
              <th>Фактический результат</th>
              <th>Очки</th>
            </tr>
          </thead>
          <tbody>
            {playerMatches.map(({ match, pred, actual, points }) => (
              <tr key={match.def.id}>
                <td>
                  <div className="match-phase">{match.def.phase}</div>
                  <div className="match-teams">
                    <span>{match.def.homeTeam}</span>
                    <span className="vs"> — </span>
                    <span>{match.def.awayTeam}</span>
                  </div>
                  <div className="hint match-datetime">
                    {match.def.date} {match.def.time}
                  </div>
                </td>
                <td className="num">
                  {pred ? `${pred.home}:${pred.away}` : "—"}
                </td>
                <td className="num">
                  {actual
                    ? `${actual.home}:${actual.away}`
                    : "нет результата"}
                </td>
                <td className="total">{points ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}