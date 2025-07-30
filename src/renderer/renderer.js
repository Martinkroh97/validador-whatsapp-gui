// Estado global de la aplicación
let appState = {
  currentScreen: 'config',
  selectedConfig: null,
  validationStatus: 'inactive',
  configs: [],
  validationData: {
    total: 0,
    completed: 0,
    valid: 0,
    invalid: 0,
    duplicates: 0
  },
  logs: [],
  // Configuraciones globales
  settings: {
    batchSize: 5,
    delayBetweenRequests: 1500,
    retryAttempts: 3
  },
  credentialsExist: true
};

// Estado para el modal de creación de configuraciones
let configCreatorState = {
  sheets: [],
  currentSheet: null
};

// Referencias a elementos DOM
const elements = {
  // Screens
  configScreen: document.getElementById('configScreen'),
  validationScreen: document.getElementById('validationScreen'),
  credentialsScreen: document.getElementById('credentialsScreen'),
  
  // Header
  statusIndicator: document.getElementById('statusIndicator'),
  statusText: document.getElementById('statusText'),
  
  // Credentials screen
  credentialsPath: document.getElementById('credentialsPath'),
  openDataFolderBtn: document.getElementById('openDataFolderBtn'),
  checkAgainBtn: document.getElementById('checkAgainBtn'),
  
  // Config screen
  configList: document.getElementById('configList'),
  
  // Validation screen
  selectedConfigName: document.getElementById('selectedConfigName'),
  selectedConfigDescription: document.getElementById('selectedConfigDescription'),
  
  // Controls
  refreshBtn: document.getElementById('refreshBtn'),
  settingsBtn: document.getElementById('settingsBtn'),
  startBtn: document.getElementById('startBtn'),
  pauseBtn: document.getElementById('pauseBtn'),
  stopBtn: document.getElementById('stopBtn'),
  backBtn: document.getElementById('backBtn'),
  
  // QR Section
  qrSection: document.getElementById('qrSection'),
  qrCode: document.getElementById('qrCode'),
  
  // Progress Section
  progressSection: document.getElementById('progressSection'),
  totalNumbers: document.getElementById('totalNumbers'),
  validNumbers: document.getElementById('validNumbers'),
  invalidNumbers: document.getElementById('invalidNumbers'),
  duplicateNumbers: document.getElementById('duplicateNumbers'),
  progressFill: document.getElementById('progressFill'),
  progressPercentage: document.getElementById('progressPercentage'),
  progressCount: document.getElementById('progressCount'),
  currentNumber: document.getElementById('currentNumber'),
  currentStatus: document.getElementById('currentStatus'),
  
  // Log Section
  logContainer: document.getElementById('logContainer'),
  clearLogBtn: document.getElementById('clearLogBtn'),
  exportLogBtn: document.getElementById('exportLogBtn'),
  
  // Toast container
  toastContainer: document.getElementById('toastContainer')
};

// Inicialización
document.addEventListener('DOMContentLoaded', async () => {
  await initializeApp();
  setupEventListeners();
  setupElectronListeners();
});

async function initializeApp() {
  showToast('info', 'Inicializando aplicación...', '');
  
  // Verificar credenciales primero
  const credentialsCheck = await window.electronAPI.checkCredentials();
  appState.credentialsExist = credentialsCheck.exists;
  
  if (!credentialsCheck.exists) {
    // Mostrar pantalla de credenciales faltantes
    showScreen('credentials');
    updateStatusIndicator('error', 'Credenciales faltantes');
    
    // Mostrar la ruta donde deben ir las credenciales
    const userDataPath = await window.electronAPI.getUserDataPath();
    elements.credentialsPath.innerHTML = `<code>${userDataPath}</code>`;
  } else {
    // Continuar normalmente
    await loadConfigurations();
    updateStatusIndicator('inactive', 'Listo para usar');
  }
}

// Event Listeners
function setupEventListeners() {
  // Botones principales
  elements.refreshBtn.addEventListener('click', handleRefresh);
  elements.settingsBtn.addEventListener('click', openSettings);
  elements.backBtn.addEventListener('click', () => showScreen('config'));
  
  // Botones de credenciales
  elements.openDataFolderBtn?.addEventListener('click', openDataFolder);
  elements.checkAgainBtn?.addEventListener('click', checkCredentialsAgain);
  
  // Controles de validación
  elements.startBtn.addEventListener('click', startValidation);
  elements.pauseBtn.addEventListener('click', pauseValidation);
  elements.stopBtn.addEventListener('click', stopValidation);
  
  // Controles de log
  elements.clearLogBtn.addEventListener('click', clearLogs);
  elements.exportLogBtn.addEventListener('click', exportLogs);
}

