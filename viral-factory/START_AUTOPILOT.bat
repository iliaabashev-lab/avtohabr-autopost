@echo off
chcp 65001 >nul
title AVTOHABR AUTOPILOT (Shorts, Reels, VK, Threads)
cd /d "%~dp0"
python scripts\browser-automator\autopilot_engine.py
if errorlevel 1 pause
