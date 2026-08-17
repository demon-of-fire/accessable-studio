@echo off
title Accessible Studio
echo Starting Accessible Studio...
echo.
echo If this is the first launch, please install using Accessible-Studio-Setup-3.4.0.exe
echo Otherwise, ensure Accessible Studio is installed and launch it from the Start Menu.
echo.
echo Launching Accessible Studio...
start "" "Accessible Studio.exe"
if errorlevel 1 (
    echo.
    echo Could not find Accessible Studio. Please install first using the setup file.
    pause
)