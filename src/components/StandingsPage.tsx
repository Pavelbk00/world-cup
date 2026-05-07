interface StandingsPageProps {
  standingsByPlayerId: Array<{
    key: string;
    name: string;
    hasValidData: boolean;
    byTier: { t3: number; t2: number; t1: number; t0: number };
    matchPoints: number;
    groupStagePoints: number;
    playoffBonusPoints: number;
    topScorerPoints: number;
    medalistPoints: number;
    total: number;
  }>;
  onSelectPlayer: (playerId: string) => void;
}

export function StandingsPage({
  standingsByPlayerId,
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
              <th style={{textAlign: 'left'}}>#</th>
              <th style={{textAlign: 'left'}}>Игрок</th>
              <th className="num">Счёт</th>
              <th className="num">Разница</th>
              <th className="num">Исход</th>
              <th className="num">Матчи</th>
              <th className="num">Группы</th>
              <th className="num">Плей-офф</th>
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
                <td className="num">{row.byTier.t3}</td>
                <td className="num">{row.byTier.t2}</td>
                <td className="num">{row.byTier.t1}</td>
                <td className="num">{row.matchPoints}</td>
                <td className="num">{row.groupStagePoints}</td>
                <td className="num">{row.playoffBonusPoints}</td>
                <td className="num">{row.topScorerPoints}</td>
                <td className="num">{row.medalistPoints}</td>
                <td className="total">{row.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}