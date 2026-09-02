@echo off

npx tsc -p tsconfig.main.json && npx tsc -p tsconfig.update.json && npm run build && npx electron-builder --config electron-builder.yml --win portable && node scripts\with-update-main.js npx electron-builder --config electron-builder-update.yml --win portable
