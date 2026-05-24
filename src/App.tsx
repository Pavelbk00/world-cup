import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { DEFAULT_MATCHES } from "./matches";
import { isMatchFinished, isMatchPredictable, isPlayoffPhase } from "./matchUtils";
import { computeStandings } from "./scoring";
import type {
  MatchId,
  MatchResultState,
  MedalistsPrediction,
  PlayerPrediction,
  PlayerState,
  GroupStandingPrediction,
  ScoreDraftEntry,
} from "./types";
import { getCurrentUser, logout, type User } from "./auth";

// Components
import {
  ScoringRulesContent,
  WelcomePage,
  StandingsPage,
  PlayerMatchesPage,
  GroupTablesPage,
  LoginPage,
  ParticipatePage,
  HallOfFamePage,
} from "./components";

// Utils
import { emptyPlayers, newPlayerId } from "./utils";
import {
  predictionsArrayFromDraft,
  mergePlayerRawJson,
  PLAYER_SLOTS,
} from "./parsePlayerJson";
import { savePlayer, loadAllPlayers, loadPlayerFile, loadMatchResults, isServerReachable } from "./utils/api";
import usersData from "./users.json";

const SLOT_MAP_KEY = "wc2026_login_slot";

/** Дата и время первого матча турнира */
const FIRST_MATCH = (() => {
  const first = DEFAULT_MATCHES.find((m) => !m.isPlaceholder);
  if (!first) return new Date(0);
  const [day, month, year] = first.date.split(".").map(Number);
  const [hours, minutes] = first.time.split(":").map(Number);
  return new Date(year, month - 1, day, hours, minutes);
})();

function getSlotForLogin(login: string): number {
  try {
    const raw = localStorage.getItem(SLOT_MAP_KEY);
    const map: Record<string, number> = raw ? JSON.parse(raw) : {};
    return map[login] ?? -1;
  } catch {
    return -1;
  }
}

