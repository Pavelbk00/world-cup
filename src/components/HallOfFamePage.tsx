export function HallOfFamePage() {
  return (
    <section className="hall-of-fame-panel panel">
      <div className="hof-grass" aria-hidden="true" />
      <div className="hof-pitch-lines" aria-hidden="true">
        <span className="hof-center-circle" />
        <span className="hof-penalty-box" />
      </div>

      <div className="panel-head hof-header">
        <div className="hof-header-content">
          <span className="hof-emblems" aria-hidden="true">
            ⚽ 🏆 ⚽
          </span>
          <h2>Зал славы</h2>
          <p className="hof-subtitle">Легенды наших прогнозов</p>
        </div>
      </div>

      <div className="hall-of-fame-cards">
        <div className="hall-of-fame-card">
          <div className="hof-photo">
            <img
              src="https://sun9-33.userapi.com/s/v1/ig2/PeyQdyE2bOfQor91PQna9fEtpzEIUnkOo7oa_u3qF0fUB1ES4JpoB7FiL_93KSvomyRtVHxsQIgKtvfzcXPwt15_.jpg?quality=95&as=32x43,48x64,72x96,108x144,160x213,240x320,360x480,480x640,540x720,640x853,720x960,960x1280&from=bu&u=sN_nCZWpLor9-1EI-miItR8H7THL13IpNRBbPiZEVvY&cs=960x0"
              alt="Победитель Евро-2024"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
                (e.target as HTMLImageElement).parentElement!.classList.add(
                  "hof-photo-placeholder",
                );
              }}
            />
          </div>
          <div className="hof-info">
            <span className="hof-badge">🏆 Чемпион</span>
            <h3>Победитель прогноза Евро-2024</h3>
            <p className="hof-name">Кирилл Шевцов</p>
            <p className="hof-year">Евро-2024 · Германия</p>
            <p className="hof-total">Кол-во очков · 219</p>
          </div>
        </div>
      </div>
    </section>
  );
}
