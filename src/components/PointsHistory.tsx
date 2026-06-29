import { useEffect, useState } from "react";
import { loadPointsHistory, type PointsHistoryRow } from "../utils/api";

interface PointsHistoryProps {
  currentUserLogin?: string;
}

export function PointsHistory({ currentUserLogin }: PointsHistoryProps) {
  const [history, setHistory] = useState<PointsHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlyMine, setOnlyMine] = useState(false);
  const [includeZero, setIncludeZero] = useState(false);

  useEffect(() => {
    (async () => {
      const data = await loadPointsHistory(includeZero);
      setHistory(data);
      setLoading(false);
    })();
  }, [includeZero]);

  const displayedHistory =
    onlyMine && currentUserLogin
      ? history
          .map((row) => ({
            ...row,
            entries: row.entries.filter((e) => e.login === currentUserLogin),
          }))
          .filter((row) => row.entries.length > 0)
      : history;

  if (loading) {
    return (
      <section className="panel">
        <div className="loading-container">
          <div className="spinner" />
          <p className="loading-text">Загрузка истории...</p>
        </div>
      </section>
    );
  }

  if (history.length === 0) {
    return (
      <section className="panel">
        <div className="panel-head">
          <h2>История начислений</h2>
        </div>
        <p className="hint" style={{ textAlign: "center", marginTop: "2rem" }}>
          Пока нет матчей с начисленными очками.
        </p>
      </section>
    );
  }

  return (
    <section className="panel points-history-section">
      <div className="panel-head ph-head">
        <h2>История начислений</h2>
        <div className="ph-head-actions">
          <button
            type="button"
            className={`btn ph-btn ${includeZero ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setIncludeZero((v) => !v)}
          >
            {includeZero ? "Только успешные" : "Все результаты"}
          </button>
          {currentUserLogin && (
            <button
              type="button"
              className={`btn ph-btn ${onlyMine ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setOnlyMine((v) => !v)}
            >
              {onlyMine ? "Все игроки" : "Только мои"}
            </button>
          )}
        </div>
      </div>
      {displayedHistory.length === 0 ? (
        <p className="hint" style={{ textAlign: "center", marginTop: "2rem" }}>
          У вас пока нет начислений.
        </p>
      ) : (
        <div className="ph-cards">
          {displayedHistory.map((row) => (
            <div key={row.matchId} className="ph-card">
              <div className="ph-card-header">
                <div className="ph-card-match">
                  <span className="ph-card-teams">
                    {row.homeTeam} — {row.awayTeam}
                  </span>
                  <span className="ph-card-date">
                    {row.date.replace(/\.\d{4}$/, "")}
                  </span>
                </div>
                <div className="ph-card-score">
                  Итог: {row.actualHome}:{row.actualAway}
                  {row.actualHome === row.actualAway &&
                    row.playoffWinner &&
                    row.playoffMethod && (
                      <span className="ph-card-playoff">
                        {" "}
                        (Победитель: {row.playoffWinner},{" "}
                        {row.playoffMethod === "penalties"
                          ? "по пенальти"
                          : "в доп. время"}
                        )
                      </span>
                    )}
                </div>
              </div>
              <div className="ph-card-entries">
                {row.entries.map((e) => (
                  <div key={`${row.matchId}-${e.login}`} className="ph-entry">
                    <span className="ph-entry-name">{e.player}</span>
                    <span className="ph-entry-pred">
                      прогноз {e.predHome}:{e.predAway}
                      {e.predWinner && e.predHome === e.predAway && (
                        <span className="ph-entry-pred-playoff">
                          {" "}
                          (Победитель: {e.predWinner},{" "}
                          {e.predMethod === "penalties"
                            ? "по пенальти"
                            : e.predMethod === "extraTime"
                              ? "в доп. время"
                              : "в осн. время"}
                          )
                        </span>
                      )}
                    </span>
                    <span className={`ph-entry-pts ph-pts-${e.points}`}>
                      <span>{e.points ? `+${e.points}` : e.points}</span>
                      {e.playoffBonus && (
                        <span className="ph-entry-pts-breakdown">
                          {e.points - e.playoffBonus} счет
                          {e.playoffMethod === "regular" && " + 1 осн. время"}
                          {e.playoffMethod === "extraTime" && " + 3 доп. время"}
                          {e.playoffMethod === "penalties" && " + 5 пенальти"}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
