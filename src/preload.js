const { contextBridge, ipcRenderer } = require('electron');

// Exponer API segura al renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // Configuraciones
  getConfigs: () => ipcRenderer.invoke('get-configs'),
  
  // Credenciales
  checkCredentials: () => ipcRenderer.invoke('check-credentials'),
  openDataFolder: () => ipcRenderer.invoke('open-data-folder'),
  getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),
  
  // Validación
  startValidation: (configPath) => ipcRenderer.invoke('start-validation', configPath),
  pauseValidation: () => ipcRenderer.invoke('pause-validation'),
  stopValidation: () => ipcRenderer.invoke('stop-validation'),
  getValidationStatus: () => ipcRenderer.invoke('get-validation-status'),
  
  // Listeners para eventos del main process
  onQRCode: (callback) => ipcRenderer.on('qr-code', (event, qr) => callback(qr)),
  onAuthenticated: (callback) => ipcRenderer.on('authenticated', callback),
  onWhatsAppReady: (callback) => ipcRenderer.on('whatsapp-ready', callback),
  onValidationProgress: (callback) => ipcRenderer.on('validation-progress', (event, data) => callback(data)),
  onValidationLog: (callback) => ipcRenderer.on('validation-log', (event, logData) => callback(logData)),
  onValidationError: (callback) => ipcRenderer.on('validation-error', (event, error) => callback(error)),
  onValidationCompleted: (callback) => ipcRenderer.on('validation-completed', (event, results) => callback(results)),
  onCredentialsMissing: (callback) => ipcRenderer.on('credentials-missing', (event, data) => callback(data)),
  
  // Control de listeners
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
  
  // Utilidades
  showMessage: (type, message) => {
    return { type, message, timestamp: new Date().toISOString() };
  }
});