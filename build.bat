@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

npx tsc -p tsconfig.main.json && npm run build && npx electron-builder --win portable && pause