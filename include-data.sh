#!/bin/bash
set -e

GREEN='\033[0;32m'
NC='\033[0m'

echo -e "${GREEN}==> 1. Переходим в папку проекта...${NC}"
cd /var/www/world-cup

echo -e "${GREEN}==> 2. Удаляем папку data из .gitignore...${NC}"
# Команда удаляет любые строки, содержащие "data/" или "data" (с пробелами и без) из .gitignore
if [ -f .gitignore ]; then
    sed -i '/data\//!d' .gitignore       # Удаляет строку "data/"
    sed -i '/^data$/d' .gitignore        # Удаляет строку "data"
fi

echo -e "${GREEN}==> 3. Добавляем изменения и папку data в Git...${NC}"
git add .gitignore
# Принудительно добавляем папку data, даже если где-то остался глобальный игнор
git add -f data/

echo -e "${GREEN}==> 4. Фиксируем изменения локально...${NC}"
# Если изменений нет, скрипт не упадет благодаря ошибке '|| true'
git commit -m "chore: включить папку data в отслеживание Git" || true

echo -e "${GREEN}✅ Готово! Теперь Git следит за прогнозами пользователей.${NC}"
