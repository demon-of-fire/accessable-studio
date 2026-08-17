const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');
const os = require('os');

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
  cancelExport: () => ipcRenderer.invoke('cancel-export'),
  convertFile: (data) => ipcRenderer.invoke('convert-file', data),
  convertDocument: (data) => ipcRenderer.invoke('convert-document', data),
  batchConvert: (items) => ipcRenderer.invoke('batch-convert', items),
  startBatchConvert: () => ipcRenderer.invoke('start-batch-convert'),
  cancelBatchConvert: () => ipcRenderer.invoke('cancel-batch-convert'),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (data) => ipcRenderer.invoke('write-file', data),
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  getFFmpegPath: () => ipcRenderer.invoke('get-ffmpeg-path'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getHardwareAccel: () => ipcRenderer.invoke('get-hardware-accel'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  openContainingFolder: (filePath) => ipcRenderer.invoke('open-containing-folder', filePath),

  // Project library
  listProjects: (query) => ipcRenderer.invoke('list-projects', query),
  saveProjectToLibrary: (data) => ipcRenderer.invoke('save-project-to-library', data),
  loadProjectFromLibrary: (filePath) => ipcRenderer.invoke('load-project-from-library', filePath),
  deleteProjectFromLibrary: (filePath) => ipcRenderer.invoke('delete-project-from-library', filePath),
  renameProject: (data) => ipcRenderer.invoke('rename-project', data),
  duplicateProject: (data) => ipcRenderer.invoke('duplicate-project', data),

  // Unsaved changes tracking
  markUnsavedChanges: () => ipcRenderer.invoke('mark-unsaved-changes'),
  clearUnsavedChanges: () => ipcRenderer.invoke('clear-unsaved-changes'),
  recoverySave: (data) => ipcRenderer.invoke('recovery-save', data),

  // Event listeners
  onFilesImported: (callback) => ipcRenderer.on('files-imported', (_, files) => callback(files)),
  onAudioImported: (callback) => ipcRenderer.on('audio-imported', (_, files) => callback(files)),
  onMenuAction: (callback) => ipcRenderer.on('menu-action', (_, action) => callback(action)),
  onExportProgress: (callback) => ipcRenderer.on('export-progress', (_, data) => callback(data)),
  onExportProgressParsed: (callback) => ipcRenderer.on('export-progress-parsed', (_, data) => callback(data)),
  onExportComplete: (callback) => ipcRenderer.on('export-complete', (_, path) => callback(path)),
  onConvertProgress: (callback) => ipcRenderer.on('convert-progress', (_, data) => callback(data)),
  onConvertProgressParsed: (callback) => ipcRenderer.on('convert-progress-parsed', (_, data) => callback(data)),
  onBatchConvertProgress: (callback) => ipcRenderer.on('batch-convert-progress', (_, data) => callback(data)),
  onBatchConvertComplete: (callback) => ipcRenderer.on('batch-convert-complete', (_, results) => callback(results)),
  onProjectLoaded: (callback) => ipcRenderer.on('project-loaded', (_, data) => callback(data)),
  onRestoreFocus: (callback) => ipcRenderer.on('restore-focus', () => callback()),
  onLoadRecentProject: (callback) => ipcRenderer.on('load-recent-project', (_, proj) => callback(proj)),
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (_, data) => callback(data)),
  onUpdateNotification: (callback) => ipcRenderer.on('update-notification', (_, msg) => callback(msg)),
  onUpdateDownloadProgress: (callback) => ipcRenderer.on('update-download-progress', (_, data) => callback(data)),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', () => callback()),
  onRequestSaveForRecovery: (callback) => ipcRenderer.on('request-save-for-recovery', () => callback()),

  // Encryption
  setEncryptionKey: (key) => ipcRenderer.invoke('set-encryption-key', key),
  getEncryptionKey: () => ipcRenderer.invoke('get-encryption-key'),
  encryptText: (text) => ipcRenderer.invoke('encrypt-text', text),
  decryptText: (encrypted) => ipcRenderer.invoke('decrypt-text', encrypted),

  // Low bandwidth mode
  setLowBandwidthMode: (enabled) => ipcRenderer.invoke('set-low-bandwidth-mode', enabled),
  getLowBandwidthMode: () => ipcRenderer.invoke('get-low-bandwidth-mode'),

  // RTMP Streaming
  startStream: (data) => ipcRenderer.invoke('start-stream', data),
  stopStream: () => ipcRenderer.invoke('stop-stream'),
  getStreamStatus: () => ipcRenderer.invoke('get-stream-status'),
  setStreamBitrate: (bitrate) => ipcRenderer.invoke('set-stream-bitrate', bitrate),
  runPreStreamChecklist: () => ipcRenderer.invoke('run-pre-stream-checklist'),

  // Stream event listeners
  onStreamStatus: (callback) => ipcRenderer.on('stream-status', (_, data) => callback(data)),
  onStreamProgress: (callback) => ipcRenderer.on('stream-progress', (_, data) => callback(data)),

  // Overlay generation
  generateCountdownOverlay: (data) => ipcRenderer.invoke('generate-countdown-overlay', data),

  // OAuth Account Linking
  linkAccount: (platform) => ipcRenderer.invoke('oauth-link-account', platform),
  getLinkedAccounts: () => ipcRenderer.invoke('oauth-get-linked-accounts'),
  disconnectAccount: (platform) => ipcRenderer.invoke('oauth-disconnect-account', platform),
  getOAuthToken: (platform) => ipcRenderer.invoke('oauth-get-token'),

  // OAuth event listener
  onOAuthResult: (callback) => ipcRenderer.on('oauth-result', (_, data) => callback(data)),

  // YouTube API
  youtubeCreateBroadcast: (data) => ipcRenderer.invoke('youtube-create-broadcast', data),
  youtubeUpdateDescription: (data) => ipcRenderer.invoke('youtube-update-video-description', data),
  youtubeUploadVideo: (data) => ipcRenderer.invoke('youtube-upload-video', data),

  // Twitch API
  twitchUpdateStream: (data) => ipcRenderer.invoke('twitch-update-stream', data),
  twitchCreateClip: (data) => ipcRenderer.invoke('twitch-create-clip', data),

  // Document Templates
  listDocumentTemplates: () => ipcRenderer.invoke('list-document-templates'),
  createDocumentFromTemplate: (data) => ipcRenderer.invoke('create-document-from-template', data),

  // LUT Support
  listBuiltinLuts: () => ipcRenderer.invoke('list-builtin-luts'),
  exportLut: (data) => ipcRenderer.invoke('export-lut', data),
  importLut: (filePath) => ipcRenderer.invoke('import-lut', filePath),
  applyLutToClip: (data) => ipcRenderer.invoke('apply-lut-to-clip', data),

  // Background Task Manager
  getBackgroundTasks: () => ipcRenderer.invoke('get-background-tasks'),
  cancelTask: (taskId) => ipcRenderer.invoke('cancel-task', taskId),
  onTaskUpdate: (callback) => ipcRenderer.on('task-update', (_, data) => callback(data)),
  onTaskRemoved: (callback) => ipcRenderer.on('task-removed', (_, taskId) => callback(taskId)),

  // Storage Quota
  getStorageQuota: () => ipcRenderer.invoke('get-storage-quota'),
  cleanupOldProjects: (daysOld) => ipcRenderer.invoke('cleanup-old-projects', daysOld),

  // Clip Compilation
  compileHighlights: (data) => ipcRenderer.invoke('compile-highlights', data),

  // Chat Export
  exportChatLog: (data) => ipcRenderer.invoke('export-chat-log', data),

  // Accessibility Profile
  getAccessibilityProfile: () => ipcRenderer.invoke('get-accessibility-profile'),
  saveAccessibilityProfile: (profile) => ipcRenderer.invoke('save-accessibility-profile', profile),

  // Cognitive Load
  updateCognitiveLoad: (data) => ipcRenderer.invoke('update-cognitive-load', data),
  trackAnnouncement: () => ipcRenderer.invoke('track-announcement'),
  checkCognitiveLoad: () => ipcRenderer.invoke('check-cognitive-load'),

  // Audio Cues
  playAudioCue: (data) => ipcRenderer.invoke('play-audio-cue', data),

  // Clip Ratings
  setClipRating: (data) => ipcRenderer.invoke('set-clip-rating', data),
  getClipRating: (clipId) => ipcRenderer.invoke('get-clip-rating', clipId),
  getAllRatings: () => ipcRenderer.invoke('get-all-ratings'),

  // Picture Lock
  togglePictureLock: () => ipcRenderer.invoke('toggle-picture-lock'),
  getPictureLock: () => ipcRenderer.invoke('get-picture-lock'),

  // Video Properties
  detectVideoProperties: (filePath) => ipcRenderer.invoke('detect-video-properties', filePath),
  convertToCFR: (data) => ipcRenderer.invoke('convert-to-cfr', data),
  deinterlaceVideo: (data) => ipcRenderer.invoke('deinterlace-video', data),
  convertFrameRate: (data) => ipcRenderer.invoke('convert-frame-rate', data),

  // Grid
  setGrid: (data) => ipcRenderer.invoke('set-grid', data),
  getGrid: () => ipcRenderer.invoke('get-grid'),

  // Keyframes
  getKeyframes: (clipId) => ipcRenderer.invoke('get-keyframes', clipId),
  setKeyframes: (data) => ipcRenderer.invoke('set-keyframes', data),
  addKeyframe: (data) => ipcRenderer.invoke('add-keyframe', data),
  removeKeyframe: (data) => ipcRenderer.invoke('remove-keyframe', data),

  // Speed Ramp
  getSpeedRamp: (clipId) => ipcRenderer.invoke('get-speed-ramp', clipId),
  setSpeedRamp: (data) => ipcRenderer.invoke('set-speed-ramp', data),

  // Photo Restoration
  restorePhoto: (data) => ipcRenderer.invoke('restore-photo', data),

  // Batch Rename
  batchRename: (data) => ipcRenderer.invoke('batch-rename', data),

  // Readability
  analyseReadability: (text) => ipcRenderer.invoke('analyse-readability', text),

  // Encrypted Settings (safeStorage for API keys)
  saveEncryptedSetting: (data) => ipcRenderer.invoke('save-encrypted-setting', data),
  loadEncryptedSetting: (key) => ipcRenderer.invoke('load-encrypted-setting', key),
  deleteEncryptedSetting: (key) => ipcRenderer.invoke('delete-encrypted-setting', key),

  // Audio Watermark
  applyAudioWatermark: (data) => ipcRenderer.invoke('apply-audio-watermark', data),

  // Dependency Health
  checkDependencies: () => ipcRenderer.invoke('check-dependencies'),

  // Project Migration
  migrateProject: (data) => ipcRenderer.invoke('migrate-project', data),

  // Delta Saves
  deltaSaveProject: (data) => ipcRenderer.invoke('delta-save-project', data),
  deltaLoadProject: (filePath) => ipcRenderer.invoke('delta-load-project', filePath),

  // Crash Recovery
  checkCrashRecovery: () => ipcRenderer.invoke('check-crash-recovery'),
  clearCrashFlag: () => ipcRenderer.invoke('clear-crash-flag'),

  // Dark Patterns Pledge
  getDarkPatternsPledge: () => ipcRenderer.invoke('get-dark-patterns-pledge'),

  // Timeline Zoom
  setTimelineZoom: (data) => ipcRenderer.invoke('set-timeline-zoom', data),
  getTimelineZoom: () => ipcRenderer.invoke('get-timeline-zoom'),

  // Render Farm
  renderFarmExport: (data) => ipcRenderer.invoke('render-farm-export', data),

  // DAW / Music Production — MIDI
  dawGetMidi: (clipId) => ipcRenderer.invoke('daw-get-midi', clipId),
  dawSetMidi: (data) => ipcRenderer.invoke('daw-set-midi', data),
  dawAddNote: (data) => ipcRenderer.invoke('daw-add-note', data),
  dawRemoveNote: (data) => ipcRenderer.invoke('daw-remove-note', data),
  dawUpdateNote: (data) => ipcRenderer.invoke('daw-update-note', data),

  // DAW — Tracks
  dawCreateTrack: (track) => ipcRenderer.invoke('daw-create-track', track),
  dawGetTracks: () => ipcRenderer.invoke('daw-get-tracks'),
  dawUpdateTrack: (data) => ipcRenderer.invoke('daw-update-track', data),
  dawDeleteTrack: (trackId) => ipcRenderer.invoke('daw-delete-track', trackId),

  // DAW — Step Sequencer
  dawCreatePattern: (pattern) => ipcRenderer.invoke('daw-create-pattern', pattern),
  dawGetPatterns: () => ipcRenderer.invoke('daw-get-patterns'),
  dawUpdatePattern: (data) => ipcRenderer.invoke('daw-update-pattern', data),
  dawDeletePattern: (patternId) => ipcRenderer.invoke('daw-delete-pattern', patternId),

  // DAW — VST
  dawScanVst: (directory) => ipcRenderer.invoke('daw-scan-vst', directory),
  dawGetVstPlugins: () => ipcRenderer.invoke('daw-get-vst-plugins'),

  // DAW — Stems Separator
  dawSeparateStems: (data) => ipcRenderer.invoke('daw-separate-stems', data),

  // Podcast Studio
  podcastGetConfig: () => ipcRenderer.invoke('podcast-get-config'),
  podcastSaveConfig: (data) => ipcRenderer.invoke('podcast-save-config', data),
  podcastStartRecording: (data) => ipcRenderer.invoke('podcast-start-recording', data),
  podcastStopRecording: () => ipcRenderer.invoke('podcast-stop-recording'),
  podcastGetEpisodes: () => ipcRenderer.invoke('podcast-get-episodes'),
  podcastGenerateRss: (data) => ipcRenderer.invoke('podcast-generate-rss', data),
  podcastWriteId3: (data) => ipcRenderer.invoke('podcast-write-id3', data),
  podcastListDevices: () => ipcRenderer.invoke('podcast-list-devices'),

  // Advanced Streaming
  streamingSetSource: (data) => ipcRenderer.invoke('streaming-set-source', data),
  streamingGetSource: () => ipcRenderer.invoke('streaming-get-source'),
  streamingGetAvailableSources: () => ipcRenderer.invoke('streaming-get-available-sources'),
  streamingStartAdvanced: (data) => ipcRenderer.invoke('streaming-start-advanced', data),
  streamingStopAdvanced: () => ipcRenderer.invoke('streaming-stop-advanced'),
  streamingTestConnection: (data) => ipcRenderer.invoke('streaming-test-connection', data),
  streamingGetStats: () => ipcRenderer.invoke('streaming-get-stats'),

  // Raw Photo Support
  rawPhotoGetSupported: () => ipcRenderer.invoke('raw-photo-get-supported'),
  rawPhotoConvert: (data) => ipcRenderer.invoke('raw-photo-convert', data),

  // PDF Form Filler
  pdfFormGetFields: (filePath) => ipcRenderer.invoke('pdf-form-get-fields', filePath),
  pdfFormFill: (data) => ipcRenderer.invoke('pdf-form-fill', data),

  // EPUB Reader
  epubGetMetadata: (filePath) => ipcRenderer.invoke('epub-get-metadata', filePath),
  epubGetContents: (filePath) => ipcRenderer.invoke('epub-get-contents', filePath),
  epubGetChapter: (data) => ipcRenderer.invoke('epub-get-chapter', data),
});

contextBridge.exposeInMainWorld('electronAPI', {
  pathJoin: (...args) => path.join(...args),
  tmpdir: () => os.tmpdir(),
});
