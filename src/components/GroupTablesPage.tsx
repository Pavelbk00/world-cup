import { useEffect, useState } from "react";
import type { PlayerState } from "../types";
import {
  loadGroupResults,
  loadPlayerGroupResults,
  type GroupResultData,
  type GroupResultTableRow,
} from "../utils/api";

const GROUP_ORDER = [
  "Группа A",
  "Группа B",
  "Группа C",
  "Группа D",
  "Группа E",
  "Группа F",
  "Группа G",
  "Группа H",
  "Группа I",
  "Группа J",
  "Группа K",
  "Группа L",
];

function sortedGroups(groups: Record<string, GroupResultTableRow[]>) {
  return GROUP_ORDER.filter((g) => groups[g]).map(
    (g) => [g, groups[g]] as const,
  );
}

function totalGroupPoints(data: GroupResultData | null): number {
  if (!data) return 0;
  if (data.totalGroupStagePoints != null) return data.totalGroupStagePoints;
  let sum = 0;
  for (const rows of Object.values(data.groups)) {
    for (const r of rows) sum += r.group_points;
  }
  return sum;
}

interface GroupTablesPageProps {
  selectedPlayer: PlayerState | null;
  activePlayers: PlayerState[];
  selectedPlayerId: string | null;
  onPlayerSelect: (id: string | null) => void;
  /** Логин текущего пользователя (для определения прав доступа) */
  currentUserLogin?: string;
}

