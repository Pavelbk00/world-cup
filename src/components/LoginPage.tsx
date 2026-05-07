import { useState } from "react";
import { login } from "../auth";

interface LoginPageProps {
  onLoginSuccess: () => void;
}

export function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [loginInput, setLoginInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!loginInput.trim() || !passwordInput) {
      setError("Заполните все поля");
      return;
    }

    const result = login(loginInput, passwordInput);
    if (result.success) {
      onLoginSuccess();
    } else {
      setError(result.error || "Ошибка входа");
    }
  };

  return (
    <div className="login-page">
      <section className="panel login-panel">
        <div className="panel-head">
          <h2>Вход</h2>
        </div>
        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="login-input">Логин</label>
            <input
              id="login-input"
              type="text"
              className="form-input"
              value={loginInput}
              onChange={(e) => setLoginInput(e.target.value)}
              placeholder="Введите логин"
              autoComplete="username"
            />
          </div>
          <div className="form-group">
            <label htmlFor="password-input">Пароль</label>
            <input
              id="password-input"
              type="password"
              className="form-input"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Введите пароль"
              autoComplete="current-password"
            />
          </div>
          {error && <div className="error-message">{error}</div>}
          <button type="submit" className="btn btn-primary login-btn">
            Войти
          </button>
        </form>
      </section>
    </div>
  );
}
