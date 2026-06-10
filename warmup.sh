#!/bin/bash
# ──────────────────────────────────────────────────────────────
# 🔥 Скрипт автопрогрева сайта (warmup.sh)
#
# Предотвращает засыпание PM2 и выгрузку Node.js из памяти.
# Вызывается cron'ом каждые 5 минут — имитирует заход пользователя.
#
# УСТАНОВКА:
#   1. Скопируйте этот файл на сервер: /var/www/world-cup/warmup.sh
#   2. Сделайте исполняемым: chmod +x /var/www/world-cup/warmup.sh
#   3. Добавьте в cron:
#      crontab -e
#      Добавьте строку:
#        */5 * * * * /var/www/world-cup/warmup.sh >> /var/log/warmup.log 2>&1
#
# Или альтернативно — просто curl (без скрипта):
#   */5 * * * * curl -sf https://lions-cup31.ru/api/health > /dev/null
# ──────────────────────────────────────────────────────────────

CURL_OPTS="-sf --max-time 10"  # silent, fail on error, 10s timeout
DOMAIN="https://lions-cup31.ru"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Прогрев $DOMAIN..."

# 1. Прогрев API (разбудит Node.js/PM2 если спит)
HTTP_CODE=$(curl $CURL_OPTS -o /dev/null -w "%{http_code}" "$DOMAIN/api/health" 2>/dev/null)

if [ "$HTTP_CODE" = "200" ]; then
    echo "  ✓ /api/health → $HTTP_CODE (бэкенд жив)"
else
    echo "  ✗ /api/health → $HTTP_CODE (проблема с бэкендом!)"
fi

# 2. Прогрев фронтенда (разбудит nginx + заполнит Page Cache)
curl $CURL_OPTS -o /dev/null "$DOMAIN/" 2>/dev/null
echo "  ✓ Фронтенд прогрет"