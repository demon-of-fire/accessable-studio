@echo off
title Accessable Studios
echo Starting Accessable Studios...
echo.
echo If this is the first launch, please install using Accessable-Studios-Setup-3.5.0.exe
echo Otherwise, ensure Accessable Studios is installed and launch it from the Start Menu.
echo.
echo Launching Accessable Studios...
start "" "Accessable Studios.exe"
if errorlevel 1 (
    echo.
    echo Could not find Accessable Studios. Please install first using the setup file.
    pause
)