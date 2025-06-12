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
    
    const result = await window.electronAPI.startValidation(appState.selectedConfig.path);
    
    if (result.success) {
      appState.validationStatus = 'running';
      
      // Actualizar botones
      elements.startBtn.classList.add('hidden');
      elements.pauseBtn.classList.remove('hidden');
      elements.stopBtn.classList.remove('hidden');
      
      // Mostrar sección QR
      showQRSection();
      
      addLogEntry({
        type: 'info',
        message: `Iniciando validación con configuración: ${appState.selectedConfig.nombre}`,
        timestamp: new Date().toISOString()
      });
    } else {
      // Si es error de credenciales, se manejará en el listener
      if (result.error !== 'CREDENTIALS_NOT_FOUND') {
        throw new Error(result.error);
      }
    }
  } catch (error) {
    console.error('Error iniciando validación:', error);
    updateStatusIndicator('error', 'Error al iniciar');
    showToast('error', 'Error', 'No se pudo iniciar la validación: ' + error.message);
  }
}

async function pauseValidation() {
  try {
    const result = await window.electronAPI.pauseValidation();
    if (result.success) {
      appState.validationStatus = 'paused';
      updateStatusIndicator('warning', 'Validación pausada');
      showToast('info', 'Pausado', 'Validación pausada');
      
      addLogEntry({
        type: 'warning',
        message: 'Validación pausada por el usuario',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    showToast('error', 'Error', 'No se pudo pausar la validación');
  }
}

async function stopValidation() {
  try {
    const result = await window.electronAPI.stopValidation();
    if (result.success) {
      appState.validationStatus = 'inactive';
      updateStatusIndicator('active', 'Validación detenida');
      showToast('info', 'Detenido', 'Validación detenida');
      
      // Resetear UI
      elements.startBtn.classList.remove('hidden');
      elements.pauseBtn.classList.add('hidden');
      elements.stopBtn.classList.add('hidden');
      
      hideQRCode();
      resetProgress();
      
      addLogEntry({
        type: 'warning',
        message: 'Validación detenida por el usuario',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    showToast('error', 'Error', 'No se pudo detener la validación');
  }
}

// Gestión de UI
function showScreen(screenName) {
  // Ocultar todas las pantallas
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.add('hidden');
  });
  
  // Mostrar pantalla seleccionada
  if (screenName === 'config') {
    elements.configScreen.classList.remove('hidden');
    appState.currentScreen = 'config';
  } else if (screenName === 'validation') {
    elements.validationScreen.classList.remove('hidden');
    appState.currentScreen = 'validation';
  } else if (screenName === 'credentials') {
    elements.credentialsScreen.classList.remove('hidden');
    appState.currentScreen = 'credentials';
  }
}

function updateStatusIndicator(status, text) {
  elements.statusIndicator.className = `status-indicator ${status}`;
  elements.statusText.textContent = text;
  appState.validationStatus = status;
}

function showQRSection() {
  elements.qrSection.classList.remove('hidden');
  elements.progressSection.classList.add('hidden');
}

function showQRCode(qr) {
  // Crear QR code visual mejorado
  elements.qrCode.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; gap: 20px;">
      <div id="qr-visual" style="background: white; padding: 20px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.15); border: 1px solid #e0e0e0;"></div>
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
      // Limpiar contenido anterior
      qrVisual.innerHTML = '';
      
      // Crear canvas para el QR
      const canvas = document.createElement('canvas');
      qrVisual.appendChild(canvas);
      
      // Generar QR visual
      new QRious({
        element: canvas,
        value: qrData,
        size: 280,
        level: 'M',
        background: 'white',
        foreground: 'black',
        padding: 10
      });
      
      // Agregar estilo al canvas
      canvas.style.borderRadius = '8px';
      canvas.style.display = 'block';
    }
  } catch (error) {
    console.log('Error generando QR visual:', error);
    // El QR ASCII sigue funcionando como fallback
    const qrVisual = document.getElementById('qr-visual');
    if (qrVisual) {
      qrVisual.innerHTML = `
        <div style="padding: 20px; text-align: center; color: #666; border: 2px dashed #ddd; border-radius: 8px;">
          <p>📷 QR visual no disponible</p>
          <p style="font-size: 0.8rem; margin-top: 8px;">Usa el código ASCII de abajo</p>
        </div>
      `;
    }
  }
}

function hideQRCode() {
  elements.qrSection.classList.add('hidden');
}

function showProgressSection() {
  elements.progressSection.classList.remove('hidden');
  elements.qrSection.classList.add('hidden');
}

function updateProgress(data) {
  appState.validationData = { ...appState.validationData, ...data };
  
  const { total, completed, valid, invalid, duplicates, currentNumber, currentStatus } = data;
  
  // Actualizar estadísticas
  elements.totalNumbers.textContent = total || 0;
  elements.validNumbers.textContent = valid || 0;
  elements.invalidNumbers.textContent = invalid || 0;
  elements.duplicateNumbers.textContent = duplicates || 0;
  
  // Actualizar barra de progreso
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  elements.progressFill.style.width = `${percentage}%`;
  elements.progressPercentage.textContent = `${percentage}%`;
  elements.progressCount.textContent = `${completed || 0} / ${total || 0}`;
  
  // Actualizar procesamiento actual
  if (currentNumber) {
    elements.currentNumber.textContent = currentNumber;
    elements.currentStatus.textContent = currentStatus || 'Procesando...';
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
  elements.currentStatus.textContent = 'En espera...';
}

// Gestión de logs
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
    elements.logContainer.innerHTML = `
      <div class="log-empty">
        <p>Los registros aparecerán aquí durante la validación</p>
      </div>
    `;
    return;
  }
  
  elements.logContainer.innerHTML = appState.logs.map(log => {
    const time = new Date(log.timestamp).toLocaleTimeString('es-ES', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    
    const icon = getLogIcon(log.type);
    
    return `
      <div class="log-entry ${log.type}">
        <span class="log-timestamp">${time}</span>
        <span class="log-icon">${icon}</span>
        <span class="log-message">${log.message}</span>
      </div>
    `;
  }).join('');
  
  // Auto-scroll al último log
  elements.logContainer.scrollTop = 0;
}

function getLogIcon(type) {
  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️'
  };
  return icons[type] || 'ℹ️';
}

function clearLogs() {
  appState.logs = [];
  renderLogs();
  showToast('info', 'Logs limpiados', 'Se eliminaron todos los registros');
}

function exportLogs() {
  if (appState.logs.length === 0) {
    showToast('warning', 'Sin logs', 'No hay registros para exportar');
    return;
  }
  
  const logsText = appState.logs.map(log => {
    const time = new Date(log.timestamp).toLocaleString('es-ES');
    return `[${time}] ${log.type.toUpperCase()}: ${log.message}`;
  }).join('\n');
  
  const blob = new Blob([logsText], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `validacion-logs-${new Date().toISOString().split('T')[0]}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  
  showToast('success', 'Logs exportados', 'Archivo descargado exitosamente');
}

// Gestión de toasts
function showToast(type, title, message, duration = 5000) {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  const icon = getToastIcon(type);
  
  toast.innerHTML = `
    <div class="toast-icon">${icon}</div>
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
            </div>
            
            <div class="setting-group">
              <label>Auto-backup de logs</label>
              <div class="checkbox-wrapper">
                <input type="checkbox" id="auto-backup" checked>
                <span>Guardar logs automáticamente</span>
              </div>
            </div>
            
            <div class="setting-group">
              <label>Límite de logs en memoria</label>
              <input type="number" id="log-limit" value="100" min="50" max="1000" step="50">
              <small>Máximo número de logs a mantener en memoria</small>
            </div>
            
            <div class="setting-actions">
              <button class="btn btn-warning" onclick="clearAllData()">🗑️ Limpiar Todos los Datos</button>
              <button class="btn btn-danger" onclick="resetApp()">⚠️ Resetear Aplicación</button>
            </div>
          </div>
          
          <!-- Info Tab -->
          <div class="tab-panel" id="info-panel">
            <h3>Información del Sistema</h3>
            
            <div class="info-grid">
              <div class="info-item">
                <span class="info-label">Configuraciones cargadas:</span>
                <span class="info-value">${appState.configs.length}</span>
              </div>
              
              <div class="info-item">
                <span class="info-label">Estado actual:</span>
                <span class="info-value">${appState.validationStatus}</span>
              </div>
              
              <div class="info-item">
                <span class="info-label">Logs en memoria:</span>
                <span class="info-value">${appState.logs.length}</span>
              </div>
              
              <div class="info-item">
                <span class="info-label">Última validación:</span>
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

function renderConfigsInModal() {
  if (appState.configs.length === 0) {
    return '<div class="no-configs">No hay configuraciones cargadas</div>';
  }
  
  return appState.configs.map(config => `
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
}

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

// Funciones globales necesarias para los botones inline
window.saveGeneralSettings = function() {
  const batchSize = parseInt(document.getElementById('batch-size').value);
  const delayRequests = parseInt(document.getElementById('delay-requests').value);
  const retryAttempts = parseInt(document.getElementById('retry-attempts').value);
  
  // Validaciones
  if (batchSize < 1 || batchSize > 20) {
    showToast('error', 'Error', 'Tamaño de lote debe estar entre 1 y 20');
    return;
  }
  
  if (delayRequests < 500 || delayRequests > 10000) {
    showToast('error', 'Error', 'Delay debe estar entre 500 y 10000ms');
    return;
  }
  
  if (retryAttempts < 1 || retryAttempts > 10) {
    showToast('error', 'Error', 'Intentos de reintento debe estar entre 1 y 10');
    return;
  }
  
  // Guardar configuraciones
  appState.settings = {
    batchSize,
    delayBetweenRequests: delayRequests,
    retryAttempts
  };
  
  showToast('success', 'Configuraciones guardadas', 'Los cambios se aplicarán en la próxima validación');
}

window.resetGeneralSettings = function() {
  appState.settings = {
    batchSize: 5,
    delayBetweenRequests: 1500,
    retryAttempts: 3
  };
  
  document.getElementById('batch-size').value = 5;
  document.getElementById('delay-requests').value = 1500;
  document.getElementById('retry-attempts').value = 3;
  
  showToast('info', 'Configuraciones restauradas', 'Valores por defecto aplicados');
}

window.clearAllData = function() {
  if (confirm('¿Estás seguro de que quieres limpiar todos los logs y datos temporales?')) {
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

window.openDataFolder = openDataFolder;
window.selectConfigFromModal = selectConfigFromModal;
window.viewConfigDetails = viewConfigDetails;
window.loadConfigurations = loadConfigurations;
window.updateConfigsInModal = updateConfigsInModal;

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