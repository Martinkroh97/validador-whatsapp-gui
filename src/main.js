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

  // Cargar la interfaz
  mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));

  // Mostrar cuando esté listo
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    // Abrir DevTools en desarrollo
    if (isDev) {
      mainWindow.webContents.openDevTools();
    }
    
    // Verificar credenciales al mostrar la ventana
    setTimeout(() => {
      checkCredentials();
    }, 1000);
  });

  // Manejar cierre de ventana
  mainWindow.on('closed', () => {
    mainWindow = null;
    if (validadorInstance) {
      validadorInstance.cleanup();
    }
  });
}

// Verificar si las credenciales existen
function checkCredentials() {
  if (!checkCredentialsOnce()) {
    mainWindow.webContents.send('credentials-missing', {
      path: userDataPath,
      message: `No se encontró el archivo credenciales.json.\n\nPor favor, colócalo en:\n${userDataPath}`
    });
  }
}

// Función para abrir la carpeta de datos del usuario
function openUserDataFolder() {
  shell.openPath(userDataPath);
}

// Crear menú nativo
function createMenu() {
  const isMac = process.platform === 'darwin';
  
  const template = [
    // App menu (solo en macOS)
    ...(isMac ? [{
      label: 'Validador WhatsApp',
      submenu: [
        { label: 'Acerca de Validador WhatsApp', role: 'about' },
        { type: 'separator' },
        { label: 'Ocultar Validador WhatsApp', accelerator: 'Command+H', role: 'hide' },
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
          click: () => {
            abrirConfiguracion();
          }
        },
        { type: 'separator' },
        {
          label: 'Abrir Carpeta de Datos',
          click: () => {
            openUserDataFolder();
          }
        },
        {
          label: 'Instrucciones de Instalación',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Configuración de credenciales',
              message: 'Instalación de credenciales.json',
              detail: `Para que la aplicación funcione correctamente:\n\n1. Coloca el archivo 'credenciales.json' en:\n${userDataPath}\n\n2. Usa "Abrir Carpeta de Datos" en el menú Archivo para acceder fácilmente a esta ubicación.\n\n3. La carpeta 'configs' también debe estar en la misma ubicación para guardar tus configuraciones.`,
              buttons: ['Entendido', 'Abrir Carpeta']
            }).then(result => {
              if (result.response === 1) {
                openUserDataFolder();
              }
            });
          }
        },
        { type: 'separator' },
        {
          label: 'Recargar Configuraciones',
          accelerator: isMac ? 'Command+R' : 'Ctrl+R',
          click: () => {
            mainWindow.webContents.send('reload-configs');
          }
        },
        ...(isMac ? [] : [
          { type: 'separator' },
          { label: 'Salir', accelerator: 'Ctrl+Q', role: 'quit' }
        ])
      ]
    },
    
    // Validation menu
    {
      label: 'Validación',
      submenu: [
        {
          label: 'Iniciar Validación',
          accelerator: isMac ? 'Command+Return' : 'Ctrl+Enter',
          click: () => {
            mainWindow.webContents.send('start-validation');
          }
        },
        {
          label: 'Pausar Validación',
          accelerator: isMac ? 'Command+P' : 'Ctrl+P',
          click: () => {
            mainWindow.webContents.send('pause-validation');
          }
        },
        {
          label: 'Detener Validación',
          accelerator: isMac ? 'Command+.' : 'Ctrl+.',
          click: () => {
            mainWindow.webContents.send('stop-validation');
          }
        }
      ]
    },
    
    // View menu
    {
      label: 'Ver',
      submenu: [
        { label: 'Recargar', accelerator: isMac ? 'Command+R' : 'Ctrl+R', role: 'reload' },
        { label: 'Forzar Recarga', accelerator: isMac ? 'Command+Shift+R' : 'Ctrl+Shift+R', role: 'forceReload' },
        { label: 'Herramientas de Desarrollador', accelerator: 'F12', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: 'Zoom Real', accelerator: isMac ? 'Command+0' : 'Ctrl+0', role: 'resetZoom' },
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

    // Cleanup anterior si existe
    if (validadorInstance) {
      await validadorInstance.cleanup();
    }

    // Crear nueva instancia pasando userDataPath
    validadorInstance = new ValidadorCore(configPath, baseDir, userDataPath);
    
    // Configurar listeners para eventos
    validadorInstance.on('qr-code', (qr) => {
      mainWindow.webContents.send('qr-code', qr);
    });

    validadorInstance.on('authenticated', () => {
      mainWindow.webContents.send('authenticated');
    });

    validadorInstance.on('ready', () => {
      mainWindow.webContents.send('whatsapp-ready');
    });

    validadorInstance.on('progress', (data) => {
      mainWindow.webContents.send('validation-progress', data);
      
      // Actualizar badge del dock con el progreso (solo macOS)
      if (process.platform === 'darwin' && app.dock) {
        const percentage = Math.round((data.completed / data.total) * 100);
        app.dock.setBadge(percentage.toString() + '%');
      }
    });

    validadorInstance.on('log', (logData) => {
      mainWindow.webContents.send('validation-log', logData);
    });

    validadorInstance.on('error', (error) => {
      // Si es un error de credenciales, enviar información especial
      if (error.message === 'CREDENTIALS_NOT_FOUND') {
        mainWindow.webContents.send('validation-error', {
          message: error.details.message,
          code: 'CREDENTIALS_NOT_FOUND',
          path: error.details.path
        });
      } else {
        mainWindow.webContents.send('validation-error', error);
      }
    });

    validadorInstance.on('completed', (results) => {
      mainWindow.webContents.send('validation-completed', results);
      
      // Limpiar badge del dock (solo macOS)
      if (process.platform === 'darwin' && app.dock) {
        app.dock.setBadge('');
      }

      // Mostrar notificación nativa
      try {
        if (Notification.isSupported()) {
          const notification = new Notification({
            title: 'Validación Completada',
            body: `Se validaron ${results.total} números. ${results.valid} válidos, ${results.invalid} inválidos.`,
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