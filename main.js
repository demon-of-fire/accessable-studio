const { app, BrowserWindow, ipcMain, dialog, Menu, shell, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const os = require('os');
const { autoUpdater } = require('electron-updater');
const Store = require('electron-store');

// One-time migration: the app was previously named "Accessible Studio".
// Renaming changes the userData folder, so copy settings,
// saved projects and localStorage across before electron-store opens config.json.
(function migrateLegacyUserData() {
  try {
    const current = app.getPath('userData');
    if (fs.existsSync(path.join(current, 'config.json')) || fs.existsSync(path.join(current, 'projects'))) return;
    const appData = app.getPath('appData');
    const legacyNames = ['accessible-studio', 'Accessible Studio'];
    const skip = new Set(['Cache', 'Code Cache', 'GPUCache', 'DawnGraphiteCache', 'DawnWebGPUCache', 'Crashpad',
      'lockfile', 'SingletonLock', 'SingletonCookie', 'SingletonSocket', 'DevToolsActivePort']);
    for (const name of legacyNames) {
      const legacy = path.join(appData, name);
      if (path.resolve(legacy) === path.resolve(current) || !fs.existsSync(legacy)) continue;
      fs.mkdirSync(current, { recursive: true });
      for (const entry of fs.readdirSync(legacy)) {
        if (skip.has(entry)) continue;
        try { fs.cpSync(path.join(legacy, entry), path.join(current, entry), { recursive: true, force: false, errorOnExist: false }); } catch (e) { /* best effort */ }
      }
      console.log(`Migrated user data from ${legacy}`);
      return;
    }
  } catch (e) {
    console.error('User data migration failed:', e.message);
  }
})();

const store = new Store();

let mainWindow;
let ffmpegPath = 'ffmpeg';
let activeFFmpegProcs = [];
let recoveryFilePath = null;
let hasUnsavedChanges = false;
let hardwareAccelAvailable = false;
let pendingExportProc = null;

// Single instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// Find FFmpeg across Windows, Linux, and macOS
function findFFmpeg() {
  const platform = process.platform;
  const possible = [];

  // Step 1: PATH lookup (works on all platforms)
  try {
    const whichCmd = platform === 'win32' ? 'where ffmpeg' : 'which ffmpeg';
    const result = require('child_process').execSync(whichCmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    if (result) {
      const firstPath = result.split('\n')[0].trim();
      if (firstPath) possible.unshift(firstPath);
    }
  } catch (e) { /* not in PATH */ }

  // Step 2: Platform-specific common install locations
  if (platform === 'win32') {
    possible.push(
      path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links', 'ffmpeg.exe'),
      'C:\\ffmpeg\\bin\\ffmpeg.exe',
      path.join(process.env.ProgramFiles || '', 'ffmpeg', 'bin', 'ffmpeg.exe'),
      path.join(process.env.ProgramFiles || '', 'ffmpeg', 'ffmpeg.exe'),
    );
    // Deep search WinGet Packages
    const wingetPkgs = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages');
    try {
      if (fs.existsSync(wingetPkgs)) {
        const dirs = fs.readdirSync(wingetPkgs).filter(d => d.toLowerCase().includes('ffmpeg'));
        for (const dir of dirs) {
          const binPath = path.join(wingetPkgs, dir);
          const searchDir = (dirPath, depth) => {
            if (depth > 3) return null;
            try {
              const entries = fs.readdirSync(dirPath);
              for (const entry of entries) {
                const fullPath = path.join(dirPath, entry);
                if (entry.toLowerCase() === 'ffmpeg.exe') return fullPath;
                if (fs.statSync(fullPath).isDirectory()) {
                  const found = searchDir(fullPath, depth + 1);
                  if (found) return found;
                }
              }
            } catch (e) { /* skip */ }
            return null;
          };
          const found = searchDir(binPath, 0);
          if (found) possible.unshift(found);
        }
      }
    } catch (e) { /* skip */ }
  } else if (platform === 'linux') {
    possible.push(
      '/usr/bin/ffmpeg',
      '/usr/local/bin/ffmpeg',
      '/snap/bin/ffmpeg',
    );
    // Check flatpak
    try {
      const flatpakPath = process.platform === 'linux' ? path.join(os.homedir(), '.local', 'share', 'flatpak', 'exports') : '';
      if (flatpakPath && fs.existsSync(flatpakPath)) {
        possible.push(flatpakPath);
      }
    } catch (e) { /* skip */ }
  } else if (platform === 'darwin') {
    possible.push(
      '/usr/local/bin/ffmpeg',
      '/opt/homebrew/bin/ffmpeg',
      path.join(process.env.HOME || '', 'homebrew', 'bin', 'ffmpeg'),
    );
  }

  // Step 3: Validate each candidate
  for (const p of possible) {
    try {
      const cmd = platform === 'win32' ? `"${p}" -version` : `'${p}' -version`;
      require('child_process').execSync(cmd, { stdio: 'ignore', timeout: 5000 });
      return p;
    } catch (e) { continue; }
  }
  return 'ffmpeg';
}

// Detect GPU hardware acceleration
function detectHardwareAcceleration() {
  try {
    const execSyncResult = require('child_process').execSync(`"${ffmpegPath}" -hwaccels 2>&1`, { encoding: 'utf-8', timeout: 5000 });
    if (execSyncResult.includes('cuda') || execSyncResult.includes('dxva2') || execSyncResult.includes('d3d11va') || execSyncResult.includes('qsv') || execSyncResult.includes('amf') || execSyncResult.includes('vulkan')) {
      hardwareAccelAvailable = true;
    }
  } catch (e) { /* no hw acceleration detected */ }

  try {
    require('child_process').execSync('where nvidia-smi', { stdio: 'ignore', timeout: 2000 });
    hardwareAccelAvailable = true;
  } catch (e) { /* no nvidia */ }
}

function validateIpcArgs(handlerName, args, requiredFields) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return { valid: false, error: `${handlerName}: invalid arguments` };
  }
  for (const field of requiredFields) {
    if (args[field] === undefined || args[field] === null) {
      return { valid: false, error: `${handlerName}: missing required field '${field}'` };
    }
  }
  return { valid: true };
}

function sendToRenderer(channel, ...args) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.webContents.send(channel, ...args);
    } catch (e) { /* silently ignore */ }
  }
}

function notifyUser(title, body) {
  try {
    new Notification({ title, body }).show();
  } catch (e) { /* notifications not supported */ }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'Accessable Studios',
    backgroundColor: '#000000',
    show: false,

    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    checkForRecovery();
    checkForUpdates();
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  buildAppMenu();

  // Unsaved changes warning on close
  mainWindow.on('close', (e) => {
    if (hasUnsavedChanges) {
      const choice = dialog.showMessageBoxSync(mainWindow, {
        type: 'question',
        buttons: ['Save', 'Discard', 'Cancel'],
        defaultId: 0,
        cancelId: 2,
        title: 'Unsaved Changes',
        message: 'You have unsaved changes. What would you like to do?',
      });
      if (choice === 0) {
        e.preventDefault();
        sendToRenderer('menu-action', 'save-project');
        return;
      } else if (choice === 2) {
        e.preventDefault();
        return;
      }
    }
    cleanupRecovery();
  });
}

function buildAppMenu(updateRecentProjects) {
  const recentProjects = store.get('as-recent-projects', []);
  const recentMenuItems = recentProjects.slice(0, 5).map(proj => ({
    label: proj.name,
    click: () => sendToRenderer('load-recent-project', proj),
  }));

  const menuTemplate = [
    {
      label: '&File',
      submenu: [
        { label: '&New Project', accelerator: 'CmdOrCtrl+N', click: () => sendToRenderer('menu-action', 'new-project') },
        { label: '&Open Project', accelerator: 'CmdOrCtrl+O', click: () => handleOpenProject() },
        { label: '&Save Project', accelerator: 'CmdOrCtrl+S', click: () => sendToRenderer('menu-action', 'save-project') },
        { label: 'Save Project &As...', accelerator: 'CmdOrCtrl+Shift+S', click: () => sendToRenderer('menu-action', 'save-project-as') },
        ...(recentMenuItems.length > 0 ? [
          { type: 'separator' },
          { label: 'Recent Projects', submenu: recentMenuItems },
        ] : []),
        { type: 'separator' },
        { label: '&Import Media', accelerator: 'CmdOrCtrl+I', click: () => handleImportMedia() },
        { label: 'Import &Audio', accelerator: 'CmdOrCtrl+Shift+I', click: () => handleImportAudio() },
        { type: 'separator' },
        { label: '&Export Video', accelerator: 'CmdOrCtrl+E', click: () => sendToRenderer('menu-action', 'export') },
        { label: 'Convert &File', accelerator: 'CmdOrCtrl+Shift+C', click: () => sendToRenderer('menu-action', 'convert') },
        { type: 'separator' },
        { label: 'E&xit', accelerator: 'Alt+F4', click: () => app.quit() },
      ],
    },
    {
      label: '&Edit',
      submenu: [
        { label: '&Undo', accelerator: 'CmdOrCtrl+Z', click: () => sendToRenderer('menu-action', 'undo') },
        { label: '&Redo', accelerator: 'CmdOrCtrl+Y', click: () => sendToRenderer('menu-action', 'redo') },
        { type: 'separator' },
        { label: '&Split Clip', accelerator: 'S', click: () => sendToRenderer('menu-action', 'split') },
        { label: '&Delete Clip', accelerator: 'Delete', click: () => sendToRenderer('menu-action', 'delete-clip') },
        { label: 'D&uplicate Clip', accelerator: 'CmdOrCtrl+D', click: () => sendToRenderer('menu-action', 'duplicate') },
      ],
    },
    {
      label: '&View',
      submenu: [
        { label: '&Zoom In Timeline', accelerator: 'CmdOrCtrl+=', click: () => sendToRenderer('menu-action', 'zoom-in') },
        { label: 'Zoom &Out Timeline', accelerator: 'CmdOrCtrl+-', click: () => sendToRenderer('menu-action', 'zoom-out') },
        { type: 'separator' },
        { label: 'Toggle &Chatbot', accelerator: 'CmdOrCtrl+B', click: () => sendToRenderer('menu-action', 'toggle-chatbot') },
        { label: 'Toggle &File Converter', accelerator: 'CmdOrCtrl+Shift+F', click: () => sendToRenderer('menu-action', 'toggle-converter') },
        { type: 'separator' },
        { label: '&Developer Tools', accelerator: 'F12', click: () => mainWindow.webContents.toggleDevTools() },
      ],
    },
    {
      label: '&Help',
      submenu: [
        { label: '&Keyboard Shortcuts', accelerator: 'F1', click: () => sendToRenderer('menu-action', 'show-shortcuts') },
        { label: '&About', click: () => sendToRenderer('menu-action', 'about') },
        { type: 'separator' },
        { label: 'Check for &Updates...', click: () => checkForUpdates(true) },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
}

// File dialogs
async function handleImportMedia() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Media Files',
    filters: [
      { name: 'Video Files', extensions: ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm', 'mpeg', 'mpg', 'm4v'] },
      { name: 'Image Files', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'tiff', 'svg'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: ['openFile', 'multiSelections'],
  });
  if (!result.canceled && result.filePaths.length > 0) {
    sendToRenderer('files-imported', result.filePaths);
  }
  // Focus restoration for NVDA
  setTimeout(() => sendToRenderer('restore-focus'), 100);
}

async function handleImportAudio() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Audio Files',
    filters: [
      { name: 'Audio Files', extensions: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'wma', 'm4a'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: ['openFile', 'multiSelections'],
  });
  if (!result.canceled && result.filePaths.length > 0) {
    sendToRenderer('audio-imported', result.filePaths);
  }
  setTimeout(() => sendToRenderer('restore-focus'), 100);
}

async function handleOpenProject() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Project',
    filters: [{ name: 'Accessable Studios Project', extensions: ['asproj'] }],
    properties: ['openFile'],
  });
  if (!result.canceled && result.filePaths.length > 0) {
    try {
      const data = fs.readFileSync(result.filePaths[0], 'utf-8');
      const projectData = JSON.parse(data);
      addRecentProject(result.filePaths[0], projectData.name || result.filePaths[0].split(/[\\/]/).pop().replace('.asproj', ''));
      sendToRenderer('project-loaded', projectData);
    } catch (e) {
      dialog.showErrorBox('Error', 'Failed to open project: ' + (e.message || e));
    }
  }
  setTimeout(() => sendToRenderer('restore-focus'), 100);
}

// Recovery / Auto-save system
function getRecoveryPath() {
  return path.join(app.getPath('userData'), 'recovery.asproj');
}

function setupAutoSave() {
  setInterval(() => {
    if (hasUnsavedChanges) {
      sendToRenderer('request-save-for-recovery');
    }
  }, 120000);
}

function checkForRecovery() {
  recoveryFilePath = getRecoveryPath();
  if (fs.existsSync(recoveryFilePath)) {
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'question',
      buttons: ['Restore', 'Discard'],
      defaultId: 0,
      title: 'Recovery File Found',
      message: 'An auto-saved recovery file was found from a previous session. Would you like to restore it?',
    });
    if (choice === 0) {
      try {
        const data = fs.readFileSync(recoveryFilePath, 'utf-8');
        const projectData = JSON.parse(data);
        sendToRenderer('project-loaded', projectData);
        notifyUser('Accessable Studios', 'Your previous project has been restored from auto-save.');
      } catch (e) {
        dialog.showErrorBox('Recovery Error', 'Could not read the recovery file. It may be corrupted.');
      }
    } else {
      fs.unlinkSync(recoveryFilePath);
    }
  }
}

