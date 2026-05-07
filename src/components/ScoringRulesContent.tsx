export function ScoringRulesContent() {
  return (
    <div className="rules">
      <h3 className="rules-title">Система начисления очков</h3>
      <div className="rules-grid">
        <section className="rule-card">
          <h4>
            <span className="rule-icon" aria-hidden="true">
              ⚽
            </span>
            1. Прогнозы на матчи
          </h4>
          <p>По результату основного времени (90 минут + добавленное).</p>
          <ul>
            <li>
              <strong>1 очко</strong> — угадан только исход (П1, Х, П2).
            </li>
            <li>
              <strong>+2 очка</strong> — добавляются, если угадана разница
              мячей.
            </li>
            <li>
              <strong>+3 очка</strong> — добавляются, если угадан точный счет.
            </li>
            <li>
              <strong>Максимум за матч:</strong> 6 очков.
            </li>
          </ul>
        </section>

        <section className="rule-card">
          <h4>
            <span className="rule-icon" aria-hidden="true">
              📊
            </span>
            2. Итоги группового этапа
          </h4>
          <p>Начисляются после завершения всех матчей в группах.</p>
          <ul>
            <li>
              <strong>3 очка</strong> — за каждую команду, вышедшую в 1/16.
            </li>
            <li>
              <strong>2 очка</strong> — за точное место (1, 2, 3, 4).
            </li>
            <li>
              <strong>Максимум: 5 очков</strong> за одну команду.
            </li>
          </ul>
        </section>

        <section className="rule-card">
          <h4>
            <span className="rule-icon" aria-hidden="true">
              🏁
            </span>
            3. Плей-офф: способ победы
          </h4>
          <p>
            Бонус за проход в следующую стадию, только если угадан победитель.
          </p>
          <ul>
            <li>
              <strong>+1 очко</strong> — победа в основное время.
            </li>
            <li>
              <strong>+3 очка</strong> — победа в дополнительное время.
            </li>
            <li>
              <strong>+5 очков</strong> — победа в серии пенальти.
            </li>
          </ul>
        </section>

        <section className="rule-card">
          <h4>
            <span className="rule-icon" aria-hidden="true">
              🎯
            </span>
            4. Лучший бомбардир
          </h4>
          <p>Одна ставка до старта турнира.</p>
          <ul>
            <li>
              <strong>20 очков</strong> — за "Золотую бутсу" ФИФА.
            </li>
            <li>
              <strong>2 очка</strong> — за каждый гол игрока (без серий
              пенальти).
            </li>
          </ul>
        </section>

        <section className="rule-card">
          <h4>
            <span className="rule-icon" aria-hidden="true">
              🏆
            </span>
            5. Призеры турнира
          </h4>
          <p>Долгосрочные ставки на топ-3 команды чемпионата.</p>
          <ul>
            <li>
              <strong>Золото</strong> — 50 очков.
            </li>
            <li>
              <strong>Серебро</strong> — 35 очков.
            </li>
            <li>
              <strong>Бронза</strong> — 20 очков.
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}