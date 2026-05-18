#!/bin/bash
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}==> 🚑 Запуск скрипта аварийного восстановления сайта...${NC}"

# 1. Проверяем свободное место на диске
DISK_USAGE=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -gt 95 ]; then
    echo -e "${RED}❌ ВНИМАНИЕ: Диск заполнен на ${DISK_USAGE}%! Node.js не может писать JSON.${NC}"
fi

# 2. Проверяем синтаксис конфигурации Nginx
echo -e "${YELLOW}==> Проверка конфигурации Nginx...${NC}"
if sudo nginx -t; then
    echo -e "${GREEN}✅ Конфигурация Nginx в порядке. Перезапускаем...${NC}"
    sudo systemctl restart nginx
else
    echo -e "${RED}❌ Ошибка в конфигах Nginx! Попытка перезапуска пропущена.${NC}"
fi

# 3. Жесткая перезагрузка Node.js в PM2
echo -e "${YELLOW}==> Перезапуск процесса Node.js (PM2)...${NC}"
pm2 kill
pm2 resurrect  # Восстанавливает процессы с вашим лимитом памяти

# Даем серверу 3 секунды, чтобы подняться
sleep 3

# 4. Проверка статуса портов
echo -e "${YELLOW}==> Проверка, слушает ли Node.js порт 3001...${NC}"
if ss -tuln | grep -q ":3001 "; then
    echo -e "${GREEN}✅ Бэкенд успешно поднялся на порту 3001.${NC}"
else
    echo -e "${RED}❌ Бэкенд НЕ работает на порту 3001! Проверяем логи ошибок...${NC}"
fi

# 5. Вывод диагностической информации
echo -e "\n${YELLOW}================ СТАТУС ПРОЦЕССОВ PM2 ================${NC}"
pm2 list

echo -e "\n${YELLOW}================ ПОСЛЕДНИЕ 15 СТРОК ЛОГОВ БЭКЕНДА ================${NC}"
pm2 logs lions-game --lines 15 --no-daemon
