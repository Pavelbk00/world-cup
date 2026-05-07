import type { PlayerState } from "../types";
import { PLAYER_SLOTS } from "../parsePlayerJson";

interface PlayersPageProps {
  players: PlayerState[];
  onCopyTemplate: () => void;
  onFileLoad: (file: File | null) => void;
  onTextareaChange: (index: number, text: string) => void;
  onApplyPlayerText: (index: number, text: string) => void;
}

export function PlayersPage({
  players,
  onCopyTemplate,
  onFileLoad,
  onTextareaChange,
  onApplyPlayerText,
}: PlayersPageProps) {
  return (
    <div className="grid-sections">
      <section className="panel">
        <div className="panel-head">
          <h2>Игроки (JSON × {PLAYER_SLOTS})</h2>
        </div>
        <div className="toolbar">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCopyTemplate}
          >
            Копировать шаблон JSON
          </button>
          <label
            className="btn btn-primary"
            style={{ cursor: "pointer" }}
          >
            Загрузить файл (до 6 игроков)
            <input
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                onFileLoad(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        <p className="hint">
          Один слот = один объект с полями{" "}
          <code className="inline">player</code> и{" "}
          <code className="inline">predictions</code> (массив из{" "}
          <code className="inline">matchId</code>,{" "}
          <code className="inline">home</code>,{" "}
          <code className="inline">away</code>). Дополнительно можно
          передать <code className="inline">groupStandings</code>,{" "}
          <code className="inline">playoff</code>,{" "}
          <code className="inline">topScorer</code>,{" "}
          <code className="inline">medalists</code>. Файл может быть
          массивом из нескольких таких объектов — они заполнят слоты по
          порядку.
        </p>
        <div className="players-grid">
          {players.map((p, i) => (
            <div key={p.id} className="player-card">
              <label htmlFor={`pj-${i}`}>Слот {i + 1}</label>
              <textarea
                id={`pj-${i}`}
                spellCheck={false}
                value={p.rawJson}
                onChange={(e) => {
                  const text = e.target.value;
                  onTextareaChange(i, text);
                }}
                onBlur={() => onApplyPlayerText(i, p.rawJson)}
                placeholder={`{ "player": "...", "predictions": [ ] }`}
              />
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => onApplyPlayerText(i, p.rawJson)}
              >
                Проверить и применить
              </button>
              {p.parseError ? (
                <p className="error">{p.parseError}</p>
              ) : p.name ? (
                <p className="ok">✓ {p.name}</p>
              ) : (
                <p className="hint" style={{ margin: 0 }}>
                  Пустой слот
                </p>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}