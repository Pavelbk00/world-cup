interface WelcomePageProps {
  onParticipate: () => void;
  onNavigateToRules: () => void;
}

export function WelcomePage({ onParticipate, onNavigateToRules }: WelcomePageProps) {
  return (
    <section className="welcome-hero panel">
      <p className="welcome-kicker">ЧМ-2026 · Belgorod Lions</p>
      <h1 className="welcome-title">Добро пожаловать в «Прогнозисты»!</h1>
      <p className="welcome-lead">
        Твой футбольный IQ наконец-то получит официальное подтверждение.
        Или жёсткое опровержение. Угадывай исходы, ставь сенсации, а потом
        делай вид, что так и задумал. Зона комфорта — за порогом этого сайта.
      </p>
      <p className="welcome-hint">
        Жми кнопку, заполняй матчи — и ты уже в игре. Чемпиона и бомбардира
        выберешь там же. А за что очки начисляют — написано в разделе{" "}
        <button
          type="button"
          className="btn btn-link welcome-inline-link"
          onClick={onNavigateToRules}
        >
          «Правила»
        </button>
        .
      </p>
      <button
        type="button"
        className="btn btn-participate"
        onClick={onParticipate}
      >
        Участвовать
      </button>
    </section>
  );
}