export function GroupTablesPage({
  selectedPlayer,
  activePlayers,
  selectedPlayerId,
  onPlayerSelect,
  currentUserLogin,
}: GroupTablesPageProps) {
  const [realData, setRealData] = useState<GroupResultData | null>(null);
  const [playerData, setPlayerData] = useState<GroupResultData | null>(null);
  const [loading, setLoading] = useState(false);
  const [showReal, setShowReal] = useState(false);

  const isPavel = currentUserLogin === "pavel";
  const isOwner = selectedPlayer?.login === currentUserLogin || isPavel;

  useEffect(() => {
    loadGroupResults().then(setRealData);
  }, []);

  useEffect(() => {
    if (!selectedPlayer?.login) {
      setPlayerData(null);
      return;
    }
    setLoading(true);
    loadPlayerGroupResults(selectedPlayer.login)
      .then(setPlayerData)
      .finally(() => setLoading(false));
  }, [selectedPlayer?.login]);

  const realGroups = sortedGroups(realData?.groups ?? {});
  const realThird = realData?.thirdPlaceTable ?? [];
  const playerThird = playerData?.thirdPlaceTable ?? [];
  const hasData = realGroups.length > 0;

  const realQualifiedThirds = new Set(
    realThird
      .filter((r) => r.played >= 3)
      .slice(0, 8)
      .map((r) => r.team),
  );

  const playerQualifiedThirds = new Set(
    playerThird
      .filter((r) => r.played >= 3)
      .slice(0, 8)
      .map((r) => r.team),
  );

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Таблицы групп</h2>
      </div>
      <div className="toolbar">
        <label className="hint" style={{ margin: 0 }}>
          Игрок:
        </label>
        <select
          value={selectedPlayerId ?? ""}
          onChange={(e) => onPlayerSelect(e.target.value || null)}
        >
          <option value="">Выберите игрока</option>
          {activePlayers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {hasData && (
          <label
            className="btn btn-ghost"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              cursor: "pointer",
              fontSize: "0.82rem",
            }}
          >
            <input
              type="checkbox"
              checked={showReal}
              onChange={(e) => setShowReal(e.target.checked)}
              style={{ margin: 0 }}
            />
            Реальные результаты
          </label>
        )}
      </div>

      {!hasData ? (
        <p className="hint" style={{ textAlign: "center", marginTop: "2rem" }}>
          Данных о групповом этапе пока нет.
        </p>
      ) : !selectedPlayer ? (
        showReal ? (
          <>
            <div className="group-tables-grid">
              {realGroups.map(([groupName, rows]) => (
                <GroupTable
                  key={groupName}
                  groupName={groupName}
                  rows={rows}
                  qualifiedThirds={realQualifiedThirds}
                />
              ))}
            </div>
            {realThird.length > 0 && <ThirdPlaceTable rows={realThird} />}
          </>
        ) : (
          <p
            className="hint"
            style={{ textAlign: "center", marginTop: "2rem" }}
          >
            Выберите игрока или включите «Реальные результаты».
          </p>
        )
      ) : !isOwner ? (
        <div style={{ textAlign: "center", marginTop: "2rem" }}>
          <p className="hint">
            🔒 Таблицы прогнозов игрока {selectedPlayer.name} доступны только
            владельцу.
          </p>
        </div>
      ) : loading ? (
        <div style={{ textAlign: "center", marginTop: "2rem" }}>
          <div className="spinner" />
          <p className="loading-text">Загрузка...</p>
        </div>
      ) : !playerData ? (
        <p className="hint" style={{ textAlign: "center", marginTop: "2rem" }}>
          Данных по прогнозам этого игрока пока нет.
        </p>
      ) : (
        <>
          <div style={{ textAlign: "center", marginBottom: "1rem" }}>
            <span className="hint">
              Итого за групповой этап:{" "}
              <strong>{totalGroupPoints(playerData)}</strong> очков
            </span>
          </div>

          <div className="group-tables-grid">
            {realGroups.map(([groupName, realRows]) => {
              const predRows = playerData.groups[groupName];
              return (
                <div
                  key={groupName}
                  style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}
                >
                  {showReal && (
                    <GroupTable
                      groupName={groupName}
                      rows={realRows}
                      label="Реальные данные"
                      qualifiedThirds={realQualifiedThirds}
                    />
                  )}
                  {predRows && (
                    <GroupTable
                      groupName={groupName}
                      rows={predRows}
                      label={selectedPlayer.name}
                      showGroupPoints
                      isPrediction
                      qualifiedThirds={playerQualifiedThirds}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
            {showReal && realThird.length > 0 && (
              <ThirdPlaceTable rows={realThird} label="Реальные данные" />
            )}
            {playerThird.length > 0 && (
              <ThirdPlaceTable
                rows={playerThird}
                label={selectedPlayer.name}
                showGroupPoints
                isPrediction
              />
            )}
          </div>
        </>
      )}
    </section>
  );
}

function GroupTable({
  groupName,
  rows,
  label,
  showGroupPoints,
  isPrediction,
  qualifiedThirds,
}: {
  groupName: string;
  rows: GroupResultTableRow[];
  label?: string;
  showGroupPoints?: boolean;
  isPrediction?: boolean;
  qualifiedThirds?: Set<string>;
}) {
  const colCount = 1 + (showGroupPoints ? 1 : 0);
  return (
    <div
      className={`table-wrap ${isPrediction ? "prediction-table" : "real-table"}`}
      style={{ flex: "1 1 440px", minWidth: 440 }}
    >
      <table className="standings">
        <thead>
          <tr>
            <th colSpan={11 + colCount}>
              {groupName}
              {label ? <span className="group-points"> — {label}</span> : null}
            </th>
          </tr>
          <tr>
            <th style={{ textAlign: "left" }}>#</th>
            <th style={{ textAlign: "left" }}>Команда</th>
            <th className="num" title="Игры">
              И
            </th>
            <th className="num" title="Выигрыш">
              В
            </th>
            <th className="num" title="Ничья">
              Н
            </th>
            <th className="num" title="Поражения">
              П
            </th>
            <th className="num" title="Забито">
              ЗМ
            </th>
            <th className="num" title="Пропущено">
              ПМ
            </th>
            <th className="num" title="Разница">
              РМ
            </th>
            <th className="num" title="Очки">
              О
            </th>
            <th className="num" title="Фейр-плей">
              ФЧ
            </th>
            {showGroupPoints && (
              <th className="num" title="Очки за группу">
                ОГ
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.team}
              className={
                row.place <= 2 ||
                (row.place === 3 && qualifiedThirds?.has(row.team))
                  ? "team-advancing"
                  : undefined
              }
            >
              <td className="place">{row.place}</td>
              <td>{row.team}</td>
              <td className="num">{row.played}</td>
              <td className="num">{row.wins}</td>
              <td className="num">{row.draws}</td>
              <td className="num">{row.losses}</td>
              <td className="num">{row.gf}</td>
              <td className="num">{row.ga}</td>
              <td className="num">{row.gd}</td>
              <td className="total">{row.points}</td>
              <td className="num">{row.fair_play_score}</td>
              {showGroupPoints && (
                <td className={`num ${row.group_points > 0 ? "total" : ""}`}>
                  {row.group_points}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ThirdPlaceTable({
  rows,
  label,
  showGroupPoints,
  isPrediction,
}: {
  rows: Array<GroupResultTableRow & { group: string }>;
  label?: string;
  showGroupPoints?: boolean;
  isPrediction?: boolean;
}) {
  const advancingLimit = 8;
  return (
    <div
      className={`third-place-section ${isPrediction ? "prediction-table" : "real-table"}`}
      style={{ flex: "1 1 520px", minWidth: 520 }}
    >
      <h3>Таблица третьих мест{label ? ` — ${label}` : ""}</h3>
      <div className="table-wrap">
        <table className="standings third-place-table">
          <thead>
            <tr>
              <th>#</th>
              <th style={{ textAlign: "left" }}>Группа</th>
              <th style={{ textAlign: "left" }}>Команда</th>
              <th className="num">И</th>
              <th className="num">В</th>
              <th className="num">Н</th>
              <th className="num">П</th>
              <th className="num">ЗМ</th>
              <th className="num">ПМ</th>
              <th className="num">РМ</th>
              <th className="num">ФЧ</th>
              <th className="num">О</th>
              {showGroupPoints && <th className="num">ОГ</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr
                key={`${row.group}-${row.team}`}
                className={
                  idx < advancingLimit ? "team-advancing" : "team-eliminated"
                }
              >
                <td className="place">{idx + 1}</td>
                <td>{row.group}</td>
                <td>{row.team}</td>
                <td className="num">{row.played}</td>
                <td className="num">{row.wins}</td>
                <td className="num">{row.draws}</td>
                <td className="num">{row.losses}</td>
                <td className="num">{row.gf}</td>
                <td className="num">{row.ga}</td>
                <td className="num">{row.gd}</td>
                <td className="num">{row.fair_play_score}</td>
                <td className="total">{row.points}</td>
                {showGroupPoints && (
                  <td className={`num ${row.group_points > 0 ? "total" : ""}`}>
                    {row.group_points}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