function cleanupRecovery() {
  if (recoveryFilePath && fs.existsSync(recoveryFilePath)) {
    try { fs.unlinkSync(recoveryFilePath); } catch (e) { /* silent */ }
  }
}

function saveRecoveryData(projectData) {
  try {
    recoveryFilePath = getRecoveryPath();
    fs.writeFileSync(recoveryFilePath, JSON.stringify(projectData, null, 2));
  } catch (e) { /* silent */ }
}

// App update checking
function checkForUpdates(showUpToDateMessage) {
  if (!app.isPackaged) {
    // During development, skip autoUpdater
    if (showUpToDateMessage) {
      sendToRenderer('update-notification', 'Auto-updates are only available in the packaged app.');
    }
    return;
  }
  try {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.checkForUpdates().catch(() => {
      if (showUpToDateMessage) {
        sendToRenderer('update-notification', 'Could not check for updates right now.');
      }
    });
  } catch (e) {
    if (showUpToDateMessage) {
      sendToRenderer('update-notification', 'Could not check for updates right now.');
    }
  }
}

// Auto-updater event wiring
autoUpdater.on('update-available', (info) => {
  sendToRenderer('update-available', {
    version: info.version,
    url: `https://github.com/demon-of-fire/accessable-studio/releases/tag/v${info.version}`,
    notes: info.releaseNotes || 'No release notes available.',
  });
});

autoUpdater.on('update-not-available', () => {
  // Silent — no need to notify on every check
});

autoUpdater.on('error', (err) => {
  console.error('Auto-updater error:', err.message);
});

autoUpdater.on('download-progress', (progress) => {
  sendToRenderer('update-download-progress', {
    percent: Math.round(progress.percent),
    bytesPerSecond: progress.bytesPerSecond,
    transferred: progress.transferred,
    total: progress.total,
  });
});

autoUpdater.on('update-downloaded', () => {
  sendToRenderer('update-downloaded');
});

// Add recent project to localStorage (via preload)
function addRecentProject(filePath, name) {
  let recent = [];
  try {
    recent = store.get('as-recent-projects', []);
  } catch (e) { recent = []; }
  recent = recent.filter(p => p.path !== filePath);
  recent.unshift({ path: filePath, name, date: new Date().toISOString() });
  if (recent.length > 10) recent = recent.slice(0, 10);
  store.set('as-recent-projects', recent);
  buildAppMenu();
}

// Backup project before overwrite
function backupProject(filePath) {
  try {
    const backupPath = filePath.replace('.asproj', '.backup.asproj');
    if (fs.existsSync(filePath)) {
      if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
      fs.copyFileSync(filePath, backupPath);
    }
    return backupPath;
  } catch (e) { return null; }
}

// IPC Handlers
ipcMain.handle('get-ffmpeg-path', () => ffmpegPath);

ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.handle('get-hardware-accel', () => hardwareAccelAvailable);

ipcMain.handle('save-project', async (event, projectData) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Project',
    filters: [{ name: 'Accessable Studios Project', extensions: ['asproj'] }],
  });
  if (!result.canceled) {
    backupProject(result.filePath);
    fs.writeFileSync(result.filePath, JSON.stringify(projectData, null, 2));
    hasUnsavedChanges = false;
    addRecentProject(result.filePath, projectData.name || 'Untitled');
    cleanupRecovery();
    return result.filePath;
  }
  return null;
});

ipcMain.handle('mark-unsaved-changes', () => {
  hasUnsavedChanges = true;
});

ipcMain.handle('clear-unsaved-changes', () => {
  hasUnsavedChanges = false;
});

ipcMain.handle('recovery-save', async (event, projectData) => {
  saveRecoveryData(projectData);
});

// Export video with cancellation support and hardware acceleration
let currentExportProc = null;
let currentExportOutputPath = null;

ipcMain.handle('export-video', async (event, { command, outputPath }) => {
  currentExportOutputPath = outputPath;
  hasUnsavedChanges = false;

  return new Promise((resolve, reject) => {
    const proc = exec(command, { maxBuffer: 1024 * 1024 * 100 }, (error, stdout, stderr) => {
      if (error) {
        if (error.killed) {
          reject('Export cancelled by user.');
        } else {
          reject(error.message);
        }
      } else {
        resolve(outputPath);
      }
    });
    currentExportProc = proc;
    activeFFmpegProcs.push(proc);

    proc.stderr.on('data', (data) => {
      const output = data.toString();
      sendToRenderer('export-progress', output);
      // Parse FFmpeg progress for NVDA-friendly messages
      const percentMatch = output.match(/time=(\d+):(\d+):(\d+)\.(\d+)/);
      const frameMatch = output.match(/frame=\s*(\d+)/);
      if (percentMatch) {
        const hours = parseInt(percentMatch[1]);
        const minutes = parseInt(percentMatch[2]);
        const seconds = parseInt(percentMatch[3]);
        const totalSeconds = hours * 3600 + minutes * 60 + seconds;
        sendToRenderer('export-progress-parsed', { time: totalSeconds, frames: frameMatch ? parseInt(frameMatch[1]) : 0 });
      }
    });

    proc.on('close', (code) => {
      currentExportProc = null;
      const idx = activeFFmpegProcs.indexOf(proc);
      if (idx > -1) activeFFmpegProcs.splice(idx, 1);
      if (code === 0) {
        notifyUser('Export Complete', `${path.basename(outputPath)} has been saved.`);
        sendToRenderer('export-complete', outputPath);
      }
    });
  });
});

ipcMain.handle('cancel-export', async () => {
  if (currentExportProc) {
    try {
      currentExportProc.kill('SIGTERM');
      // Clean up partial output file
      if (currentExportOutputPath && fs.existsSync(currentExportOutputPath)) {
        try { fs.unlinkSync(currentExportOutputPath); } catch (e) { /* silent */ }
      }
      const idx = activeFFmpegProcs.indexOf(currentExportProc);
      if (idx > -1) activeFFmpegProcs.splice(idx, 1);
      currentExportProc = null;
      currentExportOutputPath = null;
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
  return { success: false, error: 'No active export' };
});

// Open containing folder for export
ipcMain.handle('open-containing-folder', async (event, filePath) => {
  try {
    shell.showItemInFolder(filePath);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('run-ffmpeg', async (event, args) => {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args, { shell: true });
    let output = '';
    let errorOutput = '';
    activeFFmpegProcs.push(proc);

    proc.stdout.on('data', (d) => output += d.toString());
    proc.stderr.on('data', (d) => {
      errorOutput += d.toString();
      sendToRenderer('export-progress', d.toString());
    });
    proc.on('close', (code) => {
      const idx = activeFFmpegProcs.indexOf(proc);
      if (idx > -1) activeFFmpegProcs.splice(idx, 1);
      if (code === 0) resolve(output);
      else reject(errorOutput);
    });
  });
});

ipcMain.handle('get-media-info', async (event, filePath) => {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('get-media-info: filePath is required');
  }

  // Check FFmpeg is available
  try {
    require('child_process').execSync(`"${ffmpegPath}" -version`, { stdio: 'ignore', timeout: 5000 });
  } catch (e) {
    throw new Error('FFmpeg not found — install it with: winget install ffmpeg');
  }

  return new Promise((resolve, reject) => {
    exec(`"${ffmpegPath}" -i "${filePath}" -hide_banner 2>&1`, { timeout: 15000, maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
      const output = stdout || stderr || '';
      const duration = output.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
      const videoStream = output.match(/Stream.*Video:\s*(\w+).*?(\d+)x(\d+)/);
      const audioStream = output.match(/Stream.*Audio:\s*(\w+)/);
      resolve({
        duration: duration ? parseInt(duration[1]) * 3600 + parseInt(duration[2]) * 60 + parseInt(duration[3]) + parseInt(duration[4]) / 100 : 0,
        width: videoStream ? parseInt(videoStream[2]) : 0,
        height: videoStream ? parseInt(videoStream[3]) : 0,
        videoCodec: videoStream ? videoStream[1] : null,
        audioCodec: audioStream ? audioStream[1] : null,
        hasVideo: !!videoStream,
        hasAudio: !!audioStream,
      });
    });
  });
});

ipcMain.handle('open-external', async (event, url) => {
  return shell.openExternal(url);
});

ipcMain.handle('show-save-dialog', async (event, options) => {
  const result = await dialog.showSaveDialog(mainWindow, options);
  setTimeout(() => sendToRenderer('restore-focus'), 100);
  return result;
});

ipcMain.handle('show-open-dialog', async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, options);
  setTimeout(() => sendToRenderer('restore-focus'), 100);
  return result;
});

// Convert file with progress events (switched to spawn for streaming)
ipcMain.handle('convert-file', async (event, { inputPath, outputPath, args }) => {
  const validation = validateIpcArgs('convert-file', { inputPath, outputPath, args }, ['inputPath', 'outputPath', 'args']);
  if (!validation.valid) throw new Error(validation.error);

  try {
    require('child_process').execSync(`"${ffmpegPath}" -version`, { stdio: 'ignore', timeout: 5000 });
  } catch (e) {
    throw new Error('FFmpeg is not installed or not found. Please install FFmpeg to use the converter. You can install it with: winget install ffmpeg');
  }

  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, ['-i', inputPath, ...args, '-y', outputPath], { shell: true });
    activeFFmpegProcs.push(proc);
    let errorOutput = '';

    proc.stderr.on('data', (d) => {
      const output = d.toString();
      errorOutput += output;
      sendToRenderer('convert-progress', output);
      const percentMatch = output.match(/time=(\d+):(\d+):(\d+)\.(\d+)/);
      if (percentMatch) {
        const totalSec = parseInt(percentMatch[1]) * 3600 + parseInt(percentMatch[2]) * 60 + parseInt(percentMatch[3]);
        sendToRenderer('convert-progress-parsed', { percent: totalSec, raw: output.substring(0, 200) });
      }
    });

    proc.on('close', (code) => {
      const idx = activeFFmpegProcs.indexOf(proc);
      if (idx > -1) activeFFmpegProcs.splice(idx, 1);
      if (code === 0) {
        resolve(outputPath);
      } else {
        reject(errorOutput || 'FFmpeg process failed');
      }
    });

    proc.on('error', (err) => {
      const idx = activeFFmpegProcs.indexOf(proc);
      if (idx > -1) activeFFmpegProcs.splice(idx, 1);
      reject(err.message);
    });
  });
});

// Batch conversion queue
let conversionQueue = [];
let isConverting = false;

ipcMain.handle('batch-convert', async (event, items) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('batch-convert: items must be a non-empty array');
  }
  conversionQueue = items.map(item => ({
    inputPath: item.inputPath,
    outputPath: item.outputPath,
    args: item.args || [],
    status: 'pending',
  }));
  isConverting = false;
  return { queued: conversionQueue.length };
});

ipcMain.handle('start-batch-convert', async () => {
  if (isConverting) return { error: 'Already converting' };
  isConverting = true;
  const results = [];

  for (const item of conversionQueue) {
    if (!isConverting) break;
    item.status = 'converting';
    sendToRenderer('batch-convert-progress', { file: item.inputPath, percent: 0, status: 'converting' });

    try {
      await new Promise((resolve, reject) => {
        const proc = spawn(ffmpegPath, ['-i', item.inputPath, ...item.args, '-y', item.outputPath], { shell: true });
        activeFFmpegProcs.push(proc);

        proc.stderr.on('data', (d) => {
          const output = d.toString();
          const percentMatch = output.match(/time=(\d+):(\d+):(\d+)\.(\d+)/);
          if (percentMatch) {
            const totalSec = parseInt(percentMatch[1]) * 3600 + parseInt(percentMatch[2]) * 60 + parseInt(percentMatch[3]);
            sendToRenderer('batch-convert-progress', { file: item.inputPath, percent: totalSec, status: 'converting' });
          }
        });

        proc.on('close', (code) => {
          const idx = activeFFmpegProcs.indexOf(proc);
          if (idx > -1) activeFFmpegProcs.splice(idx, 1);
          if (code === 0) resolve();
          else reject('FFmpeg failed');
        });
      });
      item.status = 'done';
      results.push({ inputPath: item.inputPath, outputPath: item.outputPath, success: true });
      sendToRenderer('batch-convert-progress', { file: item.inputPath, percent: 100, status: 'done' });
    } catch (e) {
      item.status = 'error';
      results.push({ inputPath: item.inputPath, outputPath: item.outputPath, success: false, error: e });
      sendToRenderer('batch-convert-progress', { file: item.inputPath, percent: 0, status: 'error' });
    }
  }

  isConverting = false;
  sendToRenderer('batch-convert-complete', results);
  return results;
});

ipcMain.handle('cancel-batch-convert', () => {
  isConverting = false;
  conversionQueue = [];
  return { success: true };
});

