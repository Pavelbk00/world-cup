#!/bin/bash
set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}==> 1. Переходим в папку проекта...${NC}"
cd /var/www/world-cup

echo -e "${GREEN}==> 2. Скачиваем свежий код из Git с автовыравниванием...${NC}"
# --rebase защищает локальные JSON-файлы пользователей от перезаписи
git pull --rebase origin main

#echo -e "${GREEN}==> 3. Устанавливаем новые зависимости (если есть)...${NC}"
# npm install

echo -e "${GREEN}==> 4. Собираем фронтенд и компилируем бэкенд...${NC}"
npm run build

echo -e "${GREEN}==> 5. Мягко перезапускаем бэкенд в PM2 (Zero Downtime)...${NC}"
pm2 reload lions-game

echo -e "${GREEN}==> 6. Перезапускаем веб-сервер Nginx для обновления фронтенда...${NC}"
sudo systemctl reload nginx

if pm2 list | grep -q "lions-game.*online"; then
    echo -e "${GREEN}🎉 Деплой успешно завершен! Сайт полностью обновлен.${NC}"
else
    echo -e "${RED}❌ Что-то пошло не так с бэкендом. Проверьте статус: pm2 list${NC}"
    exit 1
fi
