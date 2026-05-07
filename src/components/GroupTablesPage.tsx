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

function buildPredictedGroupTables(
  player: PlayerState,
  matches: MatchResultState[],
): Map<string, GroupTableRow[]> {
  const groups = new Map<string, Map<string, GroupTableRow>>();

  const ensureTeam = (group: string, team: string): GroupTableRow => {
    if (!groups.has(group)) groups.set(group, new Map());
    const table = groups.get(group)!;
    if (!table.has(team)) {
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
    return table.get(team)!;
  };

  for (const m of matches) {
    if (!m.def.phase.toLowerCase().startsWith("группа")) continue;
    const pred = player.predictions.get(m.def.id);
    if (!pred) continue;
    const group = m.def.phase;
    const home = ensureTeam(group, m.def.homeTeam);
    const away = ensureTeam(group, m.def.awayTeam);

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
    const rows = Array.from(teamsMap.values()).map((row) => ({
      ...row,
      gd: row.gf - row.ga,
    }));
    rows.sort(
      (a, b) =>
        b.points - a.points ||
        b.gd - a.gd ||
        b.gf - a.gf ||
        a.team.localeCompare(b.team, "ru"),
    );
    result.set(group, rows);
  }
  return result;
}

function buildActualGroupTables(matches: MatchResultState[]): Map<string, GroupTableRow[]> {
  const groups = new Map<string, Map<string, GroupTableRow>>();

  const ensureTeam = (group: string, team: string): GroupTableRow => {
    if (!groups.has(group)) groups.set(group, new Map());
    const table = groups.get(group)!;
    if (!table.has(team)) {
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
    return table.get(team)!;
  };

  for (const m of matches) {
    if (!m.def.phase.toLowerCase().startsWith("группа")) continue;
    const res = resultFromState(m);
    if (!res) continue;
    const group = m.def.phase;
    const home = ensureTeam(group, m.def.homeTeam);
    const away = ensureTeam(group, m.def.awayTeam);

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
    const rows = Array.from(teamsMap.values()).map((row) => ({
      ...row,
      gd: row.gf - row.ga,
    }));
    rows.sort(
      (a, b) =>
        b.points - a.points ||
        b.gd - a.gd ||
        b.gf - a.gf ||
        a.team.localeCompare(b.team, "ru"),
    );
    result.set(group, rows);
  }
  return result;
}

function isGroupFinished(groupName: string, actualTables: Map<string, GroupTableRow[]>): boolean {
  // A group is finished if every team in it has played 3 matches
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
    // Also include third place if group has >= 3 teams (it's a 4-team group)
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
        <p className="hint">
          Выберите игрока, чтобы увидеть групповые таблицы по его прогнозам.
        </p>
      ) : (
        <div className="group-tables-grid">
          {predictedGroupTables.map(([groupName, rows]) => {
            const pts = groupPoints.get(groupName);
            const finished = isGroupFinished(groupName, actualTables);
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
                    {rows.map((row, idx) => (
                      <tr key={row.team}>
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
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}