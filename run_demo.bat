@echo off
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
title OmniVoice AI Studio - RTX 4060
echo ================================================================
echo    OmniVoice AI Studio - اجرای استودیوی شبیه سازی صدا
echo    کارت گرافیک: NVIDIA GeForce RTX 4060 Laptop GPU
echo    آدرس استودیو در مرورگر: http://127.0.0.1:8001
echo ================================================================
start http://127.0.0.1:8001
.\.venv\Scripts\python.exe web_ui\server.py
pause