function setupElectronListeners() {
  // Listener para credenciales faltantes
  window.electronAPI.onCredentialsMissing((data) => {
    showScreen('credentials');
    updateStatusIndicator('error', 'Credenciales faltantes');
    elements.credentialsPath.innerHTML = `<code>${data.path}</code>`;
    showToast('error', 'Credenciales faltantes', 'Por favor, coloca el archivo credenciales.json en la carpeta indicada');
  });
  
  // Listeners para eventos del proceso principal
  window.electronAPI.onQRCode((qr) => {
    showQRCode(qr);
  });
  
  window.electronAPI.onAuthenticated(() => {
    updateStatusIndicator('active', 'WhatsApp autenticado');
    showToast('success', 'WhatsApp conectado', 'Autenticación exitosa');
    hideQRCode();
  });
  
  window.electronAPI.onWhatsAppReady(() => {
    updateStatusIndicator('active', 'WhatsApp listo');
    showToast('success', 'WhatsApp listo', 'Iniciando validación de números');
    showProgressSection();
  });
  
  window.electronAPI.onValidationProgress((data) => {
    updateProgress(data);
  });
  
  window.electronAPI.onValidationLog((logData) => {
    addLogEntry(logData);
  });
  
  window.electronAPI.onValidationError((error) => {
    // Manejo especial para error de credenciales
    if (error.code === 'CREDENTIALS_NOT_FOUND') {
      showScreen('credentials');
      updateStatusIndicator('error', 'Credenciales faltantes');
      elements.credentialsPath.innerHTML = `<code>${error.path}</code>`;
      showToast('error', 'Credenciales faltantes', error.message);
    } else {
      updateStatusIndicator('error', 'Error en validación');
      showToast('error', 'Error de validación', error.message || error);
      addLogEntry({
        type: 'error',
        message: error.message || error,
        timestamp: new Date().toISOString()
      });
    }
  });
  
  window.electronAPI.onValidationCompleted((results) => {
    updateStatusIndicator('active', 'Validación completada');
    showToast('success', 'Validación completada', 
      `${results.valid} válidos, ${results.invalid} inválidos, ${results.duplicates} duplicados`);
    
    // Actualizar botones
    elements.startBtn.classList.remove('hidden');
    elements.pauseBtn.classList.add('hidden');
    elements.stopBtn.classList.add('hidden');
    
    addLogEntry({
      type: 'success',
      message: `Validación completada. Total: ${results.total}, Válidos: ${results.valid}, Inválidos: ${results.invalid}, Duplicados: ${results.duplicates}`,
      timestamp: new Date().toISOString()
    });
  });
}

// Funciones de credenciales
async function openDataFolder() {
  await window.electronAPI.openDataFolder();
}

async function checkCredentialsAgain() {
  showToast('info', 'Verificando...', 'Buscando archivo de credenciales');
  
  const credentialsCheck = await window.electronAPI.checkCredentials();
  
  if (credentialsCheck.exists) {
    appState.credentialsExist = true;
    showToast('success', 'Credenciales encontradas', 'Redirigiendo a la pantalla principal');
    
    // Cargar configuraciones y mostrar pantalla principal
    await loadConfigurations();
    showScreen('config');
    updateStatusIndicator('active', 'Listo para usar');
  } else {
    showToast('error', 'Credenciales no encontradas', 'Por favor, asegúrate de colocar el archivo en la carpeta correcta');
  }
}

async function handleRefresh() {
  if (!appState.credentialsExist) {
    await checkCredentialsAgain();
  } else {
    await loadConfigurations();
  }
}

// Gestión de configuraciones
async function loadConfigurations() {
  try {
    updateStatusIndicator('warning', 'Cargando configuraciones...');
    
    const configs = await window.electronAPI.getConfigs();
    appState.configs = configs;
    
    renderConfigList(configs);
    
    if (configs.length === 0) {
      updateStatusIndicator('error', 'No hay configuraciones');
      showToast('warning', 'Sin configuraciones', 'No se encontraron archivos de configuración');
    } else {
      updateStatusIndicator('active', `${configs.length} configuración(es) disponible(s)`);
    }
  } catch (error) {
    console.error('Error cargando configuraciones:', error);
    updateStatusIndicator('error', 'Error cargando configuraciones');
    showToast('error', 'Error', 'No se pudieron cargar las configuraciones');
  }
}

function renderConfigList(configs) {
  if (configs.length === 0) {
    elements.configList.innerHTML = `
      <div class="config-item">
        <h3>⚠️ No hay configuraciones</h3>
        <p>Coloca archivos .json en la carpeta 'configs' para empezar</p>
        <button class="btn btn-primary" onclick="openDataFolder()">📁 Abrir Carpeta de Datos</button>
      </div>
    `;
    return;
  }
  
  elements.configList.innerHTML = configs.map(config => `
    <div class="config-item" data-config-path="${config.path}">
      <h3>${config.nombre}</h3>
      <p>${config.config.descripcion || 'Sin descripción'}</p>
      <div class="config-details">
        <span>📊 ${config.config.principales?.length || 0} hoja(s)</span>
        <span>📁 ${config.archivo}</span>
      </div>
    </div>
  `).join('');
  
  // Agregar event listeners a los items
  elements.configList.querySelectorAll('.config-item').forEach(item => {
    item.addEventListener('click', () => {
      const configPath = item.dataset.configPath;
      const config = configs.find(c => c.path === configPath);
      if (config) {
        selectConfiguration(config);
      }
    });
  });
}

function selectConfiguration(config) {
  appState.selectedConfig = config;
  
  elements.selectedConfigName.textContent = config.nombre;
  elements.selectedConfigDescription.textContent = 
    config.config.descripcion || `Configuración con ${config.config.principales?.length || 0} hoja(s)`;
  
  showScreen('validation');
  updateStatusIndicator('active', `Configuración: ${config.nombre}`);
  showToast('info', 'Configuración seleccionada', config.nombre);
}

// Gestión de validación
async function startValidation() {
  if (!appState.selectedConfig) {
    showToast('error', 'Error', 'No hay configuración seleccionada');
    return;
  }
  
  try {
    updateStatusIndicator('warning', 'Iniciando validación...');
    
    // Cambiar botones
    elements.startBtn.classList.add('hidden');
    elements.pauseBtn.classList.remove('hidden');
    elements.stopBtn.classList.remove('hidden');
    
    // Limpiar datos previos
    resetProgress();
    
    const result = await window.electronAPI.startValidation(appState.selectedConfig.path);
    
    if (!result.success) {
      throw new Error(result.error || 'Error desconocido');
    }
    
    showToast('info', 'Validación iniciada', 'Esperando conexión a WhatsApp...');
    
  } catch (error) {
    console.error('Error iniciando validación:', error);
    updateStatusIndicator('error', 'Error al iniciar validación');
    showToast('error', 'Error al iniciar', error.message || error);
    
    // Restaurar botones
    elements.startBtn.classList.remove('hidden');
    elements.pauseBtn.classList.add('hidden');
    elements.stopBtn.classList.add('hidden');
  }
}

