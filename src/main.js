const { app, BrowserWindow, ipcMain, dialog, Menu, Notification, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// Importar tu lógica de validación
const ValidadorCore = require('./core/validator');

let mainWindow;
let validadorInstance = null;

// Configuración de directorios
const isDev = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';
const baseDir = isDev ? __dirname : path.dirname(app.getPath('exe'));
const userDataPath = app.getPath('userData');
const CONFIGS_DIR = path.join(userDataPath, 'configs');

// Variables para evitar verificaciones repetidas
let credentialsChecked = false;
let credentialsExist = false;

// Crear carpeta de datos si no existe
function ensureUserDataFolders() {
  try {
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
    if (!fs.existsSync(CONFIGS_DIR)) {
      fs.mkdirSync(CONFIGS_DIR, { recursive: true });
    }
    console.log(`Carpetas de datos aseguradas: ${userDataPath}`);
  } catch (error) {
    console.error('Error creando carpetas de datos:', error);
  }
}

// Verificar credenciales una sola vez al inicio
function checkCredentialsOnce() {
  if (credentialsChecked) {
    return credentialsExist;
  }
  
  const credentialsPath = path.join(userDataPath, 'credenciales.json');
  credentialsExist = fs.existsSync(credentialsPath);
  credentialsChecked = true;
  
  console.log(`Verificación de credenciales: ${credentialsExist ? 'Encontradas' : 'No encontradas'} en ${credentialsPath}`);
  return credentialsExist;
}

// Resetear verificación de credenciales (cuando el usuario las agrega)
function resetCredentialsCheck() {
  credentialsChecked = false;
  console.log('Verificación de credenciales reseteada');
}

/**
 * Valida los datos de una configuración antes de guardarla
 */
function validateConfigData(configData) {
  try {
    // Verificar estructura básica
    if (!configData || typeof configData !== 'object') {
      return { isValid: false, error: 'Datos de configuración inválidos' };
    }
    
    // Verificar nombre
    if (!configData.nombre || typeof configData.nombre !== 'string' || configData.nombre.trim() === '') {
      return { isValid: false, error: 'El nombre de la configuración es requerido' };
    }
    
    // Verificar principales
    if (!configData.principales || !Array.isArray(configData.principales) || configData.principales.length === 0) {
      return { isValid: false, error: 'Debe haber al menos una hoja de cálculo configurada' };
    }
    
    // Validar cada hoja
    for (let i = 0; i < configData.principales.length; i++) {
      const sheet = configData.principales[i];
      
      // Verificar spreadsheetId
      if (!sheet.spreadsheetId || typeof sheet.spreadsheetId !== 'string' || sheet.spreadsheetId.trim() === '') {
        return { isValid: false, error: `Hoja ${i + 1}: ID de Google Sheets es requerido` };
      }
      
      // Verificar formato básico del spreadsheetId (debe tener al menos 20 caracteres)
      if (sheet.spreadsheetId.length < 20) {
        return { isValid: false, error: `Hoja ${i + 1}: ID de Google Sheets parece inválido (muy corto)` };
      }
      
      // Verificar sheetName
      if (!sheet.sheetName || typeof sheet.sheetName !== 'string' || sheet.sheetName.trim() === '') {
        return { isValid: false, error: `Hoja ${i + 1}: Nombre de la hoja es requerido` };
      }
      
      // Verificar range (opcional, pero si existe debe ser string)
      if (sheet.range && (typeof sheet.range !== 'string' || sheet.range.trim() === '')) {
        return { isValid: false, error: `Hoja ${i + 1}: Rango inválido` };
      }
      
      // Verificar columnas
      if (!sheet.columnas || typeof sheet.columnas !== 'object') {
        return { isValid: false, error: `Hoja ${i + 1}: Configuración de columnas inválida` };
      }
      
      if (!sheet.columnas.whatsapp || typeof sheet.columnas.whatsapp !== 'string' || sheet.columnas.whatsapp.trim() === '') {
        return { isValid: false, error: `Hoja ${i + 1}: Columna de WhatsApp es requerida` };
      }
      
      if (!sheet.columnas.validacion || typeof sheet.columnas.validacion !== 'string' || sheet.columnas.validacion.trim() === '') {
        return { isValid: false, error: `Hoja ${i + 1}: Columna de validación es requerida` };
      }
    }
    
    return { isValid: true };
    
  } catch (error) {
    return { isValid: false, error: `Error validando configuración: ${error.message}` };
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    icon: path.join(__dirname, '../assets/icon.png'),
    show: false
  });

  // Cargar la aplicación
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Mostrar ventana cuando esté lista
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    // Verificar credenciales al cargar
    if (!checkCredentialsOnce()) {
      mainWindow.webContents.send('credentials-missing', {
        path: userDataPath,
        message: `No se encontró credenciales.json. Por favor, coloca el archivo en:\n${userDataPath}`
      });
    }
  });

  // DevTools en desarrollo
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  return mainWindow;
}

