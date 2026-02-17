@echo off
wt -w 0 new-tab -d "%~dp0." powershell.exe -NoExit -Command "npm start"