function setSlotForLogin(login: string, slot: number): void {
  try {
    const raw = localStorage.getItem(SLOT_MAP_KEY);
    const map: Record<string, number> = raw ? JSON.parse(raw) : {};
    map[login] = slot;
    localStorage.setItem(SLOT_MAP_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

function findFreeSlot(players: PlayerState[]): number {
  const used = new Set<number>();
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (p.name.trim() && !p.parseError) {
      used.add(i);
    }
  }
  for (let i = 0; i < PLAYER_SLOTS; i++) {
    if (!used.has(i)) return i;
  }
  return -1;
}

function playerNameSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-zа-яё0-9-]/gi, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

type AppPage =
  | "welcome"
  | "participate"
  | "rules"
  | "standings"
  | "groups"
  | "halloffame";

/** Creates a minimal empty player */
const EMPTY_PLAYER: PlayerState = {
  id: "",
  login: "",
  name: "",
  predictions: new Map(),
  groupStandings: [],
  topScorer: null,
  medalists: null,
  rawJson: "",
  parseError: null,
};

function emptyPlayer(): PlayerState {
  return { ...EMPTY_PLAYER, id: newPlayerId() };
}

/** Преобразует карту прогнозов + winner/method в черновик счёта */
function draftFromPredictionsMapShallow(
  matches: typeof DEFAULT_MATCHES,
  predictions: Map<MatchId, PlayerPrediction>,
): Record<MatchId, ScoreDraftEntry> {
  const r: Record<MatchId, ScoreDraftEntry> = {};
  for (const m of matches) {
    const s = predictions.get(m.id);
    r[m.id] = {
      h: s !== undefined ? String(s.home) : "",
      a: s !== undefined ? String(s.away) : "",
      winner: s?.winner,
      method: s?.method,
    };
  }
  return r;
}

export function App() {
  // Auth state
  const [user, setUser] = useState<User | null>(() => getCurrentUser());

  const handleLoginSuccess = () => {
    setUser(getCurrentUser());
  };

  const handleLogout = () => {
    logout();
    setUser(null);
    setCurrentPlayer(emptyPlayer());
    setParticipantSlot(-1);
    if (page !== "welcome") {
      setPage("welcome");
    }
  };

  const protectedPages: AppPage[] = ["participate", "groups"];
  const requiresAuth = (page: AppPage): boolean =>
    protectedPages.includes(page);

  const [matches, setMatches] = useState<MatchResultState[]>(
    DEFAULT_MATCHES.map((def) => ({
      def,
      homeInput: "",
      awayInput: "",
    })),
  );

  const [players, setPlayers] = useState<PlayerState[]>(() => emptyPlayers());
  const [playersLoaded, setPlayersLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [playerLoading, setPlayerLoading] = useState(true);
  const [serverReachable, setServerReachable] = useState<boolean | null>(null);

  // On mount, load players from API and match results
  useEffect(() => {
    (async () => {
      const loaded = await loadAllPlayers();
      // Если сервер недоступен (нет данных с login), создаём fallback из users.json
      const hasRealData = loaded.some((p) => p.login);
      if (!hasRealData) {
        const fallback: PlayerState[] = usersData.users.map((u) => ({
          id: newPlayerId(),
          login: u.login,
          name: u.nickname,
          predictions: new Map<string, PlayerPrediction>(),
          groupStandings: [] as GroupStandingPrediction[],
          topScorer: null,
          medalists: null,
          rawJson: "",
          parseError: null,
        }));
        setPlayers(fallback);
      } else {
        setPlayers(loaded);
      }
      setPlayersLoaded(true);
    })();
  }, []);

  // Check if server is reachable
  useEffect(() => {
    (async () => {
      const reachable = await isServerReachable();
      setServerReachable(reachable);
    })();
  }, []);

  // Load match results from data/results.json
  useEffect(() => {
    (async () => {
      const results = await loadMatchResults();
      if (results.length === 0) return;
      setMatches((prev) =>
        prev.map((m) => {
          const matchResult = results.find((r) => r.matchId === m.def.id);
          if (matchResult) {
            return {
              ...m,
              homeInput: String(matchResult.home),
              awayInput: String(matchResult.away),
            };
          }
          return m;
        }),
      );
    })();
  }, []);

  const standings = useMemo(
    () => computeStandings(matches, players),
    [matches, players],
  );

  const [page, setPage] = useState<AppPage>(() => {
    if (typeof window === "undefined") return "welcome";
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("page");
    if (raw === "standings") return "standings";
    if (raw === "groups") return "groups";
    if (raw === "participate") return "participate";
    if (raw === "welcome") return "welcome";
    if (raw === "rules") return "rules";
    if (params.get("playerName")) return "standings";
    return "welcome";
  });
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  // Slot allocation for current user
  const [participantSlot, setParticipantSlot] = useState<number>(-1);
  const [currentPlayer, setCurrentPlayer] = useState<PlayerState>(emptyPlayer);
  const [scoreDraft, setScoreDraft] = useState<
    Record<MatchId, ScoreDraftEntry>
  >(() => draftFromPredictionsMapShallow(DEFAULT_MATCHES, new Map()));

  // Medalists and top scorer draft
  const [medalistsDraft, setMedalistsDraft] = useState<MedalistsPrediction>({
    gold: "",
    silver: "",
    bronze: "",
  });
  const [topScorerDraft, setTopScorerDraft] = useState<string>("");

  // Slot allocation: resolve which slot belongs to current user
  useEffect(() => {
    if (!playersLoaded) return;
    const cur = getCurrentUser();
    if (!cur) {
      setParticipantSlot(-1);
      setCurrentPlayer(emptyPlayer());
      setPlayerLoading(false);
      return;
    }

    const idx = players.findIndex((p) => p.login === cur.login);
    let slot = idx >= 0 ? idx : getSlotForLogin(cur.login);

    if (slot < 0 || slot >= PLAYER_SLOTS) {
      slot = findFreeSlot(players);
    } else {
      const slotPlayer = players[slot];
      if (slotPlayer.name.trim() && slotPlayer.login !== cur.login) {
        slot = findFreeSlot(players);
      }
    }

    if (slot >= 0) {
      setSlotForLogin(cur.login, slot);
      setParticipantSlot(slot);
      // Не перезаписываем currentPlayer, если у него уже есть прогнозы для этого логина
      if (currentPlayer.login !== cur.login || currentPlayer.predictions.size === 0) {
        setCurrentPlayer(players[slot]);
        setScoreDraft(
          draftFromPredictionsMapShallow(DEFAULT_MATCHES, players[slot].predictions),
        );
        setMedalistsDraft(
          players[slot].medalists ?? { gold: "", silver: "", bronze: "" },
        );
        setTopScorerDraft(players[slot].topScorer ?? "");
      }
    } else {
      setParticipantSlot(-1);
      setCurrentPlayer(emptyPlayer());
    }
    setPlayerLoading(false);
  }, [user, players, playersLoaded]);

  // Try to load existing predictions from server for currentUser's login
  useEffect(() => {
    if (!user || !playersLoaded) return;
    if (currentPlayer.predictions.size > 0) {
      return;
    }
    (async () => {
      const loaded = await loadPlayerFile(user.login);
      if (loaded) {
        setCurrentPlayer(loaded);
        setScoreDraft(
          draftFromPredictionsMapShallow(DEFAULT_MATCHES, loaded.predictions),
        );
        setMedalistsDraft(
          loaded.medalists ?? { gold: "", silver: "", bronze: "" },
        );
        setTopScorerDraft(loaded.topScorer ?? "");
        setPlayers((prev) => {
          const next = [...prev];
          if (participantSlot >= 0 && participantSlot < next.length) {
            next[participantSlot] = loaded;
          }
          return next;
        });
      }
    })();
  }, [user?.login]); // eslint-disable-line react-hooks/exhaustive-deps

  // Маппинг логин -> nickname из users.json
  const loginToNickname = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of usersData.users) {
      m.set(u.login, u.nickname);
    }
    return m;
  }, []);

  const lastFinishedMatchLabel = useMemo(() => {
    const finished = matches
      .filter((m) => {
        const h = parseInt(m.homeInput, 10);
        const a = parseInt(m.awayInput, 10);
        return !isNaN(h) && !isNaN(a);
      })
      .sort((a, b) => {
        const dateA = a.def.date + " " + a.def.time;
        const dateB = b.def.date + " " + b.def.time;
        return dateA.localeCompare(dateB);
      });
    if (finished.length === 0) return null;
    const last = finished[finished.length - 1];
    return last.def.homeTeam + " – " + last.def.awayTeam;
  }, [matches]);

  const standingsByPlayerId = useMemo(() => {
    const map = new Map(standings.map((row) => [row.playerId, row]));
    const rows: Array<{
      key: string;
      name: string;
      hasValidData: boolean;
      byTier: { t3: number; t2: number; t1: number; t0: number };
      groupStagePoints: number;
      playoffBonusPoints: number;
      topScorerPoints: number;
      medalistPoints: number;
      total: number;
    }> = [];
    for (const p of players) {
      // Берём имя: из сохранённых данных -> из users.json по логину -> пропускаем пустой слот
      const displayName = p.name.trim()
        ? p.name
        : (p.login && loginToNickname.get(p.login));
      if (!displayName) continue; // пустой слот без логина — не показываем

      const row = map.get(p.id);
      const hasValidData = Boolean(p.name.trim()) && !p.parseError;
      const byTier = row?.byTier ?? { t3: 0, t2: 0, t1: 0, t0: 0 };
      rows.push({
        key: p.id,
        name: displayName,
        hasValidData,
        byTier,
        groupStagePoints: row?.groupStagePoints ?? 0,
        playoffBonusPoints: row?.playoffBonusPoints ?? 0,
        topScorerPoints: row?.topScorerPoints ?? 0,
        medalistPoints: row?.medalistPoints ?? 0,
        total: row?.total ?? 0,
      });
    }
    // Сортировка по убыванию очков
    rows.sort((a, b) => b.total - a.total);
    return rows;
  }, [players, standings, loginToNickname]);

  const activePlayers = useMemo(
    () => players.filter((p) => !p.parseError && p.name.trim()),
    [players],
  );

  const selectedPlayer = useMemo(() => {
    if (!selectedPlayerId) return null;
    return (
      players.find(
        (p) => p.id === selectedPlayerId && !p.parseError && p.name,
      ) ?? null
    );
  }, [players, selectedPlayerId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("playerName");
    if (!token) return;
    const resolved =
      activePlayers.find((p) => playerNameSlug(p.name) === token) ?? null;
    if (resolved && resolved.id !== selectedPlayerId) {
      setSelectedPlayerId(resolved.id);
    }
  }, [activePlayers, selectedPlayerId]);

  useEffect(() => {
    if (selectedPlayerId && !selectedPlayer) {
      setSelectedPlayerId(null);
    }
  }, [selectedPlayer, selectedPlayerId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.delete("player");
    params.set("page", page);
    if (page === "standings" && selectedPlayer) {
      params.set("playerName", playerNameSlug(selectedPlayer.name));
    } else {
      params.delete("playerName");
    }
    const qs = params.toString();
    const nextUrl = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", nextUrl);
  }, [page, selectedPlayer]);

  const navItems: { page: AppPage; label: string; icon: string }[] = [
    { page: "welcome", label: "Главная", icon: "🏠" },
    { page: "halloffame", label: "Зал славы", icon: "🏆" },
    { page: "participate", label: "Прогнозы", icon: "⚽" },
    { page: "standings", label: "Итоги", icon: "📊" },
    { page: "groups", label: "Группы", icon: "🗂️" },
    { page: "rules", label: "Правила", icon: "📜" },
  ];

  const handleScoreChange = (matchId: string, home: string, away: string) => {
    const matchDef = DEFAULT_MATCHES.find((m) => m.id === matchId);
    if (matchDef && (isMatchFinished(matchDef) || !isMatchPredictable(matchDef))) return;
    setScoreDraft((prev) => ({
      ...prev,
      [matchId]: { ...prev[matchId], h: home, a: away },
    }));
  };

  const handleWinnerChange = (matchId: string, winner: string) => {
    setScoreDraft((prev) => ({
      ...prev,
      [matchId]: { ...prev[matchId], winner },
    }));
  };

  const handleMethodChange = (matchId: string, method: ScoreDraftEntry["method"]) => {
    setScoreDraft((prev) => ({
      ...prev,
      [matchId]: { ...prev[matchId], method },
    }));
  };

  /** Проверяет, начался ли первый матч турнира (блокировка выбора призёров и бомбардира) */
  const isFirstMatchStarted = Date.now() >= FIRST_MATCH.getTime();

  const handleSave = async () => {
    if (!user) return;
    if (participantSlot < 0) return;

    const name = (currentPlayer.name || user.nickname || "").trim();
    if (!name) return;

    // Проверка: есть ли хотя бы один счёт
    const hasAnyScore = Object.values(scoreDraft).some((s) => s.h !== "" && s.a !== "");
    if (!hasAnyScore) return;

    // Проверка: если в плей-офф указана ничья, должен быть выбран победитель и способ
    const hasIncompletePlayoffDraws = DEFAULT_MATCHES
      .filter((m) => isPlayoffPhase(m.phase) && isMatchPredictable(m) && !isMatchFinished(m))
      .some((m) => {
        const d = scoreDraft[m.id];
        return d && d.h !== "" && d.a !== "" && d.h === d.a && (!d.winner || !d.method);
      });
    if (hasIncompletePlayoffDraws) return;

    // Собираем прогнозы из draft напрямую
    const predsMap = new Map<string, PlayerPrediction>();
    for (const m of DEFAULT_MATCHES) {
      const d = scoreDraft[m.id];
      if (d && d.h !== "" && d.a !== "") {
        const pred: PlayerPrediction = { home: Number(d.h), away: Number(d.a) };
        if (d.winner && d.method) {
          pred.winner = d.winner;
          pred.method = d.method;
        }
        predsMap.set(m.id, pred);
      }
    }
    const arr = predictionsArrayFromDraft(DEFAULT_MATCHES, scoreDraft);

    const effectiveTopScorer = isFirstMatchStarted
      ? (currentPlayer.topScorer ?? "")
      : topScorerDraft;
    const effectiveMedalists = isFirstMatchStarted
      ? (currentPlayer.medalists ?? { gold: "", silver: "", bronze: "" })
      : medalistsDraft;

    // mergePlayerRawJson теперь принимает только predictionsArr (winner/method внутри)
    const raw = mergePlayerRawJson(currentPlayer.rawJson, name, arr);
    const updated: PlayerState = {
      id: currentPlayer.id,
      login: user.login,
      name,
      predictions: predsMap,
      groupStandings: [],
      topScorer: effectiveTopScorer.trim() || null,
      medalists: effectiveMedalists.gold ? effectiveMedalists : null,
      rawJson: raw,
      parseError: null,
    };
    setSaveStatus("saving");
    const ok = await savePlayer(updated, user.login);
    if (ok) {
      setSaveStatus("saved");
      // Force set currentPlayer with updated predictions
      setCurrentPlayer({
        ...updated,
        predictions: new Map(updated.predictions),
      });
      setPlayers((prev) => {
        const next = [...prev];
        next[participantSlot] = {
          ...updated,
          predictions: new Map(updated.predictions),
        };
        return next;
      });
      // Reset status after 2s
      setTimeout(() => setSaveStatus("idle"), 2000);
    } else {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  };

  const handleNavClick = (itemPage: AppPage) => {
    setSelectedPlayerId(null);
    if (requiresAuth(itemPage) && !user) {
      setPage("welcome");
      setShowAuthModal(true);
    } else {
      setPage(itemPage);
    }
    // Сразу удаляем playerName из URL, чтобы эффект не восстановил его
    const params = new URLSearchParams(window.location.search);
    params.set("page", itemPage);
    params.delete("playerName");
    const qs = params.toString();
    const nextUrl = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", nextUrl);
  };

  const handleParticipateClick = () => {
    setSelectedPlayerId(null);
    if (!user) {
      setShowAuthModal(true);
    } else {
      setPage("participate");
    }
  };

  const handleRulesClick = () => {
    setPage("rules");
  };

  const [showAuthModal, setShowAuthModal] = useState(false);

  const handleAuthModalSuccess = () => {
    handleLoginSuccess();
    setShowAuthModal(false);
  };

  const showParticipateForm =
    page === "participate" &&
    !!user &&
    !playerLoading;

  return (
    <div className="app">
      {showAuthModal && (
        <div
          className="auth-modal-overlay"
          onClick={() => setShowAuthModal(false)}
        >
          <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
            <button
              className="auth-modal-close"
              onClick={() => setShowAuthModal(false)}
            >
              ×
            </button>
            <LoginPage onLoginSuccess={handleAuthModalSuccess} />
          </div>
        </div>
      )}

      <aside className="sidebar">
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <button
              key={item.page}
              type="button"
              className={`sidebar-btn ${page === item.page ? "active" : ""}`}
              title={item.label}
              onClick={() => handleNavClick(item.page)}
            >
              <span className="sidebar-icon">{item.icon}</span>
              <span className="sidebar-label">{item.label}</span>
            </button>
          ))}
          {user && (
            <button
              key="logout"
              type="button"
              className="sidebar-btn"
              title="Выйти"
              onClick={handleLogout}
            >
              <span className="sidebar-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </span>
              <span className="sidebar-label">Выйти</span>
            </button>
          )}
        </nav>
      </aside>
      <main className="main-content">
        {serverReachable === false ? (
          <section className="panel server-offline-panel">
            <div className="server-offline-content">
              <div className="server-offline-icon">⚡</div>
              <h2>Сервер недоступен</h2>
              <p>
                Не удалось подключиться к серверу. Пожалуйста, убедитесь, что сервер запущен, и повторите попытку.
              </p>
              <button
                className="btn btn-primary"
                onClick={() => window.location.reload()}
              >
                Повторить попытку
              </button>
            </div>
          </section>
        ) : !playersLoaded ? (
          <section className="panel">
            <p className="hint">Загрузка...</p>
          </section>
        ) : page === "welcome" ? (
          <WelcomePage
            onParticipate={handleParticipateClick}
            onNavigateToRules={handleRulesClick}
          />
        ) : page === "rules" ? (
          <section className="panel rules-page-panel">
            <div className="panel-head">
              <h2>Правила</h2>
            </div>
            <ScoringRulesContent />
          </section>
        ) : page === "standings" && selectedPlayer ? (
          <PlayerMatchesPage
            selectedPlayer={selectedPlayer}
            matches={matches}
          />
        ) : page === "halloffame" ? (
          <HallOfFamePage />
        ) : page === "groups" ? (
          <GroupTablesPage
            selectedPlayer={selectedPlayer}
            activePlayers={activePlayers}
            matches={matches}
            selectedPlayerId={selectedPlayerId}
            onPlayerSelect={setSelectedPlayerId}
          />
        ) : page === "participate" && playerLoading ? (
          <section className="panel">
            <p className="hint">Загрузка ваших прогнозов...</p>
          </section>
        ) : page === "participate" && !user ? (
          <section className="panel">
            <p className="hint">
              Сначала войдите в систему, чтобы делать прогнозы.
            </p>
          </section>
        ) : showParticipateForm ? (
          <ParticipatePage
            player={currentPlayer}
            scoreDraft={scoreDraft}
            onScoreChange={handleScoreChange}
            onWinnerChange={handleWinnerChange}
            onMethodChange={handleMethodChange}
            medalistsDraft={medalistsDraft}
            onMedalistsChange={setMedalistsDraft}
            topScorerDraft={topScorerDraft}
            onTopScorerChange={setTopScorerDraft}
            onSave={handleSave}
            saveStatus={saveStatus}
          />
        ) : page === "standings" ? (
          <StandingsPage
            standingsByPlayerId={standingsByPlayerId}
            lastFinishedMatchLabel={lastFinishedMatchLabel}
            onSelectPlayer={setSelectedPlayerId}
          />
        ) : (
          <WelcomePage
            onParticipate={handleParticipateClick}
            onNavigateToRules={handleRulesClick}
          />
        )}
      </main>
    </div>
  );
}