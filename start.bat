@echo off
cd /d "%~dp0"
echo ==========================================
echo   OCR 扫描识别 - 一键启动服务
echo ==========================================
echo.

echo [1/2] 启动开发服务器 (localhost:5173)...
start "ocr-dev-server" /min cmd /c "npm run dev"

echo [2/2] 启动公网隧道 (Cloudflare)...
if exist cf-err.log del cf-err.log
start "cloudflare-tunnel" /min cmd /c "tools\cloudflared.exe tunnel --url http://localhost:5173 --no-autoupdate --protocol http2 2>cf-err.log"

echo.
echo 等待隧道建立（约 12 秒）...
timeout /t 12 /nobreak >nul

echo.
echo ==========================================
echo  服务已启动！
echo.
echo  本机访问:  http://localhost:5173/
echo  公网访问:  见下方 URL（分享给他人）
echo ==========================================
echo.
findstr /c:"trycloudflare.com" cf-err.log
echo.
echo 提示：免费公网隧道地址是临时的，每次重启会变化。
echo       请保持此电脑开机，服务才能持续可访问。
echo.
pause