async function pauseValidation() {
  try {
    await window.electronAPI.pauseValidation();
    updateStatusIndicator('warning', 'Validación pausada');
    showToast('info', 'Pausado', 'Validación pausada temporalmente');
  } catch (error) {
    showToast('error', 'Error', 'No se pudo pausar la validación');
  }
}

async function stopValidation() {
  try {
    await window.electronAPI.stopValidation();
    updateStatusIndicator('active', 'Validación detenida');
    showToast('info', 'Detenido', 'Validación detenida por el usuario');
    
    // Restaurar botones
    elements.startBtn.classList.remove('hidden');
    elements.pauseBtn.classList.add('hidden');
    elements.stopBtn.classList.add('hidden');
    
    hideQRCode();
  } catch (error) {
    showToast('error', 'Error', 'No se pudo detener la validación');
  }
}

// UI Management
function showScreen(screenName) {
  // Ocultar todas las pantallas
  elements.configScreen.classList.add('hidden');
  elements.validationScreen.classList.add('hidden');
  elements.credentialsScreen.classList.add('hidden');
  
  // Mostrar la pantalla seleccionada
  switch(screenName) {
    case 'config':
      elements.configScreen.classList.remove('hidden');
      appState.currentScreen = 'config';
      break;
    case 'validation':
      elements.validationScreen.classList.remove('hidden');
      appState.currentScreen = 'validation';
      break;
    case 'credentials':
      elements.credentialsScreen.classList.remove('hidden');
      appState.currentScreen = 'credentials';
      break;
  }
}

function updateStatusIndicator(status, text) {
  elements.statusIndicator.className = `status-indicator ${status}`;
  elements.statusText.textContent = text;
  appState.validationStatus = status;
}

// Progress management
function updateProgress(data) {
  appState.validationData = { ...appState.validationData, ...data };
  
  const { total, valid, invalid, duplicates } = appState.validationData;
  const completed = (valid || 0) + (invalid || 0) + (duplicates || 0);

  // Actualizar números
  elements.totalNumbers.textContent = total || 0;
  elements.validNumbers.textContent = valid || 0;
  elements.invalidNumbers.textContent = invalid || 0;
  elements.duplicateNumbers.textContent = duplicates || 0;

  // Actualizar barra de progreso
  if (total > 0) {
    const percentage = Math.round((completed / total) * 100);
    elements.progressFill.style.width = `${percentage}%`;
    elements.progressPercentage.textContent = `${percentage}%`;
    elements.progressCount.textContent = `${completed} / ${total}`;
  }

  // Actualizar número actual
  if (data.currentNumber) {
    elements.currentNumber.textContent = data.currentNumber;
  }
  if (data.currentStatus) {
    elements.currentStatus.textContent = data.currentStatus;
  }
}

function resetProgress() {
  appState.validationData = {
    total: 0,
    completed: 0,
    valid: 0,
    invalid: 0,
    duplicates: 0
  };
  
  updateProgress(appState.validationData);
  elements.currentNumber.textContent = '-';
  elements.currentStatus.textContent = 'Esperando...';
  elements.progressFill.style.width = '0%';
}

function showProgressSection() {
  elements.progressSection.classList.remove('hidden');
}

// QR Code management
function showQRCode(qr) {
  elements.qrSection.classList.remove('hidden');
  
  // Mostrar QR con ASCII y visual
  elements.qrCode.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; gap: 20px; padding: 20px;">
      <div id="qr-visual" style="background: white; padding: 20px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"></div>
      <div style="text-align: center; color: #666; font-size: 0.95rem; max-width: 400px;">
        <p style="margin-bottom: 10px; font-weight: 500;">📱 Escanea con la cámara de WhatsApp</p>
        <p style="font-size: 0.85rem; line-height: 1.4; color: #888;">Si no puedes escanear, también hay un código ASCII más abajo</p>
      </div>
      <details style="width: 100%; max-width: 400px;">
        <summary style="cursor: pointer; color: #007AFF; font-size: 0.9rem; font-weight: 500; margin-bottom: 10px;">📄 Ver código ASCII alternativo</summary>
        <div style="font-family: monospace; font-size: 6px; line-height: 1; white-space: pre; background: #f8f9fa; padding: 12px; border-radius: 6px; border: 1px solid #e9ecef; overflow: auto; max-height: 200px;">
${qr}
        </div>
      </details>
    </div>
  `;
  
  // Generar QR visual usando QRious (CDN)
  loadQRLibrary(() => {
    generateVisualQR(qr);
  });
}

function loadQRLibrary(callback) {
  // Verificar si QRious ya está cargado
  if (window.QRious) {
    callback();
    return;
  }
  
  // Verificar si el script ya está en el DOM
  if (document.querySelector('script[src*="qrious"]')) {
    // Esperar a que se cargue
    const checkLoaded = setInterval(() => {
      if (window.QRious) {
        clearInterval(checkLoaded);
        callback();
      }
    }, 100);
    return;
  }
  
  // Cargar la librería QRious desde CDN
  const script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrious/4.0.2/qrious.min.js';
  script.onload = callback;
  script.onerror = () => {
    console.log('No se pudo cargar la librería QR, usando fallback ASCII');
    // El QR ASCII ya está visible como fallback
  };
  document.head.appendChild(script);
}

function generateVisualQR(qrData) {
  try {
    const qrVisual = document.getElementById('qr-visual');
    if (qrVisual && window.QRious) {
      // Limpiar contenido previo
      qrVisual.innerHTML = '';
      
      // Crear canvas para el QR
      const canvas = document.createElement('canvas');
      qrVisual.appendChild(canvas);
      
      // Generar QR visual
      new QRious({
        element: canvas,
        value: qrData,
        size: 200,
        foreground: '#000000',
        background: '#ffffff'
      });
    }
  } catch (error) {
    console.log('Error generando QR visual:', error);
    // El QR ASCII sigue disponible como fallback
  }
}

function hideQRCode() {
  elements.qrSection.classList.add('hidden');
}

// Log management
function addLogEntry(logData) {
  appState.logs.unshift(logData);
  
  // Mantener solo los últimos 100 logs
  if (appState.logs.length > 100) {
    appState.logs = appState.logs.slice(0, 100);
  }
  
  renderLogs();
}

function renderLogs() {
  if (appState.logs.length === 0) {
    elements.logContainer.innerHTML = '<div class="log-empty">No hay logs disponibles</div>';
    return;
  }
  
  elements.logContainer.innerHTML = appState.logs.map(log => `
    <div class="log-entry ${log.type}">
      <div class="log-timestamp">${formatLogTime(log.timestamp)}</div>
      <div class="log-icon">${getLogIcon(log.type)}</div>
      <div class="log-message">${log.message}</div>
    </div>
  `).join('');
  
  // Auto-scroll to top para ver el log más reciente
  elements.logContainer.scrollTop = 0;
}

function formatLogTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('es-ES', { 
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function getLogIcon(type) {
  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ'
  };
  return icons[type] || 'ℹ';
}

function clearLogs() {
  appState.logs = [];
  renderLogs();
  showToast('info', 'Logs limpiados', 'Historial de logs eliminado');
}

function exportLogs() {
  if (appState.logs.length === 0) {
    showToast('warning', 'Sin logs', 'No hay logs para exportar');
    return;
  }
  
  const logText = appState.logs
    .map(log => `[${log.timestamp}] [${log.type.toUpperCase()}] ${log.message}`)
    .join('\n');
  
  const blob = new Blob([logText], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `validador-logs-${new Date().toISOString().split('T')[0]}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  
  showToast('success', 'Logs exportados', 'Archivo de logs descargado');
}