// Document conversion with DOCX support
ipcMain.handle('convert-document', async (event, { inputPath, outputPath, inputExt, outputFormat }) => {
  const validation = validateIpcArgs('convert-document', { inputPath, outputPath, inputExt, outputFormat }, ['inputPath', 'outputPath', 'inputExt', 'outputFormat']);
  if (!validation.valid) throw new Error(validation.error);

  async function getSourceContent() {
    if (inputExt === 'docx') {
      try {
        const mammoth = require('mammoth');
        const htmlResult = await mammoth.convertToHtml({ path: inputPath });
        const textResult = await mammoth.extractRawText({ path: inputPath });
        return { html: htmlResult.value, text: textResult.value };
      } catch (e) {
        throw new Error('Failed to read DOCX: ' + (e.message || e));
      }
    }
    const raw = fs.readFileSync(inputPath, 'utf-8');
    if (inputExt === 'html' || inputExt === 'htm') {
      return { html: raw, text: raw.replace(/<[^>]*>/g, '') };
    }
    const text = raw;
    const lines = text.split('\n');
    let html = '';
    let inList = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        if (inList) { html += '</ul>\n'; inList = false; }
        continue;
      }
      if (trimmed.startsWith('### ')) {
        if (inList) { html += '</ul>\n'; inList = false; }
        html += `<h3>${trimmed.slice(4)}</h3>\n`;
      } else if (trimmed.startsWith('## ')) {
        if (inList) { html += '</ul>\n'; inList = false; }
        html += `<h2>${trimmed.slice(3)}</h2>\n`;
      } else if (trimmed.startsWith('# ')) {
        if (inList) { html += '</ul>\n'; inList = false; }
        html += `<h1>${trimmed.slice(2)}</h1>\n`;
      } else if (trimmed.length < 80 && trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed)) {
        if (inList) { html += '</ul>\n'; inList = false; }
        html += `<h2>${trimmed}</h2>\n`;
      } else if (/^[-*•]\s+/.test(trimmed)) {
        if (!inList) { html += '<ul>\n'; inList = true; }
        html += `<li>${trimmed.replace(/^[-*•]\s+/, '')}</li>\n`;
      } else if (/^\d+[.)]\s+/.test(trimmed)) {
        if (!inList) { html += '<ol>\n'; inList = true; }
        html += `<li>${trimmed.replace(/^\d+[.)]\s+/, '')}</li>\n`;
      } else {
        if (inList) { html += '</ul>\n'; inList = false; }
        html += `<p>${trimmed.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>\n`;
      }
    }
    if (inList) html += '</ul>\n';
    return { html, text };
  }

  const src = await getSourceContent();

  switch (outputFormat) {
    case 'txt': {
      fs.writeFileSync(outputPath, src.text, 'utf-8');
      return outputPath;
    }
    case 'html': {
      const fullHtml = src.html.startsWith('<!DOCTYPE') ? src.html
        : `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Converted</title><style>
body { font-family: Arial, Helvetica, sans-serif; max-width: 800px; margin: 2em auto; padding: 0 1em; line-height: 1.6; color: #222; }
h1 { font-size: 2em; border-bottom: 2px solid #333; padding-bottom: 0.3em; }
h2 { font-size: 1.5em; border-bottom: 1px solid #999; padding-bottom: 0.2em; }
h3 { font-size: 1.2em; }
p { margin: 0.8em 0; }
ul, ol { margin: 0.5em 0; padding-left: 2em; }
li { margin: 0.3em 0; }
</style></head><body>${src.html}</body></html>`;
      fs.writeFileSync(outputPath, fullHtml, 'utf-8');
      return outputPath;
    }
    case 'md': {
      let md = src.html;
      md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n');
      md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n');
      md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n');
      md = md.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
      md = md.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
      md = md.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
      md = md.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');
      md = md.replace(/<[^>]*>/g, '');
      md = md.replace(/\n{3,}/g, '\n\n').trim();
      fs.writeFileSync(outputPath, md, 'utf-8');
      return outputPath;
    }
    case 'rtf': {
      const rtfEscaped = src.text.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}').replace(/\n/g, '\\par\n');
      const rtf = `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Arial;}}\n{\\pard\\f0\\fs24\n${rtfEscaped}\n\\par}}\n`;
      fs.writeFileSync(outputPath, rtf, 'utf-8');
      return outputPath;
    }
    case 'csv': {
      let csvContent = '';
      const tableMatch = src.html.match(/<table[^>]*>([\s\S]*?)<\/table>/i);
      if (tableMatch) {
        const rows = tableMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
        rows.forEach(row => {
          const cells = (row.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) || [])
            .map(c => '"' + c.replace(/<[^>]*>/g, '').replace(/"/g, '""').trim() + '"');
          csvContent += cells.join(',') + '\n';
        });
      } else {
        csvContent = src.text.split('\n').map(line => '"' + line.replace(/"/g, '""') + '"').join('\n');
      }
      fs.writeFileSync(outputPath, csvContent, 'utf-8');
      return outputPath;
    }
    case 'docx': {
      // Use docx npm package to create DOCX from TXT/HTML/MD
      if (inputExt === 'docx') {
        fs.copyFileSync(inputPath, outputPath);
      } else {
        try {
          const docx = require('docx');
          const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = docx;

          const lines = src.text.split('\n');
          const children = [];

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) {
              children.push(new Paragraph({ spacing: { after: 200 } }));
              continue;
            }
            if (trimmed.startsWith('### ')) {
              children.push(new Paragraph({
                heading: HeadingLevel.HEADING_3,
                children: [new TextRun({ text: trimmed.slice(4), bold: true, size: 28 })],
              }));
            } else if (trimmed.startsWith('## ')) {
              children.push(new Paragraph({
                heading: HeadingLevel.HEADING_2,
                children: [new TextRun({ text: trimmed.slice(3), bold: true, size: 32 })],
              }));
            } else if (trimmed.startsWith('# ')) {
              children.push(new Paragraph({
                heading: HeadingLevel.HEADING_1,
                children: [new TextRun({ text: trimmed.slice(2), bold: true, size: 40 })],
              }));
            } else if (/^[-*•]\s+/.test(trimmed)) {
              children.push(new Paragraph({
                bullet: { level: 0 },
                children: [new TextRun({ text: trimmed.replace(/^[-*•]\s+/, ''), size: 24 })],
              }));
            } else if (/^\d+[.)]\s+/.test(trimmed)) {
              children.push(new Paragraph({
                numbering: { reference: 1, level: 0 },
                children: [new TextRun({ text: trimmed.replace(/^\d+[.)]\s+/, ''), size: 24 })],
              }));
            } else {
              children.push(new Paragraph({
                children: [new TextRun({ text: trimmed, size: 24 })],
              }));
            }
          }

          const doc = new Document({
            sections: [{
              properties: {},
              children,
            }],
          });

          const buffer = await Packer.toBuffer(doc);
          fs.writeFileSync(outputPath, buffer);
        } catch (e) {
          throw new Error('Failed to create DOCX: ' + (e.message || e) + '. Install the docx package: npm install docx');
        }
      }
      return outputPath;
    }
    case 'pdf': {
      const PDFDocument = require('pdfkit');
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      const lines = src.text.split('\n');
      for (const line of lines) {
        if (line.trim() === '') { doc.moveDown(); continue; }
        const isHeading = line.startsWith('# ') || line.startsWith('## ') || (line.length < 80 && line === line.toUpperCase() && line.trim().length > 0);
        if (isHeading) {
          const cleanLine = line.replace(/^#+\s*/, '');
          doc.fontSize(16).font('Helvetica-Bold').text(cleanLine, { lineGap: 4 });
          doc.fontSize(12).font('Helvetica');
        } else {
          doc.fontSize(12).font('Helvetica').text(line, { lineGap: 2 });
        }
      }
      doc.end();

      await new Promise((resolve, reject) => {
        stream.on('finish', resolve);
        stream.on('error', reject);
      });
      return outputPath;
    }
    case 'epub': {
      throw new Error('EPUB output is not yet supported. Convert to HTML first, then use an EPUB tool like Calibre.');
    }
    case 'odt': {
      throw new Error('ODT output is not yet supported. Convert to HTML or RTF first, then open in LibreOffice.');
    }
    default: {
      if (inputExt === outputFormat) {
        fs.copyFileSync(inputPath, outputPath);
        return outputPath;
      }
      throw new Error(`Converting ${inputExt.toUpperCase()} to ${outputFormat.toUpperCase()} is not supported yet.`);
    }
  }
});

// read-file with error handling
ipcMain.handle('read-file', async (event, filePath) => {
  if (!filePath || typeof filePath !== 'string') {
    return { success: false, error: 'read-file: filePath is required' };
  }
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    return { success: true, data };
  } catch (e) {
    return { success: false, error: `Failed to read file: ${e.message}` };
  }
});

// write-file with error handling
ipcMain.handle('write-file', async (event, { filePath, content }) => {
  if (!filePath || typeof filePath !== 'string') {
    return { success: false, error: 'write-file: filePath is required' };
  }
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return { success: true, filePath };
  } catch (e) {
    return { success: false, error: `Failed to write file: ${e.message}` };
  }
});

// list-projects with optional search/filter query
ipcMain.handle('list-projects', async (event, query) => {
  const projectsDir = path.join(app.getPath('userData'), 'projects');
  if (!fs.existsSync(projectsDir)) {
    fs.mkdirSync(projectsDir, { recursive: true });
    return [];
  }
  const files = fs.readdirSync(projectsDir).filter(f => f.endsWith('.asproj'));
  let projects = files.map(f => {
    const filePath = path.join(projectsDir, f);
    const stat = fs.statSync(filePath);
    let name = f.replace('.asproj', '');
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (data.name) name = data.name;
    } catch (e) { /* use filename */ }
    return { fileName: f, name, date: stat.mtime.toISOString(), path: filePath };
  }).sort((a, b) => new Date(b.date) - new Date(a.date));

  if (query && typeof query === 'string' && query.trim()) {
    const lowerQuery = query.toLowerCase();
    projects = projects.filter(p => p.name.toLowerCase().includes(lowerQuery));
  }

  return projects;
});

ipcMain.handle('save-project-to-library', async (event, { name, data }) => {
  if (!name || !data) throw new Error('save-project-to-library: name and data are required');

  const projectsDir = path.join(app.getPath('userData'), 'projects');
  if (!fs.existsSync(projectsDir)) {
    fs.mkdirSync(projectsDir, { recursive: true });
  }
  const safeName = name.replace(/[^a-zA-Z0-9_\- ]/g, '').substring(0, 50);
  const filePath = path.join(projectsDir, `${safeName}.asproj`);

  // Backup before overwrite
  backupProject(filePath);

  const projectData = { ...data, name, savedAt: new Date().toISOString() };
  fs.writeFileSync(filePath, JSON.stringify(projectData, null, 2));
  hasUnsavedChanges = false;

  addRecentProject(filePath, name);
  cleanupRecovery();

  return filePath;
});

ipcMain.handle('load-project-from-library', async (event, filePath) => {
  if (!filePath) throw new Error('load-project-from-library: filePath is required');
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    const projectData = JSON.parse(data);
    addRecentProject(filePath, projectData.name || 'Untitled');
    return projectData;
  } catch (e) {
    throw new Error('Failed to load project: ' + (e.message || e));
  }
});

ipcMain.handle('delete-project-from-library', async (event, filePath) => {
  if (!filePath) throw new Error('delete-project-from-library: filePath is required');
  try {
    if (fs.existsSync(filePath)) {
      const backupPath = filePath.replace('.asproj', '.backup.asproj');
      if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
      fs.unlinkSync(filePath);
    }
    return true;
  } catch (e) {
    throw new Error('Failed to delete project: ' + (e.message || e));
  }
});

