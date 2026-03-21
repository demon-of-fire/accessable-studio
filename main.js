const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');

let mainWindow;
let ffmpegPath = 'ffmpeg';

// Find FFmpeg
function findFFmpeg() {
  const possible = [
    'ffmpeg',
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links', 'ffmpeg.exe'),
    'C:\\ffmpeg\\bin\\ffmpeg.exe',
    path.join(process.env.ProgramFiles || '', 'ffmpeg', 'bin', 'ffmpeg.exe'),
  ];
  for (const p of possible) {
    try {
      require('child_process').execSync(`"${p}" -version`, { stdio: 'ignore' });
      return p;
    } catch (e) { continue; }
  }
  return 'ffmpeg';
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'Accessible Studio',
    icon: path.join(__dirname, 'src', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  // Build accessible menu
  const menuTemplate = [
    {
      label: '&File',
      submenu: [
        { label: '&New Project', accelerator: 'CmdOrCtrl+N', click: () => mainWindow.webContents.send('menu-action', 'new-project') },
        { label: '&Open Project', accelerator: 'CmdOrCtrl+O', click: () => handleOpenProject() },
        { label: '&Save Project', accelerator: 'CmdOrCtrl+S', click: () => mainWindow.webContents.send('menu-action', 'save-project') },
        { type: 'separator' },
        { label: '&Import Media', accelerator: 'CmdOrCtrl+I', click: () => handleImportMedia() },
        { label: 'Import &Audio', accelerator: 'CmdOrCtrl+Shift+I', click: () => handleImportAudio() },
        { type: 'separator' },
        { label: '&Export Video', accelerator: 'CmdOrCtrl+E', click: () => mainWindow.webContents.send('menu-action', 'export') },
        { label: 'Convert &File', accelerator: 'CmdOrCtrl+Shift+C', click: () => mainWindow.webContents.send('menu-action', 'convert') },
        { type: 'separator' },
        { label: 'E&xit', accelerator: 'Alt+F4', click: () => app.quit() },
      ],
    },
    {
      label: '&Edit',
      submenu: [
        { label: '&Undo', accelerator: 'CmdOrCtrl+Z', click: () => mainWindow.webContents.send('menu-action', 'undo') },
        { label: '&Redo', accelerator: 'CmdOrCtrl+Y', click: () => mainWindow.webContents.send('menu-action', 'redo') },
        { type: 'separator' },
        { label: '&Split Clip', accelerator: 'S', click: () => mainWindow.webContents.send('menu-action', 'split') },
        { label: '&Delete Clip', accelerator: 'Delete', click: () => mainWindow.webContents.send('menu-action', 'delete-clip') },
        { label: 'D&uplicate Clip', accelerator: 'CmdOrCtrl+D', click: () => mainWindow.webContents.send('menu-action', 'duplicate') },
      ],
    },
    {
      label: '&View',
      submenu: [
        { label: '&Zoom In Timeline', accelerator: 'CmdOrCtrl+=', click: () => mainWindow.webContents.send('menu-action', 'zoom-in') },
        { label: 'Zoom &Out Timeline', accelerator: 'CmdOrCtrl+-', click: () => mainWindow.webContents.send('menu-action', 'zoom-out') },
        { type: 'separator' },
        { label: 'Toggle &Chatbot', accelerator: 'CmdOrCtrl+B', click: () => mainWindow.webContents.send('menu-action', 'toggle-chatbot') },
        { label: 'Toggle &File Converter', accelerator: 'CmdOrCtrl+Shift+F', click: () => mainWindow.webContents.send('menu-action', 'toggle-converter') },
        { type: 'separator' },
        { label: '&Developer Tools', accelerator: 'F12', click: () => mainWindow.webContents.toggleDevTools() },
      ],
    },
    {
      label: '&Help',
      submenu: [
        { label: '&Keyboard Shortcuts', accelerator: 'F1', click: () => mainWindow.webContents.send('menu-action', 'show-shortcuts') },
        { label: '&About', click: () => mainWindow.webContents.send('menu-action', 'about') },
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
    mainWindow.webContents.send('files-imported', result.filePaths);
  }
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
    mainWindow.webContents.send('audio-imported', result.filePaths);
  }
}

async function handleOpenProject() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Project',
    filters: [{ name: 'Accessible Studio Project', extensions: ['asproj'] }],
    properties: ['openFile'],
  });
  if (!result.canceled && result.filePaths.length > 0) {
    const data = fs.readFileSync(result.filePaths[0], 'utf-8');
    mainWindow.webContents.send('project-loaded', JSON.parse(data));
  }
}

// IPC Handlers
ipcMain.handle('get-ffmpeg-path', () => ffmpegPath);

ipcMain.handle('save-project', async (event, projectData) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Project',
    filters: [{ name: 'Accessible Studio Project', extensions: ['asproj'] }],
  });
  if (!result.canceled) {
    fs.writeFileSync(result.filePath, JSON.stringify(projectData, null, 2));
    return result.filePath;
  }
  return null;
});

ipcMain.handle('export-video', async (event, { command, outputPath }) => {
  return new Promise((resolve, reject) => {
    const proc = exec(command, { maxBuffer: 1024 * 1024 * 100 }, (error, stdout, stderr) => {
      if (error) reject(error.message);
      else resolve(outputPath);
    });
    proc.stderr.on('data', (data) => {
      mainWindow.webContents.send('export-progress', data.toString());
    });
  });
});

ipcMain.handle('run-ffmpeg', async (event, args) => {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args, { shell: true });
    let output = '';
    let errorOutput = '';
    proc.stdout.on('data', (d) => output += d.toString());
    proc.stderr.on('data', (d) => {
      errorOutput += d.toString();
      mainWindow.webContents.send('export-progress', d.toString());
    });
    proc.on('close', (code) => {
      if (code === 0) resolve(output);
      else reject(errorOutput);
    });
  });
});

ipcMain.handle('get-media-info', async (event, filePath) => {
  return new Promise((resolve, reject) => {
    exec(`"${ffmpegPath}" -i "${filePath}" -hide_banner 2>&1`, { timeout: 5000 }, (error, stdout, stderr) => {
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
  return dialog.showSaveDialog(mainWindow, options);
});

ipcMain.handle('show-open-dialog', async (event, options) => {
  return dialog.showOpenDialog(mainWindow, options);
});

ipcMain.handle('convert-file', async (event, { inputPath, outputPath, args }) => {
  const cmd = `"${ffmpegPath}" -i "${inputPath}" ${args.join(' ')} "${outputPath}" -y`;
  return new Promise((resolve, reject) => {
    exec(cmd, { maxBuffer: 1024 * 1024 * 100 }, (error, stdout, stderr) => {
      if (error) reject(error.message);
      else resolve(outputPath);
    });
  });
});

app.whenReady().then(() => {
  ffmpegPath = findFFmpeg();
  createWindow();
});

app.on('window-all-closed', () => app.quit());
