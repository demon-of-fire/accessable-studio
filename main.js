const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');

let mainWindow;
let ffmpegPath = 'ffmpeg';

// Find FFmpeg - searches PATH, WinGet, common install locations
function findFFmpeg() {
  // First try to find via 'where' command (searches PATH)
  try {
    const result = require('child_process').execSync('where ffmpeg', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    if (result) {
      const firstPath = result.split('\n')[0].trim();
      if (firstPath) return firstPath;
    }
  } catch (e) { /* not in PATH */ }

  // Search common locations
  const possible = [
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links', 'ffmpeg.exe'),
    'C:\\ffmpeg\\bin\\ffmpeg.exe',
    path.join(process.env.ProgramFiles || '', 'ffmpeg', 'bin', 'ffmpeg.exe'),
    path.join(process.env.ProgramFiles || '', 'ffmpeg', 'ffmpeg.exe'),
  ];

  // Also search WinGet packages folder recursively
  const wingetPkgs = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages');
  try {
    if (fs.existsSync(wingetPkgs)) {
      const dirs = fs.readdirSync(wingetPkgs).filter(d => d.toLowerCase().includes('ffmpeg'));
      for (const dir of dirs) {
        const binPath = path.join(wingetPkgs, dir);
        // Search for ffmpeg.exe recursively (up to 3 levels)
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

  for (const p of possible) {
    try {
      require('child_process').execSync(`"${p}" -version`, { stdio: 'ignore', timeout: 5000 });
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
      webSecurity: false,  // Allow file:// images on canvas without tainting (needed for photo editor)
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
  // Verify FFmpeg is available
  try {
    require('child_process').execSync(`"${ffmpegPath}" -version`, { stdio: 'ignore', timeout: 5000 });
  } catch (e) {
    throw new Error('FFmpeg is not installed or not found. Please install FFmpeg to use the converter. You can install it with: winget install ffmpeg');
  }
  const cmd = `"${ffmpegPath}" -i "${inputPath}" ${args.join(' ')} "${outputPath}" -y`;
  return new Promise((resolve, reject) => {
    exec(cmd, { maxBuffer: 1024 * 1024 * 100 }, (error, stdout, stderr) => {
      if (error) reject(error.message);
      else resolve(outputPath);
    });
  });
});

ipcMain.handle('convert-document', async (event, { inputPath, outputPath, inputExt, outputFormat }) => {
  // Helper: read source content (handles DOCX via mammoth, others as text)
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
    // txt, md, rtf, csv, etc — treat as plain text
    const escaped = raw.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return { html: `<pre>${escaped}</pre>`, text: raw };
  }

  const src = await getSourceContent();

  // Convert to the target format
  switch (outputFormat) {
    case 'txt': {
      fs.writeFileSync(outputPath, src.text, 'utf-8');
      return outputPath;
    }
    case 'html': {
      const fullHtml = src.html.startsWith('<!DOCTYPE') ? src.html
        : `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Converted</title></head><body>${src.html}</body></html>`;
      fs.writeFileSync(outputPath, fullHtml, 'utf-8');
      return outputPath;
    }
    case 'md': {
      // Simple HTML-to-Markdown: strip tags, keep text structure
      let md = src.html;
      md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n');
      md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n');
      md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n');
      md = md.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n');
      md = md.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
      md = md.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
      md = md.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
      md = md.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');
      md = md.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
      md = md.replace(/<br\s*\/?>/gi, '\n');
      md = md.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');
      md = md.replace(/<[^>]*>/g, '');
      md = md.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
      md = md.replace(/\n{3,}/g, '\n\n').trim();
      fs.writeFileSync(outputPath, md, 'utf-8');
      return outputPath;
    }
    case 'rtf': {
      // Basic RTF wrapper around plain text
      const rtfEscaped = src.text.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}').replace(/\n/g, '\\par\n');
      const rtf = `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Arial;}}\n{\\pard\\f0\\fs24\n${rtfEscaped}\n\\par}}\n`;
      fs.writeFileSync(outputPath, rtf, 'utf-8');
      return outputPath;
    }
    case 'csv': {
      // Extract table data from HTML, or just output text lines as CSV rows
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
        // Fallback: each line is a row
        csvContent = src.text.split('\n').map(line => '"' + line.replace(/"/g, '""') + '"').join('\n');
      }
      fs.writeFileSync(outputPath, csvContent, 'utf-8');
      return outputPath;
    }
    case 'docx': {
      // Can only produce DOCX if input is not already DOCX
      if (inputExt === 'docx') {
        fs.copyFileSync(inputPath, outputPath);
      } else {
        throw new Error('Creating DOCX from ' + inputExt.toUpperCase() + ' requires a DOCX library. Use TXT, HTML, MD, or RTF output instead.');
      }
      return outputPath;
    }
    case 'pdf': {
      const PDFDocument = require('pdfkit');
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      // Split text into lines and write to PDF with word wrapping
      const lines = src.text.split('\n');
      let isFirst = true;
      for (const line of lines) {
        if (isFirst) { isFirst = false; } else if (line.trim() === '') { doc.moveDown(); continue; }
        // Detect headings (lines that are all caps or start with # in markdown)
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
      // Same format — just copy
      if (inputExt === outputFormat) {
        fs.copyFileSync(inputPath, outputPath);
        return outputPath;
      }
      throw new Error(`Converting ${inputExt.toUpperCase()} to ${outputFormat.toUpperCase()} is not supported yet.`);
    }
  }
});

ipcMain.handle('read-file', async (event, filePath) => {
  return fs.readFileSync(filePath, 'utf-8');
});

ipcMain.handle('write-file', async (event, { filePath, content }) => {
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
});

ipcMain.handle('list-projects', async () => {
  const projectsDir = path.join(app.getPath('userData'), 'projects');
  if (!fs.existsSync(projectsDir)) {
    fs.mkdirSync(projectsDir, { recursive: true });
    return [];
  }
  const files = fs.readdirSync(projectsDir).filter(f => f.endsWith('.asproj'));
  return files.map(f => {
    const filePath = path.join(projectsDir, f);
    const stat = fs.statSync(filePath);
    let name = f.replace('.asproj', '');
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (data.name) name = data.name;
    } catch (e) { /* use filename */ }
    return { fileName: f, name, date: stat.mtime.toISOString(), path: filePath };
  }).sort((a, b) => new Date(b.date) - new Date(a.date));
});

ipcMain.handle('save-project-to-library', async (event, { name, data }) => {
  const projectsDir = path.join(app.getPath('userData'), 'projects');
  if (!fs.existsSync(projectsDir)) {
    fs.mkdirSync(projectsDir, { recursive: true });
  }
  const safeName = name.replace(/[^a-zA-Z0-9_\- ]/g, '').substring(0, 50);
  const filePath = path.join(projectsDir, `${safeName}.asproj`);
  const projectData = { ...data, name, savedAt: new Date().toISOString() };
  fs.writeFileSync(filePath, JSON.stringify(projectData, null, 2));
  return filePath;
});

ipcMain.handle('load-project-from-library', async (event, filePath) => {
  const data = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(data);
});

ipcMain.handle('delete-project-from-library', async (event, filePath) => {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  return true;
});

app.whenReady().then(() => {
  ffmpegPath = findFFmpeg();
  console.log('FFmpeg found at:', ffmpegPath);
  createWindow();
});

app.on('window-all-closed', () => app.quit());