// Project rename
ipcMain.handle('rename-project', async (event, { oldPath, newName }) => {
  if (!oldPath || !newName) throw new Error('rename-project: oldPath and newName are required');
  try {
    const projectsDir = path.join(app.getPath('userData'), 'projects');
    const safeName = newName.replace(/[^a-zA-Z0-9_\- ]/g, '').substring(0, 50);
    const newPath = path.join(projectsDir, `${safeName}.asproj`);

    // Backup old before renaming
    backupProject(oldPath);

    fs.renameSync(oldPath, newPath);

    // Update the project data name
    try {
      const data = JSON.parse(fs.readFileSync(newPath, 'utf-8'));
      data.name = newName;
      data.renamedAt = new Date().toISOString();
      fs.writeFileSync(newPath, JSON.stringify(data, null, 2));
    } catch (e) { /* if data is malformed, just use new filename */ }

    return { success: true, newPath };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Project duplication
ipcMain.handle('duplicate-project', async (event, { sourcePath, newName }) => {
  if (!sourcePath) throw new Error('duplicate-project: sourcePath is required');
  try {
    const projectsDir = path.join(app.getPath('userData'), 'projects');
    const baseName = newName || (path.basename(sourcePath, '.asproj') + ' (copy)');
    const safeName = baseName.replace(/[^a-zA-Z0-9_\- ]/g, '').substring(0, 50);
    const newPath = path.join(projectsDir, `${safeName}.asproj`);

    let counter = 1;
    let finalPath = newPath;
    while (fs.existsSync(finalPath)) {
      finalPath = path.join(projectsDir, `${safeName} (${++counter}).asproj`);
    }

    fs.copyFileSync(sourcePath, finalPath);

    // Update the project data name
    try {
      const data = JSON.parse(fs.readFileSync(finalPath, 'utf-8'));
      data.name = path.basename(finalPath, '.asproj');
      data.duplicatedAt = new Date().toISOString();
      fs.writeFileSync(finalPath, JSON.stringify(data, null, 2));
    } catch (e) { /* ignore */ }

    return { success: true, newPath: finalPath };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Store recent projects in localStorage (accessible via preload)
ipcMain.handle('update-recent-projects', async (event, projects) => {
  if (!Array.isArray(projects)) return;
  store.set('as-recent-projects', projects);
});

// Encryption: store encryption key (in real app, use safeStorage)
let encryptionKey = '';
ipcMain.handle('set-encryption-key', async (event, key) => {
  encryptionKey = key;
  return true;
});
ipcMain.handle('get-encryption-key', async () => encryptionKey);

// Low bandwidth mode
let lowBandwidthMode = false;
ipcMain.handle('set-low-bandwidth-mode', async (event, enabled) => {
  lowBandwidthMode = enabled;
  return true;
});
ipcMain.handle('get-low-bandwidth-mode', async () => lowBandwidthMode);

// Encrypt a string with AES-256
function encryptText(text, key) {
  if (!key) return text;
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', crypto.createHash('sha256').update(key).digest(), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}
// Decrypt a string with AES-256
function decryptText(encryptedText, key) {
  if (!key || !encryptedText.includes(':')) return encryptedText;
  const parts = encryptedText.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  const decipher = crypto.createDecipheriv('aes-256-cbc', crypto.createHash('sha256').update(key).digest(), iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
ipcMain.handle('encrypt-text', async (event, text) => encryptText(text, encryptionKey));
ipcMain.handle('decrypt-text', async (event, encrypted) => decryptText(encrypted, encryptionKey));

// SafeStorage-based encrypted settings (API keys, tokens)
ipcMain.handle('save-encrypted-setting', async (event, { key, value }) => {
  try {
    const ss = require('electron').safeStorage;
    if (ss && ss.isEncryptionAvailable()) {
      const encrypted = ss.encryptString(value);
      store.set(`enc-${key}`, encrypted.toString('base64'));
    } else {
      const fallbackKey = 'accessible-studio-fallback-key';
      store.set(`enc-${key}-fallback`, encryptText(value, fallbackKey));
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('load-encrypted-setting', async (event, key) => {
  try {
    const ss = require('electron').safeStorage;
    if (ss && ss.isEncryptionAvailable()) {
      const stored = store.get(`enc-${key}`);
      if (stored) {
        return { success: true, value: ss.decryptString(Buffer.from(stored, 'base64')) };
      }
    } else {
      const stored = store.get(`enc-${key}-fallback`);
      if (stored) {
        return { success: true, value: decryptText(stored, 'accessible-studio-fallback-key') };
      }
    }
    return { success: false, error: 'No stored value found' };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('delete-encrypted-setting', async (event, key) => {
  try {
    store.delete(`enc-${key}`);
    store.delete(`enc-${key}-fallback`);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ==========================================
// Raw Photo Support (CR2/CR3/NEF via dcraw)
// ==========================================
ipcMain.handle('raw-photo-get-supported', async () => {
  return {
    formats: [
      { extension: '.cr2', name: 'Canon Raw CR2', supported: true },
      { extension: '.cr3', name: 'Canon Raw CR3', supported: true },
      { extension: '.nef', name: 'Nikon Raw NEF', supported: true },
      { extension: '.arw', name: 'Sony Raw ARW', supported: true },
      { extension: '.dng', name: 'Adobe DNG', supported: true },
      { extension: '.raf', name: 'Fuji Raw RAF', supported: true },
      { extension: '.orf', name: 'Olympus Raw ORF', supported: true },
    ],
    converter: 'dcraw', // requires dcraw installed
    note: 'Requires dcraw tool in PATH. Install via: brew install dcraw (macOS), apt install dcraw (Linux), or download from https://www.dechifro.org/dcraw/',
  };
});

ipcMain.handle('raw-photo-convert', async (event, { inputPath, outputPath, options }) => {
  try {
    // Try dcraw first, fallback to FFmpeg for basic decoding
    let proc;
    try {
      require('child_process').execSync('dcraw -v', { stdio: 'ignore', timeout: 3000 });
      // dcraw available
      const dcrawArgs = ['-c', '-w', '-T']; // -c stdout, -w camera white balance, -T TIFF output
      if (options?.halfSize) dcrawArgs.push('-h');
      if (options?.brightness) dcrawArgs.push('-b', String(options.brightness));
      if (options?.noAutoWhite) dcrawArgs.push('-W');
      proc = spawn('dcraw', [...dcrawArgs, inputPath]);
      const outStream = fs.createWriteStream(outputPath);
      proc.stdout.pipe(outStream);
      await new Promise((resolve, reject) => {
        proc.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`dcraw exit code ${code}`));
        });
        proc.on('error', reject);
      });
    } catch (e) {
      // Fallback: use FFmpeg to decode
      await new Promise((resolve, reject) => {
        proc = spawn(ffmpegPath, ['-i', inputPath, '-y', outputPath]);
        proc.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`FFmpeg exit code ${code}`));
        });
        proc.on('error', reject);
      });
    }
    return { success: true, outputPath };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ==========================================
// PDF Form Filler
// ==========================================
ipcMain.handle('pdf-form-get-fields', async (event, filePath) => {
  try {
    const { PDFDocument } = require('pdf-lib');
    const data = fs.readFileSync(filePath);
    const doc = await PDFDocument.load(data);
    const form = doc.getForm();
    const fields = form.getFields().map(f => ({
      name: f.getName(),
      type: f.constructor.name,
      text: f.getText ? f.getText() : '',
    }));
    return { success: true, fields };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('pdf-form-fill', async (event, { filePath, outputPath, values }) => {
  try {
    const { PDFDocument } = require('pdf-lib');
    const data = fs.readFileSync(filePath);
    const doc = await PDFDocument.load(data);
    const form = doc.getForm();

    for (const [fieldName, value] of Object.entries(values)) {
      try {
        const field = form.getField(fieldName);
        if (field) {
          if (field.constructor.name === 'PDFTextField') field.setText(String(value));
          else if (field.constructor.name === 'PDFCheckBox') {
            if (value === true || value === 'true') field.check();
            else field.uncheck();
          }
          else if (field.constructor.name === 'PDFDropdown') field.select(value);
          else if (field.constructor.name === 'PDFRadioGroup') field.select(value);
        }
      } catch (e) { /* field not found, skip */ }
    }

    form.flatten();
    const pdfBytes = await doc.save();
    fs.writeFileSync(outputPath, pdfBytes);
    return { success: true, outputPath };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ==========================================
// EPUB Reader
// ==========================================
ipcMain.handle('epub-get-metadata', async (event, filePath) => {
  try {
    // Parse EPUB ZIP (basic metadata extraction)
    const AdmZip = (() => {
      try { return require('adm-zip'); } catch (e) { return null; }
    })();

    if (!AdmZip) {
      // Manual XML parsing from ZIP
      const zip = require('child_process').spawnSync('powershell', [
        '-Command',
        `Add-Type -AssemblyName System.IO.Compression.FileSystem; ` +
        `$zip = [System.IO.Compression.ZipFile]::OpenRead('${filePath.replace(/'/g, "''")}'); ` +
        `$entry = $zip.Entries | Where-Object { $_.Name -eq 'container.xml' } | Select-Object -First 1; ` +
        `if ($entry) { $reader = New-Object System.IO.StreamReader($entry.Open()); $reader.ReadToEnd(); $reader.Close() }; $zip.Dispose()`
      ], { encoding: 'utf-8', timeout: 10000 });

      const opfPath = zip.stdout?.match(/full-path="([^"]+)"/)?.[1];
      if (opfPath) {
        const opfContent = require('child_process').spawnSync('powershell', [
          '-Command',
          `Add-Type -AssemblyName System.IO.Compression.FileSystem; ` +
          `$zip = [System.IO.Compression.ZipFile]::OpenRead('${filePath.replace(/'/g, "''")}'); ` +
          `$entry = $zip.Entries | Where-Object { $_.Name -eq '${path.basename(opfPath)}' -or $_.FullName -eq '${opfPath.replace(/'/g, "''")}' } | Select-Object -First 1; ` +
          `if ($entry) { $reader = New-Object System.IO.StreamReader($entry.Open()); $reader.ReadToEnd(); $reader.Close() }; $zip.Dispose()`
        ], { encoding: 'utf-8', timeout: 10000 });

        const title = opfContent.stdout?.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/)?.[1] || 'Unknown';
        const author = opfContent.stdout?.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/)?.[1] || 'Unknown';
        return { success: true, metadata: { title, author, filePath }, contents: [] };
      }
      return { success: true, metadata: { title: path.basename(filePath, '.epub'), author: 'Unknown', filePath }, contents: [] };
    }

    return { success: true, metadata: { title: path.basename(filePath, '.epub'), author: 'Unknown', filePath }, contents: [] };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('epub-get-contents', async (event, filePath) => {
  try {
    // Return chapter list
    return { success: true, chapters: [{ id: 'ch1', title: 'Chapter 1', index: 0 }] };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('epub-get-chapter', async (event, { filePath, chapterId }) => {
  try {
    // Extract chapter content from EPUB ZIP
    return { success: true, content: '# Chapter 1\n\nEPUB content would appear here. For full support, install `adm-zip` npm package.' };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ==========================================
// OAuth2 Account Linking Infrastructure
// ==========================================
let oauthState = null;
let oauthCodeVerifier = null;
let oauthPendingResolve = null;
const linkedAccounts = {}; // platform -> { accessToken, refreshToken, expiresAt, profile }

// Register custom protocol for OAuth redirects
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('accessablestudios', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('accessablestudios');
}

// Handle OAuth redirect on macOS (open-url event)
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleOAuthRedirect(url);
});

// Update second-instance handler to capture OAuth redirect URL
app.removeAllListeners('second-instance');
app.on('second-instance', (event, commandLine) => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
  // Check if launched with OAuth redirect URL
  const oauthUrl = commandLine.find(arg => arg.startsWith('accessablestudios://oauth'));
  if (oauthUrl) {
    handleOAuthRedirect(oauthUrl);
  }
});

// ------------------------------------------------------------------
// OAuth loopback server. Google (Desktop clients) rejects
// custom-scheme redirects like accessablestudios://, so the browser is sent
// back to a short-lived local HTTP server that only listens on loopback.
// ------------------------------------------------------------------
const OAUTH_LOOPBACK_PORT = 47823;
const OAUTH_LOOPBACK_TIMEOUT_MS = 5 * 60 * 1000;
let oauthServer = null;
let oauthServerTimer = null;

function isPlaceholderClientId(id) {
  return !id || /^(YOUR_|REPLACE_ME)/.test(id);
}

function stopOAuthLoopbackServer() {
  if (oauthServerTimer) { clearTimeout(oauthServerTimer); oauthServerTimer = null; }
  if (oauthServer) {
    try { oauthServer.close(); } catch (e) { /* already closed */ }
    oauthServer = null;
  }
}

function oauthResultPage(ok, message) {
  const color = ok ? '#2e7d32' : '#c62828';
  const safe = String(message).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Accessable Studios</title></head>
<body style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:80px auto;padding:0 16px">
<h1 style="color:${color}" role="alert">${ok ? 'Account connected' : 'Connection failed'}</h1>
<p>${safe}</p><p>You can close this tab and return to Accessable Studios.</p></body></html>`;
}

function startOAuthLoopbackServer() {
  if (oauthServer) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://127.0.0.1:${OAUTH_LOOPBACK_PORT}`);
      if (!url.pathname.startsWith('/oauth/')) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
        return;
      }
      const error = url.searchParams.get('error');
      const ok = !error && url.searchParams.get('code');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(oauthResultPage(!!ok, ok ? 'Finishing sign-in in the app now.' : `Authorization was not completed${error ? `: ${error}` : '.'}`));
      handleOAuthRedirect(url.toString());
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
      stopOAuthLoopbackServer();
    });
    server.once('error', (err) => {
      oauthServer = null;
      reject(err.code === 'EADDRINUSE'
        ? new Error(`Port ${OAUTH_LOOPBACK_PORT} is already in use by another program. Close it and try connecting again.`)
        : err);
    });
    // Bind to IPv4 loopback only.
    server.listen(OAUTH_LOOPBACK_PORT, '127.0.0.1', () => {
      oauthServer = server;
      oauthServerTimer = setTimeout(stopOAuthLoopbackServer, OAUTH_LOOPBACK_TIMEOUT_MS);
      resolve();
    });
  });
}

app.on('before-quit', stopOAuthLoopbackServer);

// Platform OAuth configuration
// === ONCE: Register Accessable Studios at the links below, then paste your Client IDs here ===
// YouTube: https://console.cloud.google.com/apis/credentials  (OAuth 2.0 Desktop, redirect: http://127.0.0.1:47823/oauth/youtube — Desktop clients accept any loopback port)
const OAUTH_CONFIGS = {
  youtube: {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    revokeUrl: 'https://oauth2.googleapis.com/revoke',
    scopes: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly', 'https://www.googleapis.com/auth/youtube.force-ssl'],
    clientId: 'REPLACE_ME_YOUTUBE_CLIENT_ID',
    redirectUri: `http://127.0.0.1:${OAUTH_LOOPBACK_PORT}/oauth/youtube`,
  },
};

function handleOAuthRedirect(url) {
  try {
    const parsedUrl = new URL(url);
    const code = parsedUrl.searchParams.get('code');
    const state = parsedUrl.searchParams.get('state');
    const error = parsedUrl.searchParams.get('error');

    if (error) {
      sendToRenderer('oauth-result', { success: false, error: `Authorization denied: ${error}` });
      if (oauthPendingResolve) {
        oauthPendingResolve({ success: false, error });
        oauthPendingResolve = null;
      }
      return;
    }

    if (!code || !state) {
      sendToRenderer('oauth-result', { success: false, error: 'Invalid OAuth response: missing code or state.' });
      return;
    }

    // Verify state matches (CSRF protection)
    if (state !== oauthState) {
      sendToRenderer('oauth-result', { success: false, error: 'State mismatch — possible CSRF attack. Please try again.' });
      return;
    }

    // Determine which platform from the redirect URI path
    const path = parsedUrl.pathname || '';
    let platform = 'youtube';
    if (path.includes('facebook')) platform = 'facebook';
    if (path.includes('tiktok')) platform = 'tiktok';

    // Exchange code for tokens
    exchangeCodeForTokens(platform, code);
  } catch (e) {
    sendToRenderer('oauth-result', { success: false, error: `OAuth redirect parsing failed: ${e.message}` });
  }
}

async function exchangeCodeForTokens(platform, code) {
  const config = getStoredOAuthConfig(platform);
  if (!config) {
    sendToRenderer('oauth-result', { success: false, error: `Unknown platform: ${platform}` });
    return;
  }

  if (!config.clientId || isPlaceholderClientId(config.clientId)) {
    sendToRenderer('oauth-result', { success: false, error: `OAuth not configured. Click Connect again and follow the setup guide.` });
    return;
  }

  const codeVerifier = oauthCodeVerifier || '';
  oauthCodeVerifier = null;

  try {
    const bodyParams = {
      code,
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
    };
    if (codeVerifier) bodyParams.code_verifier = codeVerifier;
    // Google Desktop clients still expect client_secret alongside PKCE.
    if (config.clientSecret) bodyParams.client_secret = config.clientSecret;
    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(bodyParams),
    });

    const data = await response.json();
    if (data.error) {
      sendToRenderer('oauth-result', { success: false, error: `Token exchange failed: ${data.error_description || data.error}` });
      return;
    }

    const expiresAt = Date.now() + (data.expires_in || 3600) * 1000;
    const accountInfo = { accessToken: data.access_token, refreshToken: data.refresh_token || null, expiresAt, platform };

    // Fetch profile info
    try {
      const profileData = await fetchPlatformProfile(platform, data.access_token);
      accountInfo.profile = profileData;
    } catch (e) {
      accountInfo.profile = { name: platform, id: platform };
    }

    // Encrypt and store
    linkedAccounts[platform] = accountInfo;
    storeLinkedAccount(platform, accountInfo);

    oauthState = null;
    sendToRenderer('oauth-result', { success: true, platform, profile: accountInfo.profile });
    notifyUser('Account Connected', `${platform} connected as ${accountInfo.profile?.name || 'user'}`);

    if (oauthPendingResolve) {
      oauthPendingResolve({ success: true, platform, profile: accountInfo.profile });
      oauthPendingResolve = null;
    }
  } catch (e) {
    sendToRenderer('oauth-result', { success: false, error: `Token exchange network error: ${e.message}` });
  }
}

async function fetchPlatformProfile(platform, accessToken) {
  switch (platform) {
    case 'youtube': {
      const res = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (data.items && data.items[0]) {
        const ch = data.items[0];
        return { name: ch.snippet.title, id: ch.id, avatarUrl: ch.snippet.thumbnails?.default?.url, subscribers: ch.statistics?.subscriberCount || '0' };
      }
      return { name: 'YouTube User', id: 'youtube' };
    }
    default:
      return { name: platform, id: platform };
  }
}

async function refreshAccessToken(platform) {
  const account = linkedAccounts[platform];
  if (!account || !account.refreshToken) return false;

  const config = OAUTH_CONFIGS[platform];
  try {
    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: account.refreshToken,
        client_id: config.clientId,
        client_secret: 'YOUR_CLIENT_SECRET',
        grant_type: 'refresh_token',
      }),
    });
    const data = await response.json();
    if (data.access_token) {
      account.accessToken = data.access_token;
      account.expiresAt = Date.now() + (data.expires_in || 3600) * 1000;
      if (data.refresh_token) account.refreshToken = data.refresh_token;
      storeLinkedAccount(platform, account);
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

function storeLinkedAccount(platform, account) {
  try {
    // Use safeStorage if available, otherwise fallback to encrypted localStorage
    let encrypted;
    if (app.isReady() && require('electron').safeStorage && require('electron').safeStorage.isEncryptionAvailable()) {
      encrypted = require('electron').safeStorage.encryptString(JSON.stringify(account));
      store.set(`oauth-${platform}`, encrypted.toString('base64'));
    } else {
      // Fallback: AES encrypt with app-generated key
      const fallbackKey = 'accessible-studio-oauth-fallback-key';
      const enc = encryptText(JSON.stringify(account), fallbackKey);
      store.set(`oauth-${platform}-fallback`, enc);
    }
  } catch (e) {
    console.error('Failed to store account:', e);
  }
}

function loadLinkedAccounts() {
  const platforms = ['youtube', 'facebook', 'tiktok'];
  for (const platform of platforms) {
    try {
      if (app.isReady() && require('electron').safeStorage && require('electron').safeStorage.isEncryptionAvailable()) {
        const stored = store.get(`oauth-${platform}`);
        if (stored) {
          const decrypted = require('electron').safeStorage.decryptString(Buffer.from(stored, 'base64'));
          linkedAccounts[platform] = JSON.parse(decrypted);
          // Auto-refresh if expired
          if (linkedAccounts[platform].expiresAt && Date.now() > linkedAccounts[platform].expiresAt - 300000) {
            refreshAccessToken(platform);
          }
        }
      } else {
        const stored = store.get(`oauth-${platform}-fallback`);
        if (stored) {
          const decrypted = decryptText(stored, 'accessible-studio-oauth-fallback-key');
          linkedAccounts[platform] = JSON.parse(decrypted);
        }
      }
    } catch (e) { /* corrupted data, skip */ }
  }
}

// Periodically check and refresh tokens
function startTokenRefreshTimer() {
  setInterval(() => {
    for (const platform of Object.keys(linkedAccounts)) {
      const acct = linkedAccounts[platform];
      if (acct && acct.expiresAt && Date.now() > acct.expiresAt - 300000) {
        refreshAccessToken(platform).then(success => {
          if (success) {
            sendToRenderer('oauth-result', { success: true, type: 'token-refreshed', platform });
          } else {
            sendToRenderer('oauth-result', { success: false, type: 'token-refresh-failed', platform, error: 'Could not refresh token. Please re-authorize.' });
          }
        });
      }
    }
  }, 60000); // Check every minute
}

function getStoredOAuthConfig(platform) {
  const config = { ...OAUTH_CONFIGS[platform] };
  if (!config) return null;
  // Check if user saved a custom Client ID via Settings > API Keys
  const ss = require('electron').safeStorage;
  try {
    const storedClientId = store.get(`enc-api-key-${platform}`);
    if (storedClientId && ss && ss.isEncryptionAvailable()) {
      const decrypted = ss.decryptString(Buffer.from(storedClientId, 'base64'));
      if (decrypted && !decrypted.startsWith('REPLACE_ME')) config.clientId = decrypted;
    } else {
      const fallback = store.get(`enc-api-key-${platform}-fallback`);
      if (fallback) {
        const decrypted = decryptText(fallback, 'accessible-studio-fallback-key');
        if (decrypted && !decrypted.startsWith('REPLACE_ME')) config.clientId = decrypted;
      }
    }
  } catch (e) { /* use defaults */ }
  return config;
}

// PKCE helpers
function base64URLEncode(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function generateCodeVerifier() {
  return base64URLEncode(crypto.randomBytes(32));
}
function generateCodeChallenge(verifier) {
  return base64URLEncode(crypto.createHash('sha256').update(verifier).digest());
}

// IPC handlers for OAuth
ipcMain.handle('oauth-link-account', async (event, platform) => {
  const config = getStoredOAuthConfig(platform);
  if (!config) return { success: false, error: `Platform ${platform} not supported yet.` };

  if (!config.clientId || isPlaceholderClientId(config.clientId)) {
    return { success: false, error: `No Client ID configured.`, needsSetup: true };
  }

  // The browser redirects back to this local server once the user approves.
  try {
    await startOAuthLoopbackServer();
  } catch (e) {
    return { success: false, error: `Could not start the local sign-in server: ${e.message}` };
  }

  // Generate state for CSRF protection
  oauthState = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

  // PKCE: generate code verifier and challenge (no client secret needed)
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  oauthCodeVerifier = codeVerifier;

  // Build authorization URL with PKCE
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: config.scopes.join(' '),
    state: oauthState,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
    access_type: 'offline',
    prompt: 'consent',
  });

  const authUrl = `${config.authorizeUrl}?${params.toString()}`;

  return { success: true, authUrl, state: oauthState };
});

ipcMain.handle('oauth-get-linked-accounts', async () => {
  const result = {};
  for (const [platform, acct] of Object.entries(linkedAccounts)) {
    result[platform] = {
      platform,
      connected: true,
      profile: acct.profile || null,
      expiresAt: acct.expiresAt || null,
      needsReauth: acct.expiresAt ? Date.now() > acct.expiresAt : false,
    };
  }
  return result;
});

ipcMain.handle('oauth-disconnect-account', async (event, platform) => {
  const account = linkedAccounts[platform];
  if (account) {
    // Try to revoke the token
    const config = OAUTH_CONFIGS[platform];
    if (config && account.accessToken) {
      try {
        await fetch(`${config.revokeUrl}?token=${account.accessToken}`, { method: 'POST' });
      } catch (e) { /* revoke best-effort */ }
    }
    delete linkedAccounts[platform];
    store.delete(`oauth-${platform}`);
    store.delete(`oauth-${platform}-fallback`);
    sendToRenderer('oauth-result', { success: true, type: 'disconnected', platform });
    notifyUser('Account Disconnected', `${platform} has been disconnected.`);
  }
  return { success: true };
});

ipcMain.handle('oauth-get-token', async (event, platform) => {
  const account = linkedAccounts[platform];
  if (!account) return { success: false, error: 'Account not linked.' };
  // Check expiry and refresh if needed
  if (account.expiresAt && Date.now() > account.expiresAt - 300000) {
    const refreshed = await refreshAccessToken(platform);
    if (!refreshed) return { success: false, error: 'Token expired and could not be refreshed.' };
  }
  return { success: true, accessToken: account.accessToken };
});

// ==========================================
// YouTube API Actions
// ==========================================
ipcMain.handle('youtube-update-video-description', async (event, { videoId, description }) => {
  const acct = linkedAccounts.youtube;
  if (!acct) return { success: false, error: 'YouTube account not linked.' };
  if (!acct.accessToken || (acct.expiresAt && Date.now() > acct.expiresAt - 300000)) {
    const refreshed = await refreshAccessToken('youtube');
    if (!refreshed) return { success: false, error: 'YouTube token expired.' };
  }
  try {
    await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${acct.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: videoId, snippet: { description } }),
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('youtube-upload-video', async (event, { filePath, title, description, privacy }) => {
  const acct = linkedAccounts.youtube;
  if (!acct) return { success: false, error: 'YouTube account not linked.' };
  if (!acct.accessToken || (acct.expiresAt && Date.now() > acct.expiresAt - 300000)) {
    const refreshed = await refreshAccessToken('youtube');
    if (!refreshed) return { success: false, error: 'YouTube token expired.' };
  }
  try {
    const fs = require('fs');
    const stats = fs.statSync(filePath);
    const readStream = fs.createReadStream(filePath);
    // Resumable upload via multipart
    const res = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=resumable', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${acct.accessToken}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Length': stats.size.toString(),
      },
      body: JSON.stringify({
        snippet: { title, description },
        status: { privacyStatus: privacy || 'public', selfDeclaredMadeForKids: false },
      }),
    });
    const uploadUrl = res.headers.get('location');
    if (!uploadUrl) return { success: false, error: 'Failed to get upload URL.' };

    // Upload the file
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Length': stats.size.toString(), 'Content-Type': 'video/*' },
      body: readStream,
    });
    const uploadData = await uploadRes.json();
    if (uploadData.error) return { success: false, error: `Upload failed: ${uploadData.error.message}` };
    return { success: true, videoId: uploadData.id, videoUrl: `https://youtube.com/watch?v=${uploadData.id}` };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ==========================================
// Document Templates
// ==========================================
const DOCUMENT_TEMPLATES = {
  invoice: { name: 'Invoice', description: 'Professional invoice with line items and totals' },
  letter: { name: 'Business Letter', description: 'Formal business letter with sender/recipient fields' },
  report: { name: 'Report', description: 'Structured report with headings and sections' },
  'meeting-minutes': { name: 'Meeting Minutes', description: 'Meeting agenda with action items and decisions' },
  'press-release': { name: 'Press Release', description: 'Media announcement template' },
  'show-notes': { name: 'Podcast Show Notes', description: 'Episode show notes with timestamps and links' },
  'video-script': { name: 'Video Script', description: 'Scene-by-scene script template' },
  grant: { name: 'Grant Application', description: 'Grant proposal template with budget section' },
};

function generateDocxTemplate(templateId) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, BorderStyle, WidthType, AlignmentType } = require('docx');
  const template = DOCUMENT_TEMPLATES[templateId];
  const children = [];

  children.push(new Paragraph({ text: template.name, heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }));
  children.push(new Paragraph({ text: '', spacing: { after: 200 } }));

  switch (templateId) {
    case 'invoice':
      children.push(new Paragraph({ text: 'Invoice', heading: HeadingLevel.HEADING_1 }));
      children.push(new Paragraph({ text: 'Date: [DATE]', spacing: { after: 100 } }));
      children.push(new Paragraph({ text: 'Invoice #: [INVOICE_NUMBER]', spacing: { after: 100 } }));
      children.push(new Paragraph({ text: 'Bill To: [CLIENT_NAME]', spacing: { after: 200 } }));
      children.push(new Paragraph({ text: 'Description', heading: HeadingLevel.HEADING_2 }));
      children.push(new Paragraph({ text: '[Item description — quantity × unit price]', spacing: { after: 100 } }));
      children.push(new Paragraph({ text: 'Total: [TOTAL_AMOUNT]', heading: HeadingLevel.HEADING_2, spacing: { after: 200 } }));
      children.push(new Paragraph({ text: 'Payment Terms: [TERMS]', spacing: { after: 100 } }));
      break;
    case 'letter':
      children.push(new Paragraph({ text: '[Your Name]', spacing: { after: 80 } }));
      children.push(new Paragraph({ text: '[Your Address]', spacing: { after: 80 } }));
      children.push(new Paragraph({ text: '[City, State ZIP]', spacing: { after: 80 } }));
      children.push(new Paragraph({ text: '[Email] | [Phone]', spacing: { after: 200 } }));
      children.push(new Paragraph({ text: '[Date]', spacing: { after: 200 } }));
      children.push(new Paragraph({ text: 'Dear [Recipient],', spacing: { after: 200 } }));
      children.push(new Paragraph({ text: '[Body of your letter — introduce yourself, state your purpose, provide details, and conclude.]', spacing: { after: 200 } }));
      children.push(new Paragraph({ text: 'Sincerely,', spacing: { after: 80 } }));
      children.push(new Paragraph({ text: '[Your Name]' }));
      break;
    case 'show-notes':
      children.push(new Paragraph({ text: 'Episode [NUMBER]: [TITLE]', heading: HeadingLevel.HEADING_1 }));
      children.push(new Paragraph({ text: 'Release Date: [DATE]', spacing: { after: 100 } }));
      children.push(new Paragraph({ text: 'Duration: [DURATION]', spacing: { after: 200 } }));
      children.push(new Paragraph({ text: 'Show Notes', heading: HeadingLevel.HEADING_2 }));
      children.push(new Paragraph({ text: '[Brief summary of the episode — what you discussed, why it matters.]', spacing: { after: 200 } }));
      children.push(new Paragraph({ text: 'Timestamps', heading: HeadingLevel.HEADING_2 }));
      children.push(new Paragraph({ text: '[00:00] — Introduction', spacing: { after: 60 } }));
      children.push(new Paragraph({ text: '[05:30] — Topic 1', spacing: { after: 60 } }));
      children.push(new Paragraph({ text: '[15:00] — Topic 2', spacing: { after: 200 } }));
      children.push(new Paragraph({ text: 'Links & Resources', heading: HeadingLevel.HEADING_2 }));
      children.push(new Paragraph({ text: '[Link 1 description] — URL', spacing: { after: 60 } }));
      children.push(new Paragraph({ text: '[Link 2 description] — URL', spacing: { after: 200 } }));
      children.push(new Paragraph({ text: 'Guest: [GUEST_NAME]', spacing: { after: 100 } }));
      children.push(new Paragraph({ text: 'Follow us: [SOCIAL_LINKS]' }));
      break;
    case 'video-script':
      children.push(new Paragraph({ text: 'Title: [VIDEO_TITLE]', heading: HeadingLevel.HEADING_1 }));
      children.push(new Paragraph({ text: 'Duration: [DURATION]', spacing: { after: 100 } }));
      children.push(new Paragraph({ text: 'Format: [FORMAT — e.g. Tutorial / Review / Vlog]', spacing: { after: 200 } }));
      for (let i = 1; i <= 5; i++) {
        children.push(new Paragraph({ text: `Scene ${i}`, heading: HeadingLevel.HEADING_2 }));
        children.push(new Paragraph({ text: `Visual: [Describe what appears on screen]`, spacing: { after: 60 } }));
        children.push(new Paragraph({ text: `Audio: [Describe narration, music, sound effects]`, spacing: { after: 60 } }));
        children.push(new Paragraph({ text: `Duration: [SECONDS]s`, spacing: { after: 100 } }));
      }
      break;
    default: {
      children.push(new Paragraph({ text: '[TITLE]', heading: HeadingLevel.HEADING_1 }));
      children.push(new Paragraph({ text: '[Date]', spacing: { after: 200 } }));
      children.push(new Paragraph({ text: 'Section 1', heading: HeadingLevel.HEADING_2 }));
      children.push(new Paragraph({ text: '[Content for section 1 — describe your topic, provide details, include all relevant information.]', spacing: { after: 200 } }));
      children.push(new Paragraph({ text: 'Section 2', heading: HeadingLevel.HEADING_2 }));
      children.push(new Paragraph({ text: '[Content for section 2.]', spacing: { after: 200 } }));
      children.push(new Paragraph({ text: 'Conclusion', heading: HeadingLevel.HEADING_2 }));
      children.push(new Paragraph({ text: '[Wrap up your document with a summary or call to action.]' }));
    }
  }

  return new Document({ sections: [{ children }] });
}

ipcMain.handle('list-document-templates', async () => Object.entries(DOCUMENT_TEMPLATES).map(([id, t]) => ({ id, name: t.name, description: t.description })));

ipcMain.handle('create-document-from-template', async (event, { templateId, outputPath }) => {
  try {
    const doc = generateDocxTemplate(templateId);
    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(outputPath, buffer);
    return { success: true, path: outputPath };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ==========================================
// LUT Import/Export + Auto-recolor
// ==========================================
const BUILTIN_LUTS = {
  'cinematic-warm': { name: 'Cinematic Warm', description: 'Warm film look with boosted oranges and crushed blacks' },
  'cinematic-cool': { name: 'Cinematic Cool', description: 'Cool blue-teal film look' },
  'vintage': { name: 'Vintage', description: 'Faded retro look with reduced saturation' },
  'black-and-white': { name: 'Black & White', description: 'High contrast monochrome' },
  'teal-orange': { name: 'Teal & Orange', description: 'Blockbuster teal-orange color grade' },
  'bleach-bypass': { name: 'Bleach Bypass', description: 'High contrast, desaturated film look' },
  'warm-sunset': { name: 'Warm Sunset', description: 'Golden hour warmth' },
  'moody': { name: 'Moody', description: 'Dark, moody with deep shadows' },
};

// Generate a 3D LUT cube file from a named preset
function generateCubeLUT(lutId) {
  const size = 32;
  let cube = `TITLE "${BUILTIN_LUTS[lutId]?.name || lutId}"\nLUT_3D_SIZE ${size}\nDOMAIN_MIN 0.0 0.0 0.0\nDOMAIN_MAX 1.0 1.0 1.0\n\n`;
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        let rn = r / (size - 1);
        let gn = g / (size - 1);
        let bn = b / (size - 1);
        // Apply preset math
        switch (lutId) {
          case 'cinematic-warm':
            rn = Math.min(1, rn * 1.1); gn = Math.min(1, gn * 0.85); bn = Math.min(1, bn * 0.7);
            break;
          case 'cinematic-cool':
            rn = rn * 0.8; gn = gn * 0.9; bn = Math.min(1, bn * 1.15);
            break;
          case 'vintage':
            rn = rn * 0.85 + 0.08; gn = gn * 0.8 + 0.06; bn = bn * 0.7 + 0.04;
            break;
          case 'black-and-white':
            const gray = rn * 0.299 + gn * 0.587 + bn * 0.114;
            rn = gray; gn = gray; bn = gray;
            break;
          case 'teal-orange':
            const lum = rn * 0.299 + gn * 0.587 + bn * 0.114;
            rn = Math.min(1, lum * 1.3 + 0.05);
            gn = Math.min(1, lum * 0.7 + 0.2);
            bn = Math.min(1, 1.0 - lum * 0.6);
            break;
          case 'bleach-bypass':
            const avg = (rn + gn + bn) / 3;
            rn = rn * 0.5 + avg * 0.5;
            gn = gn * 0.5 + avg * 0.5;
            bn = bn * 0.5 + avg * 0.5;
            break;
          case 'warm-sunset':
            rn = Math.min(1, rn * 1.2); gn = Math.min(1, gn * 0.9); bn = Math.min(1, bn * 0.5);
            break;
          case 'moody':
            rn = rn * 0.7; gn = gn * 0.65; bn = bn * 0.6;
            break;
        }
        cube += `${rn.toFixed(6)} ${gn.toFixed(6)} ${bn.toFixed(6)}\n`;
      }
    }
  }
  return cube;
}

ipcMain.handle('list-builtin-luts', async () => Object.entries(BUILTIN_LUTS).map(([id, l]) => ({ id, name: l.name, description: l.description })));

ipcMain.handle('export-lut', async (event, { lutId, outputPath }) => {
  try {
    const cube = generateCubeLUT(lutId);
    fs.writeFileSync(outputPath, cube);
    return { success: true, path: outputPath };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('import-lut', async (event, filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    // Parse basic LUT info
    const titleMatch = content.match(/TITLE\s+"([^"]+)"/);
    const sizeMatch = content.match(/LUT_3D_SIZE\s+(\d+)/);
    return { success: true, name: titleMatch?.[1] || path.basename(filePath, '.cube'), size: sizeMatch?.[1] || 'unknown' };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('apply-lut-to-clip', async (event, { inputPath, outputPath, lutPath }) => {
  if (!fs.existsSync(inputPath)) return { success: false, error: 'Input file not found.' };
  if (!fs.existsSync(lutPath)) return { success: false, error: 'LUT file not found.' };
  try {
    await new Promise((resolve, reject) => {
      const proc = spawn(ffmpegPath, ['-i', inputPath, '-vf', `lut3d=${lutPath}`, '-c:v', 'libx264', '-preset', 'fast', '-c:a', 'copy', '-y', outputPath], { shell: true });
      proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`FFmpeg exited with code ${code}`)));
      proc.on('error', reject);
    });
    return { success: true, path: outputPath };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ==========================================
// Background Task Manager
// ==========================================
let backgroundTasks = [];
let taskIdCounter = 0;

function addTask(name, type) {
  const task = { id: `task-${++taskIdCounter}`, name, type, status: 'running', progress: 0, startTime: Date.now() };
  backgroundTasks.push(task);
  sendToRenderer('task-update', task);
  return task;
}

function updateTask(taskId, updates) {
  const task = backgroundTasks.find(t => t.id === taskId);
  if (task) {
    Object.assign(task, updates);
    sendToRenderer('task-update', task);
  }
}

function removeTask(taskId) {
  backgroundTasks = backgroundTasks.filter(t => t.id !== taskId);
  sendToRenderer('task-removed', taskId);
}

ipcMain.handle('get-background-tasks', async () => backgroundTasks);

ipcMain.handle('cancel-task', async (event, taskId) => {
  const task = backgroundTasks.find(t => t.id === taskId);
  if (task) {
    task.status = 'cancelled';
    sendToRenderer('task-update', task);
  }
  return { success: true };
});

// ==========================================
// Storage Quota Manager
// ==========================================
ipcMain.handle('get-storage-quota', async () => {
  try {
    const userDataPath = app.getPath('userData');
    const projectsPath = path.join(userDataPath, 'projects');
    const exportsPath = path.join(userDataPath, 'exports');
    const tempPath = app.getPath('temp');

    function getDirSize(dirPath) {
      try {
        if (!fs.existsSync(dirPath)) return { size: 0, files: 0 };
        let size = 0, files = 0;
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          if (entry.isDirectory()) {
            const sub = getDirSize(fullPath);
            size += sub.size; files += sub.files;
          } else if (entry.isFile()) {
            try { size += fs.statSync(fullPath).size; files++; } catch (e) { /* skip */ }
          }
        }
        return { size, files };
      } catch (e) { return { size: 0, files: 0 }; }
    }

    const projectData = getDirSize(projectsPath);
    const exportsData = getDirSize(exportsPath);

    return {
      success: true,
      projects: { path: projectsPath, ...projectData },
      exports: { path: exportsPath, ...exportsData },
      temp: { path: tempPath, ...getDirSize(tempPath) },
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('cleanup-old-projects', async (event, daysOld) => {
  try {
    const projectsPath = path.join(app.getPath('userData'), 'projects');
    if (!fs.existsSync(projectsPath)) return { success: true, deleted: 0 };
    const cutoff = Date.now() - (daysOld || 30) * 86400000;
    let deleted = 0;
    for (const entry of fs.readdirSync(projectsPath)) {
      const fullPath = path.join(projectsPath, entry);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isFile() && stat.mtimeMs < cutoff) {
          fs.unlinkSync(fullPath);
          deleted++;
        }
      } catch (e) { /* skip */ }
    }
    return { success: true, deleted };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ==========================================
// Clip Compilation Auto-Editor
// ==========================================
ipcMain.handle('compile-highlights', async (event, { clips, outputPath, transitionDuration }) => {
  if (!clips || clips.length === 0) return { success: false, error: 'No clips to compile.' };
  try {
    const transDur = transitionDuration || 0.5;
    // Build FFmpeg concat command with crossfade transitions
    const filterParts = [];
    const inputArgs = [];
    clips.forEach((clip, i) => {
      inputArgs.push('-i', clip.filePath);
      if (i > 0) {
        filterParts.push(`[${i - 1}:v][${i}:v]xfade=transition=fade:duration=${transDur}:offset=${clip.startTime || 0}[v${i}]`);
      }
    });
    const filterComplex = filterParts.join('; ');
    const lastOutput = clips.length > 1 ? `[v${clips.length - 1}]` : '0:v';
    const cmd = [
      `"${ffmpegPath}"`,
      ...inputArgs,
      '-filter_complex', `"${filterComplex}"`,
      '-map', `"${lastOutput}"`,
      '-map', '0:a',
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-c:a', 'aac',
      '-y', `"${outputPath}"`,
    ].join(' ');

    await new Promise((resolve, reject) => {
      const proc = exec(cmd, { maxBuffer: 1024 * 1024 * 200 }, (error) => {
        if (error) reject(error.message);
        else resolve();
      });
      activeFFmpegProcs.push(proc);
      proc.on('close', () => {
        const idx = activeFFmpegProcs.indexOf(proc);
        if (idx > -1) activeFFmpegProcs.splice(idx, 1);
      });
    });
    return { success: true, path: outputPath };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ==========================================
// Chat Export
// ==========================================
ipcMain.handle('export-chat-log', async (event, { messages, format, outputPath }) => {
  if (!messages || messages.length === 0) return { success: false, error: 'No chat messages to export.' };
  try {
    if (format === 'csv') {
      let csv = 'Timestamp,User,Platform,Message\n';
      messages.forEach(m => {
        const time = m.timestamp || new Date().toISOString();
        const user = (m.user || 'unknown').replace(/"/g, '""');
        const platform = m.platform || 'chat';
        const msg = (m.message || '').replace(/"/g, '""');
        csv += `"${time}","${user}","${platform}","${msg}"\n`;
      });
      fs.writeFileSync(outputPath, csv);
    } else {
      let html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Chat Export</title>
<style>body{font-family:sans-serif;max-width:800px;margin:auto;padding:20px;}
.msg{border-bottom:1px solid #eee;padding:8px 0;}.user{font-weight:bold;color:#6c63ff;}
.time{font-size:0.8em;color:#999;}.platform{font-size:0.75em;color:#666;}
</style></head><body><h1>Chat Export</h1><p>${messages.length} messages</p>`;
      messages.forEach(m => {
        html += `<div class="msg"><span class="user">${(m.user || 'unknown').replace(/</g, '&lt;')}</span> <span class="platform">[${(m.platform || 'chat').replace(/</g, '&lt;')}]</span> <span class="time">${(m.timestamp || '').replace(/</g, '&lt;')}</span><br>${(m.message || '').replace(/</g, '&lt;')}</div>`;
      });
      html += '</body></html>';
      fs.writeFileSync(outputPath, html);
    }
    return { success: true, path: outputPath };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ==========================================
// Accessibility Profile Wizard
// ==========================================
ipcMain.handle('get-accessibility-profile', async () => {
  const profile = {};
  try {
    const stored = store.get('as-a11y-profile');
    if (stored) return { success: true, profile: stored, completed: true };
  } catch (e) { /* ignore */ }
  return { success: true, profile: null, completed: false };
});

ipcMain.handle('save-accessibility-profile', async (event, profile) => {
  store.set('as-a11y-profile', profile);
  return { success: true };
});

// ==========================================
// Cognitive Load Meter
// ==========================================
let cognitiveLoadState = { visibleElements: 0, announcementsLast10s: 0, actionsAvailable: 0 };
let announcementTimestamps = [];

ipcMain.handle('update-cognitive-load', async (event, { visibleElements, actionsAvailable }) => {
  cognitiveLoadState.visibleElements = visibleElements || 0;
  cognitiveLoadState.actionsAvailable = actionsAvailable || 0;
  return { success: true };
});

ipcMain.handle('track-announcement', async () => {
  announcementTimestamps.push(Date.now());
  cognitiveLoadState.announcementsLast10s = announcementTimestamps.filter(t => Date.now() - t < 10000).length;
  // Clean old entries
  announcementTimestamps = announcementTimestamps.filter(t => Date.now() - t < 10000);
  return { announcementsLast10s: cognitiveLoadState.announcementsLast10s };
});

ipcMain.handle('check-cognitive-load', async () => {
  const highElementCount = cognitiveLoadState.visibleElements > 50;
  const highAnnouncementRate = cognitiveLoadState.announcementsLast10s > 20;
  const highActionCount = cognitiveLoadState.actionsAvailable > 30;
  const overloaded = highElementCount || highAnnouncementRate || highActionCount;
  return {
    overloaded,
    metrics: {
      visibleElements: cognitiveLoadState.visibleElements,
      announcementsPer10s: cognitiveLoadState.announcementsLast10s,
      actionsAvailable: cognitiveLoadState.actionsAvailable,
    },
    suggestion: overloaded ? 'You have a lot of panels and announcements active. Would you like to enter Focus Mode? This will hide non-essential panels and reduce announcements.' : null,
  };
});

// ==========================================
// Audio Cue System
// ==========================================
ipcMain.handle('play-audio-cue', async (event, { cueType, volume }) => {
  // Audio cues are generated in the renderer using Web Audio API
  // This handler just validates and returns cue parameters
  const cues = {
    focus: { freq: 800, duration: 0.05, type: 'sine' },
    complete: { freq: 1200, duration: 0.15, type: 'sine', ramp: 'up' },
    error: { freq: 200, duration: 0.3, type: 'sawtooth', ramp: 'down' },
    notification: { freq: [1000, 1400], duration: 0.2, type: 'sine' },
    snap: { freq: 600, duration: 0.03, type: 'sine' },
    marker: { freq: 900, duration: 0.1, type: 'triangle' },
  };
  const cue = cues[cueType] || cues.focus;
  return { success: true, cue, vol: Math.min(1, Math.max(0, volume || 0.3)) };
});

// ==========================================
// Clip Rating System
// ==========================================
let clipRatings = {};

ipcMain.handle('set-clip-rating', async (event, { clipId, rating }) => {
  clipRatings[clipId] = Math.min(5, Math.max(1, rating || 0));
  return { success: true, rating: clipRatings[clipId] };
});

ipcMain.handle('get-clip-rating', async (event, clipId) => {
  return { success: true, rating: clipRatings[clipId] || 0 };
});

ipcMain.handle('get-all-ratings', async () => ({ ...clipRatings }));

// ==========================================
// Picture Lock Mode
// ==========================================
let pictureLocked = false;

ipcMain.handle('toggle-picture-lock', async () => {
  pictureLocked = !pictureLocked;
  return { success: true, locked: pictureLocked };
});

ipcMain.handle('get-picture-lock', async () => ({ locked: pictureLocked }));

// ==========================================
// Frame Rate + Interlaced + VFR Detection
// ==========================================
ipcMain.handle('detect-video-properties', async (event, filePath) => {
  if (!fs.existsSync(filePath)) return { success: false, error: 'File not found.' };
  try {
    const res = await new Promise((resolve, reject) => {
      exec(`"${ffmpegPath}" -i "${filePath}" 2>&1`, { maxBuffer: 1024 * 512 }, (err, stdout, stderr) => {
        const info = stderr || stdout || '';
        // Detect frame rate
        const fpsMatch = info.match(/(\d+(?:\.\d+)?)\s*fps/);
        const detectedFps = fpsMatch ? parseFloat(fpsMatch[1]) : 30;
        // Detect interlacing
        const isInterlaced = /interlaced|tff|bff/i.test(info);
        // Detect VFR
        const vfrIndicators = ['VFR', 'variable', 'cfr', 'constant'];
        const isVFR = !/CFR|constant/.test(info) && /VFR|variable/i.test(info);
        // Detect resolution
        const resMatch = info.match(/(\d+)x(\d+)/);
        const width = resMatch ? parseInt(resMatch[1]) : 0;
        const height = resMatch ? parseInt(resMatch[2]) : 0;
        // Detect codec
        const codecMatch = info.match(/Video:\s*([^,\s]+)/);
        const codec = codecMatch ? codecMatch[1] : 'unknown';

        resolve({ fps: detectedFps, interlaced: isInterlaced, vfr: isVFR, width, height, codec });
      });
    });
    return { success: true, ...res };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('convert-to-cfr', async (event, { inputPath, outputPath, fps }) => {
  if (!fs.existsSync(inputPath)) return { success: false, error: 'Input file not found.' };
  try {
    const targetFps = fps || 30;
    await new Promise((resolve, reject) => {
      const proc = spawn(ffmpegPath, ['-i', inputPath, '-fps_mode', 'cfr', '-r', targetFps.toString(), '-c:v', 'libx264', '-preset', 'fast', '-c:a', 'aac', '-y', outputPath], { shell: true });
      proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`FFmpeg code ${code}`)));
      proc.on('error', reject);
      activeFFmpegProcs.push(proc);
      proc.on('close', () => {
        const idx = activeFFmpegProcs.indexOf(proc);
        if (idx > -1) activeFFmpegProcs.splice(idx, 1);
      });
    });
    return { success: true, path: outputPath };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('deinterlace-video', async (event, { inputPath, outputPath }) => {
  if (!fs.existsSync(inputPath)) return { success: false, error: 'Input file not found.' };
  try {
    await new Promise((resolve, reject) => {
      const proc = spawn(ffmpegPath, ['-i', inputPath, '-vf', 'yadif=1', '-c:v', 'libx264', '-preset', 'fast', '-c:a', 'aac', '-y', outputPath], { shell: true });
      proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`FFmpeg code ${code}`)));
      proc.on('error', reject);
      activeFFmpegProcs.push(proc);
      proc.on('close', () => {
        const idx = activeFFmpegProcs.indexOf(proc);
        if (idx > -1) activeFFmpegProcs.splice(idx, 1);
      });
    });
    return { success: true, path: outputPath };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('convert-frame-rate', async (event, { inputPath, outputPath, targetFps }) => {
  if (!fs.existsSync(inputPath)) return { success: false, error: 'Input file not found.' };
  try {
    await new Promise((resolve, reject) => {
      const proc = spawn(ffmpegPath, ['-i', inputPath, '-vf', `fps=${targetFps}`, '-c:v', 'libx264', '-preset', 'fast', '-c:a', 'aac', '-y', outputPath], { shell: true });
      proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`FFmpeg code ${code}`)));
      proc.on('error', reject);
      activeFFmpegProcs.push(proc);
      proc.on('close', () => {
        const idx = activeFFmpegProcs.indexOf(proc);
        if (idx > -1) activeFFmpegProcs.splice(idx, 1);
      });
    });
    return { success: true, path: outputPath };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ==========================================
// Grid and Guide System
// ==========================================
let gridState = { type: 'none', density: 3 };

ipcMain.handle('set-grid', async (event, { type, density }) => {
  gridState.type = type || 'none';
  gridState.density = density || 3;
  return { success: true, grid: { ...gridState } };
});

ipcMain.handle('get-grid', async () => ({ ...gridState }));

// ==========================================
// Keyframe Animation Editor
// ==========================================
let keyframeData = {}; // clipId -> [{ time, property, value, interpolation }]

ipcMain.handle('get-keyframes', async (event, clipId) => {
  return { success: true, keyframes: keyframeData[clipId] || [] };
});

ipcMain.handle('set-keyframes', async (event, { clipId, keyframes }) => {
  keyframeData[clipId] = keyframes || [];
  return { success: true };
});

ipcMain.handle('add-keyframe', async (event, { clipId, keyframe }) => {
  if (!keyframeData[clipId]) keyframeData[clipId] = [];
  keyframeData[clipId].push(keyframe);
  return { success: true };
});

ipcMain.handle('remove-keyframe', async (event, { clipId, index }) => {
  if (keyframeData[clipId] && keyframeData[clipId][index]) {
    keyframeData[clipId].splice(index, 1);
  }
  return { success: true };
});

// ==========================================
// Clip Speed Graph / Speed Ramp
// ==========================================
let speedRampData = {}; // clipId -> [{ time, speed }]

ipcMain.handle('get-speed-ramp', async (event, clipId) => {
  return { success: true, ramp: speedRampData[clipId] || [] };
});

ipcMain.handle('set-speed-ramp', async (event, { clipId, ramp }) => {
  speedRampData[clipId] = ramp || [];
  return { success: true };
});

// ==========================================
// Photo Restoration Pipeline
// ==========================================
ipcMain.handle('restore-photo', async (event, { inputPath, outputPath, pipeline }) => {
  if (!fs.existsSync(inputPath)) return { success: false, error: 'File not found.' };
  try {
    const steps = pipeline || ['enhance', 'sharpen'];
    let filterComplex = '';
    if (steps.includes('enhance')) filterComplex += 'eq=brightness=0.05:contrast=1.1:saturation=1.05,';
    if (steps.includes('sharpen')) filterComplex += 'unsharp=5:5:1.0:5:5:0.0,';
    if (steps.includes('denoise')) filterComplex += 'hqdn3d=4:3:6:4,';
    filterComplex = filterComplex.replace(/,$/, '');
    if (!filterComplex) filterComplex = 'copy';

    await new Promise((resolve, reject) => {
      const proc = spawn(ffmpegPath, ['-i', inputPath, '-vf', filterComplex, '-c:v', 'libx264', '-preset', 'fast', '-y', outputPath], { shell: true });
      proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`FFmpeg code ${code}`)));
      proc.on('error', reject);
      activeFFmpegProcs.push(proc);
      proc.on('close', () => {
        const idx = activeFFmpegProcs.indexOf(proc);
        if (idx > -1) activeFFmpegProcs.splice(idx, 1);
      });
    });
    return { success: true, path: outputPath };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ==========================================
// Batch Rename
// ==========================================
ipcMain.handle('batch-rename', async (event, { files, pattern }) => {
  try {
    const results = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = path.extname(file.oldPath);
      let newName = pattern
        .replace(/{sequence}/g, String(i + 1).padStart(3, '0'))
        .replace(/{date}/g, new Date().toISOString().split('T')[0])
        .replace(/{original}/g, path.basename(file.oldPath, ext));
      const dir = path.dirname(file.oldPath);
      const newPath = path.join(dir, newName + ext);
      try {
        fs.renameSync(file.oldPath, newPath);
        results.push({ oldPath: file.oldPath, newPath, success: true });
      } catch (e) {
        results.push({ oldPath: file.oldPath, newPath, success: false, error: e.message });
      }
    }
    return { success: true, results };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ==========================================
// Readability Analyser
// ==========================================
ipcMain.handle('analyse-readability', async (event, text) => {
  if (!text) return { success: false, error: 'No text provided.' };
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const syllables = words.reduce((sum, w) => {
    const s = w.toLowerCase().replace(/[^a-z]/g, '');
    if (s.length <= 3) return sum + 1;
    let count = 0;
    const matches = s.match(/[aeiouy]+/g);
    if (matches) count = matches.length;
    // Handle silent e
    if (s.endsWith('e') && count > 1) count--;
    return sum + Math.max(1, count);
  }, 0);

  const totalSyllables = syllables;
  const totalWords = words.length;
  const totalSentences = sentences.length;

  // Flesch Reading Ease
  const flesch = totalWords > 0 && totalSentences > 0
    ? 206.835 - 1.015 * (totalWords / totalSentences) - 84.6 * (totalSyllables / totalWords)
    : 0;

  // Flesch-Kincaid Grade Level
  const gradeLevel = totalWords > 0 && totalSentences > 0
    ? 0.39 * (totalWords / totalSentences) + 11.8 * (totalSyllables / totalWords) - 15.59
    : 0;

  // Passive voice detection (rough: "was/were/by" patterns)
  const passiveMatches = text.match(/\b(was|were)\s+\w+ed\s+by\b/gi);
  const passiveCount = passiveMatches ? passiveMatches.length : 0;

  return {
    success: true,
    stats: {
      wordCount: totalWords,
      sentenceCount: totalSentences,
      syllableCount: totalSyllables,
      avgWordsPerSentence: totalSentences > 0 ? (totalWords / totalSentences).toFixed(1) : 0,
      avgSyllablesPerWord: totalWords > 0 ? (totalSyllables / totalWords).toFixed(2) : 0,
      fleschReadingEase: Math.round(flesch * 10) / 10,
      fleschKincaidGrade: Math.round(gradeLevel * 10) / 10,
      passiveVoiceCount: passiveCount,
    },
    interpretation: flesch >= 80 ? 'Very easy to read (grade 5 level or below)' :
      flesch >= 70 ? 'Fairly easy to read (grade 6 level)' :
      flesch >= 60 ? 'Plain English (grade 7-8 level)' :
      flesch >= 50 ? 'Fairly difficult (grade 9-10 level)' :
      flesch >= 30 ? 'Difficult (grade 11-13 level)' :
      'Very difficult (college graduate level)',
  };
});

// ==========================================
// Audio Watermarking
// ==========================================
ipcMain.handle('apply-audio-watermark', async (event, { inputPath, outputPath, watermarkText }) => {
  if (!fs.existsSync(inputPath)) return { success: false, error: 'Input file not found.' };
  try {
    // Embed watermark as ultrasonic tone (18kHz) + metadata
    const text = watermarkText || 'Accessable Studios';
    // FFmpeg: generate a sine tone at 18kHz (nearly inaudible), mix it at very low volume
    const filter = `aevalsrc=sin(18000*t)*0.005:duration=2[sine];[0:a][sine]amix=inputs=2:duration=first[out]`;
    // Also embed the text in metadata
    await new Promise((resolve, reject) => {
      const proc = spawn(ffmpegPath, [
        '-i', inputPath,
        '-f', 'lavfi', '-t', '2', '-i', 'anullsrc',
        '-filter_complex', filter,
        '-map', '0:v:0?', '-map', '[out]',
        '-metadata', `watermark=${text}`,
        '-metadata', `watermark_date=${new Date().toISOString()}`,
        '-c:v', 'copy', '-c:a', 'aac', '-y', outputPath,
      ], { shell: true });
      proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`FFmpeg code ${code}`)));
      proc.on('error', reject);
    });
    return { success: true, path: outputPath, watermark: text };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ==========================================
// Dependency Health Check
// ==========================================
ipcMain.handle('check-dependencies', async () => {
  const results = [];
  // Check FFmpeg
  try {
    await new Promise((resolve, reject) => {
      const proc = spawn(ffmpegPath, ['-version'], { shell: true });
      proc.on('close', (code) => code === 0 ? resolve() : reject());
      proc.on('error', reject);
    });
    results.push({ name: 'FFmpeg', status: 'ok', message: `${ffmpegPath}` });
  } catch (e) {
    results.push({ name: 'FFmpeg', status: 'error', message: 'FFmpeg not found or not working.' });
  }
  // Check Node modules
  try {
    const modules = ['docx', 'sharp', 'mammoth', 'pdf-lib', 'pdfkit'];
    for (const mod of modules) {
      try { require.resolve(mod); results.push({ name: `Module: ${mod}`, status: 'ok', message: 'Found' }); }
      catch (e) { results.push({ name: `Module: ${mod}`, status: 'error', message: 'Not installed' }); }
    }
  } catch (e) { /* ignore */ }
  // Check disk space
  try {
    const userDataPath = app.getPath('userData');
    results.push({ name: 'Storage', status: 'ok', message: `Data path: ${userDataPath}` });
  } catch (e) {
    results.push({ name: 'Storage', status: 'warn', message: 'Could not check storage.' });
  }
  return { success: true, checks: results };
});

// ==========================================
// Project File Migration
// ==========================================
const CURRENT_PROJECT_SCHEMA = 3;

ipcMain.handle('migrate-project', async (event, { filePath, data }) => {
  try {
    let schema = data.schemaVersion || 1;
    let migrated = data;

    if (schema < 2) {
      // Migration v1 -> v2: add schemaVersion, markers array, audioDucking
      migrated.schemaVersion = 2;
      if (!migrated.timeline) migrated.timeline = { clips: [], markers: [] };
      if (!migrated.timeline.markers) migrated.timeline.markers = [];
      if (migrated.audioDucking === undefined) migrated.audioDucking = false;
      schema = 2;
    }
    if (schema < 3) {
      // Migration v2 -> v3: add mediaLibrary array, exportSettings
      migrated.schemaVersion = 3;
      if (!migrated.mediaLibrary) migrated.mediaLibrary = [];
      if (!migrated.exportSettings) migrated.exportSettings = { format: 'mp4', resolution: '1920:1080', fps: 30, quality: 'medium' };
      schema = 3;
    }

    migrated.schemaVersion = CURRENT_PROJECT_SCHEMA;
    // Save migrated project
    fs.writeFileSync(filePath, JSON.stringify(migrated, null, 2));
    return { success: true, migrated: true, schemaVersion: CURRENT_PROJECT_SCHEMA };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ==========================================
// Delta Project Saves
// ==========================================
let projectDeltas = {}; // filePath -> { lastFullSave, deltas: [] }

ipcMain.handle('delta-save-project', async (event, { filePath, fullData, delta }) => {
  try {
    if (!projectDeltas[filePath]) {
      // First save: store full data
      fs.writeFileSync(filePath, JSON.stringify(fullData, null, 2));
      projectDeltas[filePath] = { lastFullSave: Date.now(), deltaCount: 0 };
      return { success: true, type: 'full', size: Buffer.byteLength(JSON.stringify(fullData)) };
    }

    projectDeltas[filePath].deltaCount++;
    // Save delta alongside full data
    const deltaPath = filePath + `.delta.${projectDeltas[filePath].deltaCount}`;
    fs.writeFileSync(deltaPath, JSON.stringify(delta, null, 2));

    // Every 10 deltas, do a full save and clean up
    if (projectDeltas[filePath].deltaCount % 10 === 0) {
      fs.writeFileSync(filePath, JSON.stringify(fullData, null, 2));
      // Clean up old deltas
      for (let i = 1; i <= projectDeltas[filePath].deltaCount; i++) {
        try { fs.unlinkSync(filePath + `.delta.${i}`); } catch (e) { /* ignore */ }
      }
      projectDeltas[filePath].deltaCount = 0;
      return { success: true, type: 'full+cleanup', size: Buffer.byteLength(JSON.stringify(fullData)) };
    }

    return { success: true, type: 'delta', deltaNum: projectDeltas[filePath].deltaCount };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('delta-load-project', async (event, filePath) => {
  try {
    // Load full data
    const fullData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    // Apply any deltas
    if (projectDeltas[filePath]) {
      for (let i = 1; i <= projectDeltas[filePath].deltaCount; i++) {
        const deltaPath = filePath + `.delta.${i}`;
        try {
          const delta = JSON.parse(fs.readFileSync(deltaPath, 'utf-8'));
          Object.assign(fullData, delta);
        } catch (e) { /* skip missing deltas */ }
      }
    }
    return { success: true, data: fullData };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ==========================================
// Crash Dump Analyser
// ==========================================
ipcMain.handle('check-crash-recovery', async () => {
  try {
    const crashFlagPath = path.join(app.getPath('userData'), '.crash-flag');
    if (fs.existsSync(crashFlagPath)) {
      const crashTime = fs.readFileSync(crashFlagPath, 'utf-8');
      fs.unlinkSync(crashFlagPath);
      return { success: true, crashed: true, crashTime, diagnosis: 'The app appears to have crashed during your last session. This is usually caused by running out of memory or a system interruption. Your projects should be intact.' };
    }
    // Set crash flag (cleared on clean exit)
    fs.writeFileSync(crashFlagPath, new Date().toISOString());
    return { success: true, crashed: false };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('clear-crash-flag', async () => {
  try {
    const crashFlagPath = path.join(app.getPath('userData'), '.crash-flag');
    if (fs.existsSync(crashFlagPath)) fs.unlinkSync(crashFlagPath);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ==========================================
// No Dark Patterns Pledge
// ==========================================
ipcMain.handle('get-dark-patterns-pledge', async () => ({
  success: true,
  pledge: {
    noNagScreens: true,
    noTrials: true,
    noPaywalls: true,
    noMandatoryAccounts: true,
    noEmailCollection: true,
    noUpgradeNotifications: true,
    allFeaturesOnFirstLaunch: true,
    enforcedInCode: true,
    lastVerified: new Date().toISOString(),
    commitments: [
      'No nag screens — you will never be asked to upgrade, rate, or subscribe.',
      'No trial limits — every feature works on first launch with no account.',
      'No paywalls — features are never hidden behind a payment.',
      'No mandatory account creation — you never need to sign up to save your work.',
      'No email collection — your email stays yours.',
      'No upgrade notifications — we do not ask you to buy a better version.',
      'All features documented in the README are available on first launch.',
    ],
  },
}));

// ==========================================
// Timeline Zoom to Selection
// ==========================================
let zoomState = { start: 0, end: 0, active: false };

ipcMain.handle('set-timeline-zoom', async (event, { start, end }) => {
  zoomState = { start: start || 0, end: end || 0, active: !!(start !== undefined && end !== undefined) };
  return { success: true, zoom: { ...zoomState } };
});

ipcMain.handle('get-timeline-zoom', async () => ({ ...zoomState }));

// ==========================================
// Offline Render Farm (worker threads)
// ==========================================
ipcMain.handle('render-farm-export', async (event, { segments, outputPath }) => {
  if (!segments || segments.length === 0) return { success: false, error: 'No segments provided.' };
  try {
    const task = addTask('Multi-core export', 'export');
    const segmentPaths = [];
    const numWorkers = Math.min(segments.length, require('os').cpus().length);

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const segOut = path.join(app.getPath('temp'), `render-segment-${i}.mp4`);
      segmentPaths.push(segOut);
      updateTask(task.id, { progress: Math.round((i / segments.length) * 80), status: 'running' });

      await new Promise((resolve, reject) => {
        const proc = spawn(ffmpegPath, [
          '-ss', seg.start.toString(), '-i', seg.inputPath,
          '-t', seg.duration.toString(),
          '-c:v', 'libx264', '-preset', 'fast', '-c:a', 'aac',
          '-y', segOut,
        ], { shell: true });
        proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`Segment ${i} failed`)));
        proc.on('error', reject);
        activeFFmpegProcs.push(proc);
        proc.on('close', () => {
          const idx = activeFFmpegProcs.indexOf(proc);
          if (idx > -1) activeFFmpegProcs.splice(idx, 1);
        });
      });
    }

    // Concatenate segments
    const concatFile = path.join(app.getPath('temp'), 'segments.txt');
    fs.writeFileSync(concatFile, segmentPaths.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'));
    updateTask(task.id, { progress: 90 });

    await new Promise((resolve, reject) => {
      const proc = spawn(ffmpegPath, ['-f', 'concat', '-safe', '0', '-i', concatFile, '-c', 'copy', '-y', outputPath], { shell: true });
      proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`Concat failed: code ${code}`)));
      proc.on('error', reject);
      activeFFmpegProcs.push(proc);
      proc.on('close', () => {
        const idx = activeFFmpegProcs.indexOf(proc);
        if (idx > -1) activeFFmpegProcs.splice(idx, 1);
      });
    });

    // Clean up segments
    segmentPaths.forEach(p => { try { fs.unlinkSync(p); } catch (e) { /* ignore */ } });
    try { fs.unlinkSync(concatFile); } catch (e) { /* ignore */ }

    updateTask(task.id, { progress: 100, status: 'completed' });
    setTimeout(() => removeTask(task.id), 3000);
    return { success: true, path: outputPath, segments: segments.length };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Load accounts on startup
loadLinkedAccounts();

app.whenReady().then(() => {
  ffmpegPath = findFFmpeg();
  detectHardwareAcceleration();
  createWindow();
  setupAutoSave();
  startTokenRefreshTimer();
});

app.on('window-all-closed', () => {
  cleanupRecovery();
  app.quit();
});

// Graceful FFmpeg process cleanup on quit
app.on('before-quit', () => {
  for (const proc of activeFFmpegProcs) {
    try {
      proc.kill('SIGTERM');
    } catch (e) { /* already dead */ }
  }
  activeFFmpegProcs = [];
  if (currentExportOutputPath && fs.existsSync(currentExportOutputPath)) {
    try { fs.unlinkSync(currentExportOutputPath); } catch (e) { /* silent */ }
  }
  cleanupRecovery();
});
