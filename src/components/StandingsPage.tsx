interface StandingsPageProps {
  standingsByPlayerId: Array<{
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
  }>;
  lastFinishedMatchLabel: string | null;
  onSelectPlayer: (playerId: string) => void;
}

export function StandingsPage({
  standingsByPlayerId,
  lastFinishedMatchLabel,
  onSelectPlayer,
}: StandingsPageProps) {
  return (
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
              <th className="num">Бомбардир</th>
              <th className="num">Призёры</th>
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
                <td className="num">{row.topScorerPoints}</td>
                <td className="num">{row.medalistPoints}</td>
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
  );
}
