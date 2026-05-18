import { resultFromState } from "../matchResultUtils";
import type { MatchResultState, PlayerState } from "../types";

export type GroupTableRow = {
  team: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
};

export type ThirdPlaceRow = GroupTableRow & {
  group: string;
};

/** Извлекает все команды каждой группы из определений матчей */
function buildGroupTeams(matches: MatchResultState[]): Map<string, string[]> {
  const groupTeams = new Map<string, Set<string>>();
  for (const m of matches) {
    if (!m.def.phase.toLowerCase().startsWith("группа")) continue;
    const group = m.def.phase;
    if (!groupTeams.has(group)) groupTeams.set(group, new Set());
    groupTeams.get(group)!.add(m.def.homeTeam);
    groupTeams.get(group)!.add(m.def.awayTeam);
  }
  const result = new Map<string, string[]>();
  for (const [group, teams] of groupTeams.entries()) {
    result.set(group, Array.from(teams));
  }
  return result;
}

function sortTableRows(rows: GroupTableRow[]): GroupTableRow[] {
  return rows
    .map((row) => ({ ...row, gd: row.gf - row.ga }))
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.gd - a.gd ||
        b.gf - a.gf ||
        a.team.localeCompare(b.team, "ru"),
    );
}

function buildPredictedGroupTables(
  player: PlayerState,
  matches: MatchResultState[],
): Map<string, GroupTableRow[]> {
  const groupTeams = buildGroupTeams(matches);

  // Инициализируем пустыми строками для всех команд во всех группах
  const groups = new Map<string, Map<string, GroupTableRow>>();
  for (const [group, teams] of groupTeams.entries()) {
    const table = new Map<string, GroupTableRow>();
    for (const team of teams) {
      table.set(team, {
        team,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        gf: 0,
        ga: 0,
        gd: 0,
        points: 0,
      });
    }
    groups.set(group, table);
  }

  // Заполняем прогнозами игрока
  for (const m of matches) {
    if (!m.def.phase.toLowerCase().startsWith("группа")) continue;
    const pred = player.predictions.get(m.def.id);
    if (!pred) continue;
    const group = m.def.phase;
    const table = groups.get(group);
    if (!table) continue;

    const home = table.get(m.def.homeTeam);
    const away = table.get(m.def.awayTeam);
    if (!home || !away) continue;

    home.played += 1;
    away.played += 1;
    home.gf += pred.home;
    home.ga += pred.away;
    away.gf += pred.away;
    away.ga += pred.home;

    if (pred.home > pred.away) {
      home.wins += 1;
      away.losses += 1;
      home.points += 3;
    } else if (pred.home < pred.away) {
      away.wins += 1;
      home.losses += 1;
      away.points += 3;
    } else {
      home.draws += 1;
      away.draws += 1;
      home.points += 1;
      away.points += 1;
    }
  }

  const result = new Map<string, GroupTableRow[]>();
  for (const [group, teamsMap] of groups.entries()) {
    result.set(group, sortTableRows(Array.from(teamsMap.values())));
  }
  return result;
}

function buildActualGroupTables(matches: MatchResultState[]): Map<string, GroupTableRow[]> {
  const groupTeams = buildGroupTeams(matches);

  const groups = new Map<string, Map<string, GroupTableRow>>();
  for (const [group, teams] of groupTeams.entries()) {
    const table = new Map<string, GroupTableRow>();
    for (const team of teams) {
      table.set(team, {
        team,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        gf: 0,
        ga: 0,
        gd: 0,
        points: 0,
      });
    }
    groups.set(group, table);
  }

  for (const m of matches) {
    if (!m.def.phase.toLowerCase().startsWith("группа")) continue;
    const res = resultFromState(m);
    if (!res) continue;
    const group = m.def.phase;
    const table = groups.get(group);
    if (!table) continue;

    const home = table.get(m.def.homeTeam);
    const away = table.get(m.def.awayTeam);
    if (!home || !away) continue;

    home.played += 1;
    away.played += 1;
    home.gf += res.home;
    home.ga += res.away;
    away.gf += res.away;
    away.ga += res.home;

    if (res.home > res.away) {
      home.wins += 1;
      away.losses += 1;
      home.points += 3;
    } else if (res.home < res.away) {
      away.wins += 1;
      home.losses += 1;
      away.points += 3;
    } else {
      home.draws += 1;
      away.draws += 1;
      home.points += 1;
      away.points += 1;
    }
  }

  const result = new Map<string, GroupTableRow[]>();
  for (const [group, teamsMap] of groups.entries()) {
    result.set(group, sortTableRows(Array.from(teamsMap.values())));
  }
  return result;
}

