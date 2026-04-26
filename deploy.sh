#!/bin/bash
set -e
cd /root/TraderBotSignals
git pull
rm -f settings.json
pm2 restart tradeBot
echo "✅ Deployed. settings.json reset to defaults."
