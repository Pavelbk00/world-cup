export interface User {
  login: string;
  nickname: string;
}

const AUTH_COOKIE_NAME = 'wc2026_auth';

// Временное хранилище зарегистрированных пользователей (в памяти)
// В реальном проекте это должно храниться на сервере
const registeredUsers: Array<{ login: string; password: string; nickname: string }> = [];

// Загружаем пользователей из JSON файла
import usersData from './users.json';

export function setCookie(name: string, value: string, days: number = 30): void {
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`;
}

export function getCookie(name: string): string | null {
  const nameEQ = name + '=';
  const ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i].trim();
    if (c.indexOf(nameEQ) === 0) {
      return c.substring(nameEQ.length);
    }
  }
  return null;
}

export function deleteCookie(name: string): void {
  document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/`;
}

export function login(userLogin: string, password: string): { success: boolean; user?: User; error?: string } {
  // Проверяем пользователей из JSON файла
  const users = usersData.users.concat(registeredUsers);
  
  // Удаляем лишние пробелы
  userLogin = userLogin.trim();
  password = password.trim();
  
  const user = users.find(u => u.login === userLogin && u.password === password);
  
  if (user) {
    // Устанавливаем куку с логином пользователя
    setCookie(AUTH_COOKIE_NAME, user.login);
    return { success: true, user: { login: user.login, nickname: user.nickname } };
  }
  
  return { success: false, error: 'Неверный логин или пароль' };
}

export function register(login: string, password: string, nickname: string): { success: boolean; user?: User; error?: string } {
  // Проверяем, не занят ли логин
  const users = usersData.users.concat(registeredUsers);
  
  if (users.find(u => u.login === login)) {
    return { success: false, error: 'Пользователь с таким логином уже существует' };
  }
  
  // Добавляем нового пользователя во временное хранилище
  const newUser = { login, password, nickname };
  registeredUsers.push(newUser);
  
  // Устанавливаем куку
  setCookie(AUTH_COOKIE_NAME, login);
  
  return { success: true, user: { login, nickname } };
}

export function getCurrentUser(): User | null {
  const login = getCookie(AUTH_COOKIE_NAME);
  if (!login) return null;
  
  // Ищем пользователя в JSON и зарегистрированных
  const users = usersData.users.concat(registeredUsers);
  const user = users.find(u => u.login === login);
  
  if (user) {
    return { login: user.login, nickname: user.nickname };
  }
  
  // Если не нашли, но кука есть - возвращаем просто логин
  return { login, nickname: login };
}

export function logout(): void {
  deleteCookie(AUTH_COOKIE_NAME);
}

export function isAuthenticated(): boolean {
  return getCurrentUser() !== null;
}