function isGroupFinished(groupName: string, actualTables: Map<string, GroupTableRow[]>): boolean {
  const rows = actualTables.get(groupName);
  if (!rows || rows.length === 0) return false;
  return rows.every((r) => r.played === 3);
}

function computeGroupPoints(
  player: PlayerState,
  actualTables: Map<string, GroupTableRow[]>,
): Map<string, number> {
  const groupPoints = new Map<string, number>();

  for (const gs of player.groupStandings) {
    const actualRows = actualTables.get(gs.group);
    if (!actualRows || actualRows.length === 0) {
      groupPoints.set(gs.group, 0);
      continue;
    }
    if (!isGroupFinished(gs.group, actualTables)) {
      groupPoints.set(gs.group, 0);
      continue;
    }

    const actualPlacement = actualRows.map((r) => r.team);
    const predictedByPlace: string[] = [];
    if (gs.first) predictedByPlace.push(gs.first);
    if (gs.second) predictedByPlace.push(gs.second);
    if (gs.third) predictedByPlace.push(gs.third);
    if (gs.fourth) predictedByPlace.push(gs.fourth);

    const qualifiedTeams = new Set(
      actualRows.slice(0, 2).map((r) => r.team.trim().toLowerCase()),
    );
    if (actualRows.length >= 3) {
      qualifiedTeams.add(actualRows[2].team.trim().toLowerCase());
    }

    const teamPoints = new Map<string, number>();
    const addCapped = (team: string, pts: number) => {
      const key = team.trim().toLowerCase();
      const prev = teamPoints.get(key) ?? 0;
      teamPoints.set(key, Math.min(5, prev + pts));
    };

    for (const team of predictedByPlace) {
      if (!team) continue;
      if (qualifiedTeams.has(team.trim().toLowerCase())) {
        addCapped(team, 3);
      }
    }

    for (let idx = 0; idx < predictedByPlace.length && idx < actualPlacement.length; idx++) {
      const predicted = predictedByPlace[idx];
      const actual = actualPlacement[idx];
      if (!predicted || !actual) continue;
      if (predicted.trim().toLowerCase() === actual.trim().toLowerCase()) {
        addCapped(predicted, 2);
      }
    }

    const total = Array.from(teamPoints.values()).reduce((sum, x) => sum + x, 0);
    groupPoints.set(gs.group, total);
  }

  return groupPoints;
}

const GROUP_ORDER = [
  "Группа A", "Группа B", "Группа C", "Группа D",
  "Группа E", "Группа F", "Группа G", "Группа H",
  "Группа I", "Группа J", "Группа K", "Группа L",
];

/**
 * Строит таблицу команд, занявших третьи места в группах,
 * отсортированную по критериям ФИФА.
 */
function buildThirdPlaceTable(
  actualTables: Map<string, GroupTableRow[]>,
): ThirdPlaceRow[] {
  const thirdPlaced: ThirdPlaceRow[] = [];

  for (const [group, rows] of actualTables.entries()) {
    if (rows.length >= 3) {
      const third = rows[2];
      thirdPlaced.push({
        ...third,
        group,
      });
    }
  }

  // Сортировка по критериям ФИФА: очки → разница → забитые → жребий
  thirdPlaced.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.gd !== a.gd) return b.gd - a.gd;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return a.team.localeCompare(b.team, "ru");
  });

  return thirdPlaced;
}

interface GroupTablesPageProps {
  selectedPlayer: PlayerState | null;
  activePlayers: PlayerState[];
  matches: MatchResultState[];
  selectedPlayerId: string | null;
  onPlayerSelect: (id: string | null) => void;
}