function openUserDataFolder() {
  shell.openPath(userDataPath);
}

function createMenu() {
  const isMac = process.platform === 'darwin';
  
  const template = [
    // macOS app menu
    ...(isMac ? [{
      label: app.getName(),
      submenu: [
        { label: 'Acerca de ' + app.getName(), role: 'about' },
        { type: 'separator' },
        { label: 'Servicios', role: 'services' },
        { type: 'separator' },
        { label: 'Ocultar ' + app.getName(), accelerator: 'Command+H', role: 'hide' },
        { label: 'Ocultar Otros', accelerator: 'Command+Shift+H', role: 'hideothers' },
        { label: 'Mostrar Todo', role: 'unhide' },
        { type: 'separator' },
        { label: 'Salir', accelerator: 'Command+Q', role: 'quit' }
      ]
    }] : []),
    
    // File menu
    {
      label: 'Archivo',
      submenu: [
        { 
          label: 'Abrir Configuración...', 
          accelerator: isMac ? 'Command+O' : 'Ctrl+O',
          click: abrirConfiguracion
        },
        { type: 'separator' },
        { 
          label: 'Abrir Carpeta de Datos', 
          accelerator: isMac ? 'Command+Shift+O' : 'Ctrl+Shift+O',
          click: openUserDataFolder 
        },
        { type: 'separator' },
        isMac ? { label: 'Cerrar Ventana', accelerator: 'Command+W', role: 'close' }
              : { label: 'Salir', accelerator: 'Ctrl+Q', role: 'quit' }
      ]
    },
    
    // Edit menu
    {
      label: 'Editar',
      submenu: [
        { label: 'Deshacer', accelerator: isMac ? 'Command+Z' : 'Ctrl+Z', role: 'undo' },
        { label: 'Rehacer', accelerator: isMac ? 'Command+Shift+Z' : 'Ctrl+Y', role: 'redo' },
        { type: 'separator' },
        { label: 'Cortar', accelerator: isMac ? 'Command+X' : 'Ctrl+X', role: 'cut' },
        { label: 'Copiar', accelerator: isMac ? 'Command+C' : 'Ctrl+C', role: 'copy' },
        { label: 'Pegar', accelerator: isMac ? 'Command+V' : 'Ctrl+V', role: 'paste' },
        { label: 'Seleccionar Todo', accelerator: isMac ? 'Command+A' : 'Ctrl+A', role: 'selectall' }
      ]
    },
    
    // View menu
    {
      label: 'Ver',
      submenu: [
        { label: 'Recargar', accelerator: isMac ? 'Command+R' : 'Ctrl+R', role: 'reload' },
        { label: 'Forzar Recarga', accelerator: isMac ? 'Command+Shift+R' : 'Ctrl+Shift+R', role: 'forceReload' },
        { label: 'Herramientas de Desarrollador', accelerator: isMac ? 'F12' : 'F12', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: 'Tamaño Real', accelerator: isMac ? 'Command+0' : 'Ctrl+0', role: 'resetZoom' },
        { label: 'Aumentar Zoom', accelerator: isMac ? 'Command+Plus' : 'Ctrl+Plus', role: 'zoomIn' },
        { label: 'Reducir Zoom', accelerator: isMac ? 'Command+-' : 'Ctrl+-', role: 'zoomOut' },
        { type: 'separator' },
        { label: 'Pantalla Completa', accelerator: isMac ? 'Control+Command+F' : 'F11', role: 'togglefullscreen' }
      ]
    },
    
    // Window menu
    {
      label: 'Ventana',
      submenu: [
        { label: 'Minimizar', accelerator: isMac ? 'Command+M' : 'Ctrl+M', role: 'minimize' },
        { label: 'Cerrar', accelerator: isMac ? 'Command+W' : 'Ctrl+W', role: 'close' },
        ...(isMac ? [
          { type: 'separator' },
          { label: 'Traer Todo al Frente', role: 'front' }
        ] : [])
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

async function abrirConfiguracion() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Seleccionar archivo de configuración',
    defaultPath: CONFIGS_DIR,
    filters: [
      { name: 'Archivos JSON', extensions: ['json'] }
    ],
    properties: ['openFile']
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const configPath = result.filePaths[0];
    mainWindow.webContents.send('config-selected', configPath);
  }
}

// Event listeners de la app
app.whenReady().then(() => {
  ensureUserDataFolders();
  createWindow();
  createMenu();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC Handlers - Comunicación con el renderer
ipcMain.handle('get-configs', async () => {
  try {
    ensureUserDataFolders();
    
    const archivos = fs.readdirSync(CONFIGS_DIR).filter(f => f.endsWith('.json'));
    const configs = [];

    for (const archivo of archivos) {
      try {
        const configPath = path.join(CONFIGS_DIR, archivo);
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        configs.push({
          nombre: config.nombre || archivo.replace('.json', ''),
          archivo: archivo,
          path: configPath,
          config: config
        });
      } catch (err) {
        console.error(`Error cargando ${archivo}:`, err);
      }
    }

    return configs;
  } catch (error) {
    console.error('Error obteniendo configuraciones:', error);
    return [];
  }
});

ipcMain.handle('check-credentials', async () => {
  // Forzar nueva verificación si se solicita explícitamente
  resetCredentialsCheck();
  const exists = checkCredentialsOnce();
  
  return {
    exists: exists,
    path: userDataPath
  };
});

ipcMain.handle('open-data-folder', async () => {
  openUserDataFolder();
  return { success: true };
});

/**
 * Handler para guardar una nueva configuración
 */
ipcMain.handle('save-new-config', async (event, fileName, configData) => {
  try {
    ensureUserDataFolders();
    const configFilePath = path.join(CONFIGS_DIR, fileName);
    
    // Verificar que el archivo no exista ya
    if (fs.existsSync(configFilePath)) {
      return {
        success: false,
        error: `Ya existe una configuración con el nombre ${fileName}. Elige un nombre diferente.`
      };
    }
    
    // Validar datos de configuración
    const validation = validateConfigData(configData);
    if (!validation.isValid) {
      return {
        success: false,
        error: `Configuración inválida: ${validation.error}`
      };
    }
    
    // Guardar archivo JSON con formato bonito
    fs.writeFileSync(configFilePath, JSON.stringify(configData, null, 2), 'utf8');
    
    // Log del éxito
    console.log(`Nueva configuración guardada: ${configFilePath}`);
    
    return {
      success: true,
      filePath: configFilePath,
      fileName: fileName
    };
    
  } catch (error) {
    console.error('Error guardando configuración:', error);
    return {
      success: false,
      error: error.message || 'Error desconocido al guardar la configuración'
    };
  }
});

ipcMain.handle('start-validation', async (event, configPath) => {
  try {
    // Verificar credenciales nuevamente antes de iniciar
    const credentialsPath = path.join(userDataPath, 'credenciales.json');
    if (!fs.existsSync(credentialsPath)) {
      return {
        success: false,
        error: 'CREDENTIALS_NOT_FOUND',
        details: {
          message: `No se encontró credenciales.json. Por favor, coloca el archivo en:\n${userDataPath}`,
          path: userDataPath
        }
      };
    }

    // Crear nueva instancia del validador
    validadorInstance = new ValidadorCore(configPath, baseDir, userDataPath);

    // Event listeners del validador
    validadorInstance.on('qr', (qr) => {
      mainWindow.webContents.send('qr-code', qr);
    });

    validadorInstance.on('authenticated', () => {
      mainWindow.webContents.send('authenticated');
    });

    validadorInstance.on('ready', () => {
      mainWindow.webContents.send('whatsapp-ready');
    });

    validadorInstance.on('progress', (data) => {
      // Actualizar badge del dock en macOS
      if (process.platform === 'darwin' && app.dock && data.completed && data.total) {
        const percentage = Math.round((data.completed / data.total) * 100);
        app.dock.setBadge(percentage > 0 ? `${percentage}%` : '');
      }
      
      mainWindow.webContents.send('validation-progress', data);
    });

    validadorInstance.on('log', (logData) => {
      mainWindow.webContents.send('validation-log', logData);
    });

    validadorInstance.on('error', (error) => {
      if (error.message === 'CREDENTIALS_NOT_FOUND') {
        mainWindow.webContents.send('validation-error', {
          code: 'CREDENTIALS_NOT_FOUND',
          message: error.details?.message || 'Credenciales no encontradas',
          path: error.details?.path || userDataPath
        });
      } else {
        mainWindow.webContents.send('validation-error', error);
      }
    });

    validadorInstance.on('completed', (results) => {
      mainWindow.webContents.send('validation-completed', results);
      
      // Limpiar badge del dock
      if (process.platform === 'darwin' && app.dock) {
        app.dock.setBadge('');
      }
      
      // Mostrar notificación del sistema
      try {
        if (Notification.isSupported()) {
          const notification = new Notification({
            title: 'Validación Completada',
            body: `Proceso finalizado. ${results.valid} válidos, ${results.invalid} inválidos.`,
            icon: path.join(__dirname, '../assets/icon.png'),
            silent: false
          });
          notification.show();
          
          // Auto-cerrar después de 5 segundos
          setTimeout(() => {
            notification.close();
          }, 5000);
        }
      } catch (error) {
        console.log('No se pudo mostrar notificación:', error.message);
      }
    });

    // Iniciar validación
    await validadorInstance.start();
    
    return { success: true };
  } catch (error) {
    console.error('Error iniciando validación:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('pause-validation', async () => {
  if (validadorInstance) {
    await validadorInstance.pause();
    return { success: true };
  }
  return { success: false, error: 'No hay validación en curso' };
});

ipcMain.handle('stop-validation', async () => {
  if (validadorInstance) {
    await validadorInstance.stop();
    validadorInstance = null;
    
    // Limpiar badge del dock (solo macOS)
    if (process.platform === 'darwin' && app.dock) {
      app.dock.setBadge('');
    }
    
    return { success: true };
  }
  return { success: false, error: 'No hay validación en curso' };
});

ipcMain.handle('get-validation-status', () => {
  if (validadorInstance) {
    return validadorInstance.getStatus();
  }
  return { status: 'inactive' };
});

ipcMain.handle('get-user-data-path', () => {
  return userDataPath;
});

// Manejar cierre de la aplicación
app.on('before-quit', async () => {
  if (validadorInstance) {
    await validadorInstance.cleanup();
  }
});

// Manejar errores no capturados
process.on('uncaughtException', (error) => {
  console.error('Error no capturado:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Promise rechazada no manejada:', reason);
});

// Log del entorno al iniciar
console.log(`Validador WhatsApp iniciando...`);
console.log(`Modo: ${isDev ? 'Desarrollo' : 'Producción'}`);
console.log(`Directorio base: ${baseDir}`);
console.log(`Datos de usuario: ${userDataPath}`);
console.log(`Directorio de configs: ${CONFIGS_DIR}`);