// Toast notifications
function showToast(type, title, message = '', duration = 5000) {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  toast.innerHTML = `
    <div class="toast-icon">${getToastIcon(type)}</div>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      ${message ? `<div class="toast-message">${message}</div>` : ''}
    </div>
  `;
  
  elements.toastContainer.appendChild(toast);
  
  // Auto-remove
  setTimeout(() => {
    if (toast.parentNode) {
      toast.remove();
    }
  }, duration);
  
  // Click to remove
  toast.addEventListener('click', () => {
    toast.remove();
  });
}

function getToastIcon(type) {
  const icons = {
    success: '✓',
    error: '✕',
    warning: '!',
    info: 'i'
  };
  return icons[type] || 'i';
}

// MODAL DE CONFIGURACIONES AVANZADO - ACTUALIZADO
function openSettings() {
  const modal = createSettingsModal();
  document.body.appendChild(modal);
  
  // Enfocar el modal
  setTimeout(() => modal.focus(), 100);
}

function createSettingsModal() {
  const modal = document.createElement('div');
  modal.className = 'settings-modal-overlay';
  modal.tabIndex = -1;
  
  // Obtener la ruta de datos del usuario para mostrarla
  window.electronAPI.getUserDataPath().then(userDataPath => {
    const pathItems = modal.querySelectorAll('.user-data-path');
    pathItems.forEach(item => {
      item.textContent = userDataPath;
    });
  });
  
  modal.innerHTML = `
    <div class="settings-modal">
      <div class="settings-header">
        <h2>⚙️ Configuraciones</h2>
        <button class="close-modal-btn" onclick="this.closest('.settings-modal-overlay').remove()">✕</button>
      </div>
      
      <div class="settings-content">
        <!-- Tabs -->
        <div class="settings-tabs">
          <button class="tab-btn active" data-tab="general">General</button>
          <button class="tab-btn" data-tab="configs">Configuraciones</button>
          <button class="tab-btn" data-tab="advanced">Avanzado</button>
          <button class="tab-btn" data-tab="info">Información</button>
        </div>
        
        <!-- Tab Content -->
        <div class="tab-content">
          <!-- General Tab -->
          <div class="tab-panel active" id="general-panel">
            <h3>Configuraciones Generales</h3>
            
            <div class="setting-group">
              <label>Tamaño de lote (números por vez)</label>
              <input type="number" id="batch-size" value="${appState.settings.batchSize}" min="1" max="20">
              <small>Cuántos números validar simultáneamente (1-20)</small>
            </div>
            
            <div class="setting-group">
              <label>Delay entre requests (ms)</label>
              <input type="number" id="delay-requests" value="${appState.settings.delayBetweenRequests}" min="500" max="10000" step="100">
              <small>Tiempo de espera entre validaciones (500-10000ms)</small>
            </div>
            
            <div class="setting-group">
              <label>Intentos de reintento</label>
              <input type="number" id="retry-attempts" value="${appState.settings.retryAttempts}" min="1" max="10">
              <small>Cuántas veces reintentar en caso de error (1-10)</small>
            </div>
            
            <div class="setting-actions">
              <button class="btn btn-primary" onclick="saveGeneralSettings()">💾 Guardar Cambios</button>
              <button class="btn btn-secondary" onclick="resetGeneralSettings()">🔄 Restaurar</button>
            </div>
          </div>
          
          <!-- Configurations Tab -->
          <div class="tab-panel" id="configs-panel">
            <h3>Configuraciones Cargadas</h3>
            
            <div class="configs-list">
              ${renderConfigsInModal()}
            </div>
            
            <div class="setting-actions">
              <button class="btn btn-primary" onclick="loadConfigurations(); updateConfigsInModal()">🔄 Recargar Configuraciones</button>
              <button class="btn btn-secondary" onclick="openDataFolder()">📁 Abrir Carpeta de Datos</button>
            </div>
          </div>
          
          <!-- Advanced Tab -->
          <div class="tab-panel" id="advanced-panel">
            <h3>Configuraciones Avanzadas</h3>
            
            <div class="setting-group">
              <label>Modo Debug</label>
              <div class="checkbox-wrapper">
                <input type="checkbox" id="debug-mode">
                <span>Activar logs detallados</span>
              </div>
              <small>Mostrar información adicional en los logs (solo para desarrollo)</small>
            </div>
            
            <div class="setting-group">
              <label>Limpiar datos temporales</label>
              <div style="display: flex; gap: var(--spacing-sm); flex-wrap: wrap;">
                <button class="btn btn-secondary" onclick="clearAppData()">🗑️ Limpiar Todo</button>
                <button class="btn btn-danger" onclick="resetApp()">⚠️ Reset Completo</button>
              </div>
              <small>Elimina logs, progreso y datos temporales. El reset completo cierra la aplicación.</small>
            </div>
          </div>
          
          <!-- Info Tab -->
          <div class="tab-panel" id="info-panel">
            <h3>Información del Sistema</h3>
            
            <div class="info-grid">
              <div class="info-item">
                <span class="info-label">Configuración:</span>
                <span class="info-value">${appState.selectedConfig ? appState.selectedConfig.nombre : 'Ninguna'}</span>
              </div>
              
              <div class="info-item">
                <span class="info-label">Credenciales:</span>
                <span class="info-value">${appState.credentialsExist ? '✅ Encontradas' : '❌ Faltantes'}</span>
              </div>
            </div>
            
            <div class="file-paths">
              <h4>Rutas de archivos:</h4>
              <div class="path-item">
                <strong>Carpeta de datos:</strong> <code class="user-data-path">Cargando...</code>
              </div>
              <div class="path-item">
                <strong>Configuraciones:</strong> <code class="user-data-path">Cargando...</code>/configs/
              </div>
              <div class="path-item">
                <strong>Credenciales:</strong> <code class="user-data-path">Cargando...</code>/credenciales.json
              </div>
              <div class="path-item">
                <strong>Logs de duplicados:</strong> <code class="user-data-path">Cargando...</code>/duplicados_log.txt
              </div>
              <div class="path-item">
                <strong>Sesión WhatsApp:</strong> <code class="user-data-path">Cargando...</code>/wwebjs_auth/
              </div>
            </div>
            
            <div class="setting-actions">
              <button class="btn btn-secondary" onclick="exportAppInfo()">📄 Exportar Información</button>
              <button class="btn btn-primary" onclick="openDataFolder()">📁 Abrir Carpeta de Datos</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  
  // Event listeners for tabs
  modal.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab, modal));
  });
  
  // Close on escape
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      modal.remove();
    }
  });
  
  // Close on overlay click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
  
  return modal;
}

function switchTab(tabName, modal) {
  // Update tab buttons
  modal.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  
  // Update tab panels
  modal.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `${tabName}-panel`);
  });
}

// ===== NUEVA FUNCIONALIDAD: CREAR CONFIGURACIÓN =====

/**
 * Renderiza la lista de configuraciones en el modal (ACTUALIZADA)
 */
function renderConfigsInModal() {
  // Botón para crear nueva configuración
  const createButton = `
    <div class="config-create-section">
      <button class="btn btn-primary btn-large" onclick="openConfigCreator()">
        ➕ Crear Nueva Configuración
      </button>
      <p class="text-muted">Crea una nueva configuración sin necesidad de editar archivos JSON</p>
    </div>
  `;
  
  if (appState.configs.length === 0) {
    return createButton + '<div class="no-configs">No hay configuraciones cargadas</div>';
  }
  
  const configsList = appState.configs.map(config => `
    <div class="config-modal-item">
      <div class="config-modal-header">
        <h4>${config.nombre}</h4>
        <span class="config-file">${config.archivo}</span>
      </div>
      <div class="config-modal-details">
        <p>${config.config.descripcion || 'Sin descripción'}</p>
        <div class="config-stats">
          <span>📊 ${config.config.principales?.length || 0} hoja(s)</span>
          <span>📁 ${config.archivo}</span>
        </div>
      </div>
      <div class="config-modal-actions">
        <button class="btn btn-small btn-primary" onclick="selectConfigFromModal('${config.path}')">📋 Seleccionar</button>
        <button class="btn btn-small btn-secondary" onclick="viewConfigDetails('${config.path}')">👁️ Ver Detalles</button>
      </div>
    </div>
  `).join('');
  
  return createButton + configsList;
}

/**
 * Abre el modal para crear una nueva configuración
 */
function openConfigCreator() {
  // Resetear estado
  configCreatorState = {
    sheets: [],
    currentSheet: null
  };
  
  const modal = createConfigCreatorModal();
  document.body.appendChild(modal);
  
  // Enfocar el primer campo
  setTimeout(() => {
    modal.querySelector('#config-name').focus();
  }, 100);
}

/**
 * Crea el modal de creación de configuración
 */
function createConfigCreatorModal() {
  const modal = document.createElement('div');
  modal.className = 'settings-modal-overlay';
  modal.tabIndex = -1;
  
  modal.innerHTML = `
    <div class="settings-modal config-creator-modal">
      <div class="settings-header">
        <h2>➕ Crear Nueva Configuración</h2>
        <button class="close-modal-btn" onclick="closeConfigCreator()">✕</button>
      </div>
      
      <div class="settings-content">
        <div class="tab-content">
          <div class="tab-panel active">
            
            <!-- Información básica -->
            <div class="config-creator-section">
              <h3>📋 Información Básica</h3>
              
              <div class="setting-group">
                <label for="config-name">Nombre de la configuración *</label>
                <input type="text" id="config-name" placeholder="Ej: Mi Empresa - Validación WhatsApp" required>
                <small>Nombre descriptivo para identificar esta configuración</small>
              </div>
              
              <div class="setting-group">
                <label for="config-description">Descripción (opcional)</label>
                <input type="text" id="config-description" placeholder="Descripción de la configuración">
                <small>Descripción adicional sobre el propósito de esta configuración</small>
              </div>
            </div>
            
            <!-- Hojas de cálculo -->
            <div class="config-creator-section">
              <h3>📊 Hojas de Cálculo de Google Sheets</h3>
              
              <div class="sheets-container">
                <div id="sheets-list" class="sheets-list">
                  <!-- Las hojas se agregarán aquí dinámicamente -->
                </div>
                
                <button type="button" class="btn btn-secondary" onclick="addNewSheet()">
                  ➕ Agregar Hoja de Cálculo
                </button>
              </div>
            </div>
            
            <!-- Vista previa del JSON -->
            <div class="config-creator-section">
              <h3>👁️ Vista Previa</h3>
              <div class="json-preview-container">
                <pre id="json-preview" class="json-preview">
{
  "nombre": "",
  "principales": []
}
                </pre>
              </div>
            </div>
            
            <!-- Acciones -->
            <div class="config-creator-actions">
              <button type="button" class="btn btn-secondary" onclick="closeConfigCreator()">
                ❌ Cancelar
              </button>
              <button type="button" class="btn btn-primary" onclick="saveNewConfig()" id="save-config-btn" disabled>
                💾 Crear Configuración
              </button>
            </div>
            
          </div>
        </div>
      </div>
    </div>
  `;
  
  // Event listeners
  setupConfigCreatorListeners(modal);
  
  return modal;
}

/**
 * Configura los event listeners del modal de creación
 */
function setupConfigCreatorListeners(modal) {
  // Auto-actualizar vista previa cuando cambian los campos
  const nameInput = modal.querySelector('#config-name');
  const descInput = modal.querySelector('#config-description');
  
  nameInput.addEventListener('input', updateJsonPreview);
  descInput.addEventListener('input', updateJsonPreview);
  
  // Cerrar modal con Escape
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeConfigCreator();
    }
  });
  
  // Agregar una hoja por defecto
  setTimeout(() => addNewSheet(), 100);
}

/**
 * *** FUNCIÓN MODIFICADA: Agrega una nueva hoja al formulario con columna Estado y Nombre ***
 */
function addNewSheet() {
  const sheetId = Date.now(); // ID único para esta hoja
  const sheet = {
    id: sheetId,
    spreadsheetId: '',
    sheetName: '',
    range: 'A1:Z',
    whatsappColumn: 'WhatsApp',
    validationColumn: 'Validación WA',
    estadoColumn: 'Estado', // Campo opcional existente
    nombreColumn: '' // *** NUEVO CAMPO ***
  };
  
  configCreatorState.sheets.push(sheet);
  renderSheetsList();
  updateJsonPreview();
}

/**
 * Elimina una hoja del formulario
 */
function removeSheet(sheetId) {
  configCreatorState.sheets = configCreatorState.sheets.filter(s => s.id !== sheetId);
  renderSheetsList();
  updateJsonPreview();
}

/**
 * *** FUNCIÓN MODIFICADA: Renderiza la lista de hojas con campo de columna Estado y Nombre ***
 */
function renderSheetsList() {
  const container = document.getElementById('sheets-list');
  
  if (configCreatorState.sheets.length === 0) {
    container.innerHTML = '<p class="text-muted">No hay hojas agregadas. Haz clic en "Agregar Hoja" para comenzar.</p>';
    return;
  }
  
  container.innerHTML = configCreatorState.sheets.map(sheet => `
    <div class="sheet-item" data-sheet-id="${sheet.id}">
      <div class="sheet-header">
        <h4>📊 Hoja ${configCreatorState.sheets.indexOf(sheet) + 1}</h4>
        <button type="button" class="btn btn-small btn-danger" onclick="removeSheet(${sheet.id})" title="Eliminar hoja">
          🗑️
        </button>
      </div>
      
      <div class="sheet-fields">
        <div class="config-row">
          <div class="setting-group">
            <label>ID de Google Sheets *</label>
            <input type="text" 
                   value="${sheet.spreadsheetId}" 
                   placeholder="Ej: 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
                   onchange="updateSheetField(${sheet.id}, 'spreadsheetId', this.value)"
                   required>
            <small>El ID se encuentra en la URL de Google Sheets: docs.google.com/spreadsheets/d/<strong>ID_AQUÍ</strong>/edit</small>
          </div>
          
          <div class="setting-group">
            <label>Nombre de la hoja *</label>
            <input type="text" 
                   value="${sheet.sheetName}" 
                   placeholder="Ej: Meta SUC, Meta CALL, Datos, etc."
                   onchange="updateSheetField(${sheet.id}, 'sheetName', this.value)"
                   required>
            <small>El nombre de la pestaña dentro del archivo de Google Sheets</small>
          </div>
        </div>
        
        <div class="config-row">
          <div class="setting-group">
            <label>Rango de datos</label>
            <input type="text" 
                   value="${sheet.range}" 
                   placeholder="A1:Z"
                   onchange="updateSheetField(${sheet.id}, 'range', this.value)">
            <small>Rango de celdas a procesar (por defecto A1:Z)</small>
          </div>
          
          <div class="setting-group">
            <label>Columna de WhatsApp *</label>
            <input type="text" 
                   value="${sheet.whatsappColumn}" 
                   placeholder="WhatsApp"
                   onchange="updateSheetField(${sheet.id}, 'whatsappColumn', this.value)"
                   required>
            <small>Nombre de la columna que contiene los números</small>
          </div>
        </div>
        
        <div class="config-row">
          <div class="setting-group">
            <label>Columna de validación *</label>
            <input type="text" 
                   value="${sheet.validationColumn}" 
                   placeholder="Validación WA"
                   onchange="updateSheetField(${sheet.id}, 'validationColumn', this.value)"
                   required>
            <small>Columna donde se escribirán los resultados (si/no/duplicado)</small>
          </div>
          
          <div class="setting-group">
            <label>Columna de estado (opcional)</label>
            <input type="text" 
                   value="${sheet.estadoColumn || ''}" 
                   placeholder="Estado"
                   onchange="updateSheetField(${sheet.id}, 'estadoColumn', this.value)">
            <small>Columna donde se escribirá "Inválido" para números no válidos</small>
          </div>
        </div>
        
        <!-- *** NUEVA FILA: Solo columna de nombre, con info box explicativo *** -->
        <div class="config-row config-row-nombre">
          <div class="setting-group">
            <label>Columna de nombre (opcional)</label>
            <input type="text" 
                   value="${sheet.nombreColumn || ''}" 
                   placeholder="Nombre"
                   onchange="updateSheetField(${sheet.id}, 'nombreColumn', this.value)"
                   class="nombre-input">
            <small>Si se especifica, los nombres se normalizarán automáticamente durante la validación</small>
          </div>
          
          <div class="setting-group">
            <div class="info-box-nombres">
              <h5>✨ Normalización Automática</h5>
              <p><strong>Elimina:</strong> Comillas, caracteres especiales problemáticos</p>
              <p><strong>Corrige:</strong> Espacios múltiples, capitalización</p>
              <p><strong>Resultado:</strong> Mejor compatibilidad con Make y otras integraciones</p>
              <div class="ejemplo">
                <small><strong>Ejemplo:</strong> "juan  PÉREZ" → Juan Pérez</small>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `).join('');
}

/**
 * Actualiza un campo específico de una hoja
 */
function updateSheetField(sheetId, field, value) {
  const sheet = configCreatorState.sheets.find(s => s.id === sheetId);
  if (sheet) {
    sheet[field] = value;
    updateJsonPreview();
  }
}

/**
 * *** FUNCIÓN MODIFICADA: Actualiza la vista previa del JSON con columna Estado y Nombre ***
 */
function updateJsonPreview() {
  const nameInput = document.getElementById('config-name');
  const descInput = document.getElementById('config-description');
  const saveBtn = document.getElementById('save-config-btn');
  
  // Construir JSON con nueva estructura
  const config = {
    nombre: nameInput?.value || '',
    principales: configCreatorState.sheets.map(sheet => {
      const sheetConfig = {
        spreadsheetId: sheet.spreadsheetId,
        sheetName: sheet.sheetName,
        range: sheet.range,
        columnas: {
          whatsapp: sheet.whatsappColumn,
          validacion: sheet.validationColumn
        }
      };
      
      // Agregar columna de estado si está definida
      if (sheet.estadoColumn && sheet.estadoColumn.trim() !== '') {
        sheetConfig.columnas.estado = sheet.estadoColumn;
      }
      
      // *** NUEVA LÍNEA: Agregar columna de nombre si está definida ***
      if (sheet.nombreColumn && sheet.nombreColumn.trim() !== '') {
        sheetConfig.columnas.nombre = sheet.nombreColumn;
      }
      
      return sheetConfig;
    })
  };
  
  // Agregar descripción si existe
  if (descInput?.value) {
    config.descripcion = descInput.value;
  }
  
  // Actualizar vista previa
  const preview = document.getElementById('json-preview');
  if (preview) {
    preview.textContent = JSON.stringify(config, null, 2);
  }
  
  // Validar si se puede guardar
  const isValid = validateConfig(config);
  if (saveBtn) {
    saveBtn.disabled = !isValid;
  }
}

/**
 * Valida si la configuración es válida
 */
function validateConfig(config) {
  // Nombre requerido
  if (!config.nombre || config.nombre.trim() === '') {
    return false;
  }
  
  // Al menos una hoja
  if (!config.principales || config.principales.length === 0) {
    return false;
  }
  
  // Validar cada hoja
  for (const sheet of config.principales) {
    if (!sheet.spreadsheetId || !sheet.sheetName) {
      return false;
    }
    
    // Validar formato del spreadsheetId (básico)
    if (sheet.spreadsheetId.length < 20) {
      return false;
    }
  }
  
  return true;
}

/**
 * *** FUNCIÓN MODIFICADA: Guarda la nueva configuración con columna Estado y Nombre ***
 */
async function saveNewConfig() {
  const nameInput = document.getElementById('config-name');
  const descInput = document.getElementById('config-description');
  
  // Construir configuración final con nueva estructura
  const config = {
    nombre: nameInput.value.trim(),
    principales: configCreatorState.sheets.map(sheet => {
      const sheetConfig = {
        spreadsheetId: sheet.spreadsheetId.trim(),
        sheetName: sheet.sheetName.trim(),
        range: sheet.range.trim(),
        columnas: {
          whatsapp: sheet.whatsappColumn.trim(),
          validacion: sheet.validationColumn.trim()
        }
      };
      
      // Agregar columna de estado si está definida
      if (sheet.estadoColumn && sheet.estadoColumn.trim() !== '') {
        sheetConfig.columnas.estado = sheet.estadoColumn.trim();
      }
      
      // *** NUEVA LÍNEA: Agregar columna de nombre si está definida ***
      if (sheet.nombreColumn && sheet.nombreColumn.trim() !== '') {
        sheetConfig.columnas.nombre = sheet.nombreColumn.trim();
      }
      
      return sheetConfig;
    })
  };
  
  // Agregar descripción si existe
  if (descInput.value.trim()) {
    config.descripcion = descInput.value.trim();
  }
  
  // Validar configuración
  if (!validateConfig(config)) {
    showToast('error', 'Error de validación', 'Por favor, completa todos los campos requeridos');
    return;
  }
  
  try {
    // Deshabilitar botón mientras se guarda
    const saveBtn = document.getElementById('save-config-btn');
    saveBtn.disabled = true;
    saveBtn.textContent = '💾 Guardando...';
    
    // Crear nombre de archivo (sanitizado)
    const fileName = config.nombre
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 50) + '.json';
    
    // Llamar al proceso principal para guardar
    const result = await window.electronAPI.saveNewConfig(fileName, config);
    
    if (result.success) {
      showToast('success', 'Configuración creada', `Archivo ${fileName} creado exitosamente`);
      
      // Recargar configuraciones
      await loadConfigurations();
      updateConfigsInModal();
      
      // Cerrar modal
      closeConfigCreator();
      
      // Opcional: Seleccionar automáticamente la nueva configuración
      const newConfig = appState.configs.find(c => c.archivo === fileName);
      if (newConfig) {
        selectConfiguration(newConfig);
      }
      
    } else {
      throw new Error(result.error || 'Error desconocido al guardar');
    }
    
  } catch (error) {
    showToast('error', 'Error al guardar', error.message || 'No se pudo crear la configuración');
    
    // Rehabilitar botón
    const saveBtn = document.getElementById('save-config-btn');
    saveBtn.disabled = false;
    saveBtn.textContent = '💾 Crear Configuración';
  }
}

/**
 * Cierra el modal de creación
 */
function closeConfigCreator() {
  const modal = document.querySelector('.config-creator-modal')?.closest('.settings-modal-overlay');
  if (modal) {
    modal.remove();
  }
}

// ===== FIN DE FUNCIONALIDAD CREAR CONFIGURACIÓN =====

function updateConfigsInModal() {
  const configsPanel = document.getElementById('configs-panel');
  if (configsPanel) {
    const configsList = configsPanel.querySelector('.configs-list');
    configsList.innerHTML = renderConfigsInModal();
  }
}

function selectConfigFromModal(configPath) {
  const config = appState.configs.find(c => c.path === configPath);
  if (config) {
    selectConfiguration(config);
    document.querySelector('.settings-modal-overlay').remove();
    showToast('success', 'Configuración seleccionada', config.nombre);
  }
}

function viewConfigDetails(configPath) {
  const config = appState.configs.find(c => c.path === configPath);
  if (config) {
    const details = JSON.stringify(config.config, null, 2);
    const detailsModal = document.createElement('div');
    detailsModal.className = 'details-modal-overlay';
    detailsModal.innerHTML = `
      <div class="details-modal">
        <div class="details-header">
          <h3>📋 Detalles: ${config.nombre}</h3>
          <button class="close-modal-btn" onclick="this.closest('.details-modal-overlay').remove()">✕</button>
        </div>
        <div class="details-content">
          <pre><code>${details}</code></pre>
        </div>
      </div>
    `;
    document.body.appendChild(detailsModal);
  }
}

// Funciones auxiliares para configuraciones avanzadas
window.saveGeneralSettings = function() {
  const batchSize = document.getElementById('batch-size')?.value;
  const delayRequests = document.getElementById('delay-requests')?.value;
  const retryAttempts = document.getElementById('retry-attempts')?.value;
  
  if (batchSize) appState.settings.batchSize = parseInt(batchSize);
  if (delayRequests) appState.settings.delayBetweenRequests = parseInt(delayRequests);
  if (retryAttempts) appState.settings.retryAttempts = parseInt(retryAttempts);
  
  showToast('success', 'Configuración guardada', 'Los cambios se aplicarán en la próxima validación');
}

window.resetGeneralSettings = function() {
  appState.settings = {
    batchSize: 5,
    delayBetweenRequests: 1500,
    retryAttempts: 3
  };
  
  document.getElementById('batch-size').value = appState.settings.batchSize;
  document.getElementById('delay-requests').value = appState.settings.delayBetweenRequests;
  document.getElementById('retry-attempts').value = appState.settings.retryAttempts;
  
  showToast('info', 'Configuración restaurada', 'Valores por defecto restaurados');
}

window.clearAppData = function() {
  if (confirm('¿Estás seguro de que quieres limpiar todos los datos temporales?')) {
    appState.logs = [];
    appState.validationData = {
      total: 0,
      completed: 0,
      valid: 0,
      invalid: 0,
      duplicates: 0
    };
    
    renderLogs();
    resetProgress();
    showToast('success', 'Datos limpiados', 'Todos los logs y datos temporales han sido eliminados');
  }
}

window.resetApp = function() {
  if (confirm('⚠️ ¿Estás seguro de que quieres resetear completamente la aplicación? Esto cerrará la app.')) {
    if (confirm('Esta acción NO se puede deshacer. ¿Continuar?')) {
      // Intentar cerrar la validación si está activa
      window.electronAPI.stopValidation();
      showToast('warning', 'Reseteando aplicación...', 'La aplicación se cerrará');
      // Cerrar la aplicación después de un breve delay
      setTimeout(() => {
        window.close();
      }, 2000);
    }
  }
}

window.exportAppInfo = function() {
  const info = {
    timestamp: new Date().toISOString(),
    appState: {
      configs: appState.configs.length,
      validationStatus: appState.validationStatus,
      logsCount: appState.logs.length,
      selectedConfig: appState.selectedConfig?.nombre || 'Ninguna',
      credentialsExist: appState.credentialsExist
    },
    settings: appState.settings,
    validationData: appState.validationData,
    recentLogs: appState.logs.slice(0, 10) // Solo los 10 más recientes
  };
  
  const blob = new Blob([JSON.stringify(info, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `validador-info-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  
  showToast('success', 'Información exportada', 'Archivo JSON descargado exitosamente');
}

// Funciones globales necesarias para los botones
window.openDataFolder = openDataFolder;
window.selectConfigFromModal = selectConfigFromModal;
window.viewConfigDetails = viewConfigDetails;
window.loadConfigurations = loadConfigurations;
window.updateConfigsInModal = updateConfigsInModal;
window.openConfigCreator = openConfigCreator;
window.closeConfigCreator = closeConfigCreator;
window.addNewSheet = addNewSheet;
window.removeSheet = removeSheet;
window.updateSheetField = updateSheetField;
window.saveNewConfig = saveNewConfig;

// Utilidades
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Manejo de errores globales
window.addEventListener('error', (event) => {
  console.error('Error global:', event.error);
  showToast('error', 'Error inesperado', 'Revisa la consola para más detalles');
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Promise rechazada:', event.reason);
  showToast('error', 'Error de promesa', 'Operación fallida');
});