export function GroupTablesPage({
  selectedPlayer,
  activePlayers,
  matches,
  selectedPlayerId,
  onPlayerSelect,
}: GroupTablesPageProps) {
  const actualTables = buildActualGroupTables(matches);
  const groupPoints = selectedPlayer
    ? computeGroupPoints(selectedPlayer, actualTables)
    : new Map<string, number>();

  const predictedGroupTables = selectedPlayer
    ? Array.from(buildPredictedGroupTables(selectedPlayer, matches).entries())
        .sort((a, b) => {
          const ia = GROUP_ORDER.indexOf(a[0]);
          const ib = GROUP_ORDER.indexOf(b[0]);
          if (ia !== -1 && ib !== -1) return ia - ib;
          return a[0].localeCompare(b[0], "ru");
        })
    : [];

  const predictedTableMap = selectedPlayer
    ? buildPredictedGroupTables(selectedPlayer, matches)
    : new Map<string, GroupTableRow[]>();

  const predictedThirdPlaceTable = buildThirdPlaceTable(predictedTableMap);
  // Top 8 third-placed teams advance
  const advancingLimit = 8;
  const advancingThirdGroups = new Set(
    predictedThirdPlaceTable.slice(0, advancingLimit).map((r) => r.group),
  );

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Таблицы групп по прогнозам</h2>
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
      </div>

      {!selectedPlayer ? (
        <p className="hint" style={{ textAlign: "center", marginTop: "2rem" }}>
          Выберите игрока, чтобы увидеть таблицы групп по его прогнозам.
        </p>
      ) : (
        <>
          <div className="group-tables-grid">
            {predictedGroupTables.map(([groupName, predRows]) => {
              const actualRows = actualTables.get(groupName);
              const pts = groupPoints.get(groupName);
              const finished = actualRows ? isGroupFinished(groupName, actualTables) : false;
              return (
                <div key={groupName} className="table-wrap">
                  <table className="standings">
                    <thead>
                      <tr>
                        <th colSpan={10}>
                          {groupName}
                          {finished && pts !== undefined ? (
                            <span className="group-points"> — очки за группу: <strong>{pts}</strong></span>
                          ) : !finished ? (
                            <span className="group-points hint"> — группа ещё не сыграна</span>
                          ) : null}
                        </th>
                      </tr>
                      <tr>
                        <th style={{textAlign: 'left'}}>#</th>
                        <th style={{textAlign: 'left'}}>Команда</th>
                        <th className="num">И</th>
                        <th className="num">В</th>
                        <th className="num">Н</th>
                        <th className="num">П</th>
                        <th className="num" title="Забито мячей">ЗМ</th>
                        <th className="num" title="Пропущено мячей">ПМ</th>
                        <th className="num" title="Разница мячей">РМ</th>
                        <th className="num" title="Очки">О</th>
                      </tr>
                    </thead>
                    <tbody>
                      {predRows.map((row, idx) => {
                        // Подсвечиваем строку, если в реальной таблице есть данные
                        const actualRow = actualRows?.[idx];
                        const isCorrectPos = actualRow?.team === row.team;
                        // Команды, выходящие из группы: 1-е и 2-е места всегда,
                        // 3-е — только если проходит как лучшая третья
                        const isAdvancing = idx < 2 || (idx === 2 && advancingThirdGroups.has(groupName));
                        const rowClass = isAdvancing
                          ? "team-advancing"
                          : isCorrectPos
                          ? "team-correct-pos"
                          : "";
                        return (
                          <tr key={row.team} className={rowClass}>
                            <td className="place">{idx + 1}</td>
                            <td>{row.team}</td>
                            <td className="num">{row.played}</td>
                            <td className="num">{row.wins}</td>
                            <td className="num">{row.draws}</td>
                            <td className="num">{row.losses}</td>
                            <td className="num">{row.gf}</td>
                            <td className="num">{row.ga}</td>
                            <td className="num">{row.gd}</td>
                            <td className="total">{row.points}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>

          {/* Таблица третьих мест по прогнозам игрока */}
          {predictedThirdPlaceTable.length > 0 && (
            <div className="third-place-section">
              <h3>Таблица третьих мест</h3>
              <p className="hint">
                Команды, занявшие третьи места в группах по прогнозам игрока, отсортированные по критериям ФИФА.
                {advancingLimit < predictedThirdPlaceTable.length
                  ? ` В 1/16 финала выходят ${advancingLimit} из ${predictedThirdPlaceTable.length} команд.`
                  : ""}
              </p>
              <div className="table-wrap">
                <table className="standings third-place-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th style={{textAlign: 'left'}}>Группа</th>
                      <th style={{textAlign: 'left'}}>Команда</th>
                      <th className="num">И</th>
                      <th className="num">В</th>
                      <th className="num">Н</th>
                      <th className="num">П</th>
                      <th className="num">ЗМ</th>
                      <th className="num">ПМ</th>
                      <th className="num">РМ</th>
                      <th className="num">О</th>
                    </tr>
                  </thead>
                  <tbody>
                    {predictedThirdPlaceTable.map((row, idx) => (
                      <tr
                        key={`${row.group}-${row.team}`}
                        className={idx < advancingLimit ? "team-qualified" : "team-eliminated"}
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
                        <td className="total">{row.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}