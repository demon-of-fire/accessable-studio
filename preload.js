const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // File operations
  importMedia: () => ipcRenderer.invoke('show-open-dialog', {
    title: 'Import Media',
    filters: [
      { name: 'Video Files', extensions: ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm'] },
      { name: 'Image Files', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: ['openFile', 'multiSelections'],
  }),
  importAudio: () => ipcRenderer.invoke('show-open-dialog', {
    title: 'Import Audio',
    filters: [
      { name: 'Audio Files', extensions: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'wma', 'm4a'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: ['openFile', 'multiSelections'],
  }),
  saveProject: (data) => ipcRenderer.invoke('save-project', data),
  getMediaInfo: (filePath) => ipcRenderer.invoke('get-media-info', filePath),
  runFFmpeg: (args) => ipcRenderer.invoke('run-ffmpeg', args),
  exportVideo: (data) => ipcRenderer.invoke('export-video', data),
  convertFile: (data) => ipcRenderer.invoke('convert-file', data),
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  getFFmpegPath: () => ipcRenderer.invoke('get-ffmpeg-path'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // Event listeners
  onFilesImported: (callback) => ipcRenderer.on('files-imported', (_, files) => callback(files)),
  onAudioImported: (callback) => ipcRenderer.on('audio-imported', (_, files) => callback(files)),
  onMenuAction: (callback) => ipcRenderer.on('menu-action', (_, action) => callback(action)),
  onExportProgress: (callback) => ipcRenderer.on('export-progress', (_, data) => callback(data)),
  onProjectLoaded: (callback) => ipcRenderer.on('project-loaded', (_, data) => callback(data)),
});
