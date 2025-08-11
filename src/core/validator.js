const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { Client, LocalAuth } = require('whatsapp-web.js');

class ValidadorCore extends EventEmitter {
  constructor(configPath, baseDir, userDataPath = null) {
    super();

    this.configPath = configPath;
    this.baseDir = baseDir;
    this.userDataPath = userDataPath || process.cwd();
    this.CONFIG = null;
    this.client = null;
    this.isRunning = false;
    this.isPaused = false;

    // Mejorar detección de si estamos en producción
    this.isPackaged = process.pkg !== undefined || // pkg
                     (process.env.NODE_ENV === 'production') || // electron-builder
                     (process.argv[0].includes('Electron') && !process.argv[0].includes('node_modules')) || // electron app
                     !process.argv[0].includes('node'); // no es node directo

    // Configuración de rutas - Usando carpeta de datos del usuario
    const appDataPath = this.userDataPath;

    // Las credenciales irán en: ~/Library/Application Support/Validador WhatsApp/
    this.CREDENTIALS_PATH = path.join(appDataPath, 'credenciales.json');
    this.DUPLICADOS_LOG_PATH = path.join(appDataPath, 'duplicados_log.txt');
    this.APP_DATA_PATH = appDataPath;

    // Configuración de Google Sheets
    this.SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
    this.BATCH_SIZE = 5;

    // Estado de validación
    this.validationData = {
      total: 0,
      completed: 0,
      valid: 0,
      invalid: 0,
      duplicates: 0,
      errors: 0
    };

    this.hojasParsed = [];
    this.hojaNumeros = []; // *** CAMBIO: de hojaEmails a hojaNumeros ***

    // *** IMPORTANTE: Declarar hojaPrioridad aquí ***
    this.hojaPrioridad = {};

    this.emit('log', {
      type: 'info',
      message: `Iniciando ValidadorCore - Modo: ${this.isPackaged ? 'Producción' : 'Desarrollo'}`,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * *** NUEVA FUNCIÓN: Normaliza nombres de leads eliminando caracteres problemáticos ***
   */
  normalizeLeadName(name) {
    if (!name || typeof name !== 'string') {
      return name;
    }

    // Convertir a string y trim espacios
    let normalized = name.toString().trim();

    // Eliminar comillas simples y dobles
    normalized = normalized.replace(/['"]/g, '');

    // Eliminar otros caracteres especiales problemáticos
    normalized = normalized.replace(/[`´""„«»]/g, '');

    // Eliminar caracteres de control ASCII (no imprimibles)
    normalized = normalized.replace(/[\x00-\x1F\x7F-\x9F]/g, '');

    // Normalizar espacios múltiples a uno solo
    normalized = normalized.replace(/\s+/g, ' ');

    // Trim final
    normalized = normalized.trim();

    return normalized;
  }

  // Función mejorada para detectar navegadores
  async getChromiumPath() {
    const navegadores = [];
    
    // Detectar sistema operativo y configurar rutas apropiadas
    if (process.platform === 'darwin') { // macOS
      navegadores.push(
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
        '/Applications/Opera.app/Contents/MacOS/Opera',
        '/Applications/Arc.app/Contents/MacOS/Arc'
      );
    } else if (process.platform === 'win32') { // Windows
      navegadores.push(
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
        'C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe'
      );
    } else { // Linux
      navegadores.push(
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
        '/usr/bin/microsoft-edge',
        '/usr/bin/brave-browser',
        '/snap/bin/chromium'
      );
    }

    // Agregar puppeteer bundled si existe
    if (!this.isPackaged) {
      const puppeteerChrome = path.join(this.baseDir, 'node_modules/puppeteer/.local-chromium');
      if (fs.existsSync(puppeteerChrome)) {
        // Buscar el directorio de chrome en puppeteer
        try {
          const dirs = fs.readdirSync(puppeteerChrome);
          for (const dir of dirs) {
            if (process.platform === 'darwin') {
              const chromePath = path.join(puppeteerChrome, dir, 'chrome-mac/Chromium.app/Contents/MacOS/Chromium');
              if (fs.existsSync(chromePath)) {
                navegadores.unshift(chromePath);
              }
            } else if (process.platform === 'win32') {
              const chromePath = path.join(puppeteerChrome, dir, 'chrome-win/chrome.exe');
              if (fs.existsSync(chromePath)) {
                navegadores.unshift(chromePath);
              }
            } else {
              const chromePath = path.join(puppeteerChrome, dir, 'chrome-linux/chrome');
              if (fs.existsSync(chromePath)) {
                navegadores.unshift(chromePath);
              }
            }
          }
        } catch (err) {
          // Ignorar errores al leer directorio de puppeteer
        }
      }
    }

    this.emit('log', {
      type: 'info',
      message: `Buscando navegadores en ${navegadores.length} ubicaciones...`,
      timestamp: new Date().toISOString()
    });

    // Buscar navegador disponible
    for (const navegador of navegadores) {
      try {
        if (fs.existsSync(navegador)) {
          // Verificar que el archivo es ejecutable
          try {
            fs.accessSync(navegador, fs.constants.F_OK | fs.constants.X_OK);
            const nombreNavegador = path.basename(navegador);
            this.emit('log', {
              type: 'success',
              message: `Navegador encontrado: ${nombreNavegador} en ${navegador}`,
              timestamp: new Date().toISOString()
            });
            return navegador;
          } catch (accessError) {
            this.emit('log', {
              type: 'warning',
              message: `Navegador encontrado pero no ejecutable: ${navegador}`,
              timestamp: new Date().toISOString()
            });
          }
        }
      } catch (err) {
        // Ignorar errores de acceso a archivos
      }
    }

    // Si no encontramos navegador, intentar usar puppeteer
    if (!this.isPackaged) {
      try {
        this.emit('log', {
          type: 'info',
          message: 'Intentando usar navegador de Puppeteer...',
          timestamp: new Date().toISOString()
        });
        
        // Permitir que puppeteer descargue su propio navegador si es necesario
        return null; // Esto hará que puppeteer use su navegador por defecto
      } catch (err) {
        this.emit('log', {
          type: 'warning',
          message: `No se pudo usar navegador de Puppeteer: ${err.message}`,
          timestamp: new Date().toISOString()
        });
      }
    }

    const error = `
❌ No se encontró ningún navegador compatible.

Por favor instala uno de estos navegadores:
• Google Chrome: https://chrome.google.com
• Microsoft Edge: https://microsoft.com/edge  
• Brave Browser: https://brave.com
• Opera: https://opera.com
• Chromium: https://chromium.org

Una vez instalado, reinicia la aplicación.
    `;
    this.emit('log', {
      type: 'error',
      message: error.trim(),
      timestamp: new Date().toISOString()
    });
    throw new Error(error.trim());
  }

  async start() {
    try {
      this.isRunning = true;
      this.isPaused = false;

      // Verificar que credenciales.json existe
      if (!fs.existsSync(this.CREDENTIALS_PATH)) {
        const error = new Error('CREDENTIALS_NOT_FOUND');
        error.details = {
          message: `No se encontró credenciales.json. Por favor, coloca el archivo en:\n${this.APP_DATA_PATH}`,
          path: this.APP_DATA_PATH,
          isPackaged: this.isPackaged
        };
        throw error;
      }

      // Cargar configuración
      this.CONFIG = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
      this.emit('log', {
        type: 'info',
        message: `Iniciando validación con configuración: ${this.CONFIG.nombre}`,
        timestamp: new Date().toISOString()
      });

      this.emit('log', {
        type: 'info',
        message: `Usando credenciales: ${this.CREDENTIALS_PATH}`,
        timestamp: new Date().toISOString()
      });

      // *** CONSTRUIR PRIORIDAD DE HOJAS AQUÍ, ANTES DE WHATSAPP ***
      this.CONFIG.principales.forEach((hoja, index) => {
        this.hojaPrioridad[hoja.spreadsheetId] = index;
      });

      // Limpiar log de duplicados
      fs.writeFileSync(this.DUPLICADOS_LOG_PATH, '');

      // Inicializar WhatsApp
      await this.initializeWhatsApp();

    } catch (error) {
      this.emit('error', error);
      this.isRunning = false;
    }
  }

  async initializeWhatsApp() {
    const chromiumPath = await this.getChromiumPath();

    this.emit('log', {
      type: 'info',
      message: `Inicializando WhatsApp Web...${chromiumPath ? ` con: ${path.basename(chromiumPath)}` : ' con navegador por defecto'}`,
      timestamp: new Date().toISOString()
    });

    // Configurar ruta de datos de WhatsApp
    const whatsappDataPath = path.join(this.APP_DATA_PATH, 'wwebjs_auth');

    // Asegurarse que la carpeta de sesión existe
    try {
      if (!fs.existsSync(whatsappDataPath)) {
        fs.mkdirSync(whatsappDataPath, { recursive: true });
        this.emit('log', {
          type: 'info',
          message: `Carpeta de sesión creada: ${whatsappDataPath}`,
          timestamp: new Date().toISOString()
        });
      }
    } catch (err) {
      this.emit('log', {
        type: 'error',
        message: `No se pudo crear la carpeta de sesión: ${whatsappDataPath} (${err.message})`,
        timestamp: new Date().toISOString()
      });
      throw err;
    }

    // Configurar argumentos de Puppeteer según el entorno
    let puppeteerArgs = [
      '--disable-dev-shm-usage',
      '--disable-web-security', 
      '--disable-features=VizDisplayCompositor',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-extensions',
      '--disable-plugins',
      '--disable-default-apps',
      '--no-first-run',
      '--disable-blink-features=AutomationControlled'
    ];

    // En producción, usar más flags de seguridad
    if (this.isPackaged) {
      puppeteerArgs.push(
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-software-rasterizer'
      );
    } else {
      puppeteerArgs.push('--no-sandbox', '--disable-setuid-sandbox');
    }

    const puppeteerConfig = {
      headless: true,
      args: puppeteerArgs,
      ignoreDefaultArgs: ['--disable-extensions'],
      handleSIGINT: false,
      handleSIGTERM: false,
      handleSIGHUP: false
    };

    // Solo establecer executablePath si encontramos un navegador específico
    if (chromiumPath) {
      puppeteerConfig.executablePath = chromiumPath;
    }

    this.client = new Client({
      authStrategy: new LocalAuth({
        dataPath: whatsappDataPath,
        clientId: 'validador-whatsapp'
      }),
      puppeteer: puppeteerConfig,
      webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
      }
    });

    // Configurar timeouts más largos
    this.client.options.authTimeoutMs = 60000; // 60 segundos para auth
    this.client.options.takeoverTimeoutMs = 120000; // 120 segundos para takeover

    // Event listeners con mejor manejo de errores
    this.client.on('qr', (qr) => {
      this.emit('qr', qr);
      this.emit('log', {
        type: 'info',
        message: 'Código QR generado. Escanea con WhatsApp.',
        timestamp: new Date().toISOString()
      });
    });

    this.client.on('authenticated', () => {
      this.emit('authenticated');
      this.emit('log', {
        type: 'success',
        message: 'WhatsApp autenticado exitosamente',
        timestamp: new Date().toISOString()
      });
    });

    this.client.on('auth_failure', (msg) => {
      this.emit('log', {
        type: 'error',
        message: `Error de autenticación: ${msg}`,
        timestamp: new Date().toISOString()
      });
      this.emit('error', new Error(`Error de autenticación: ${msg}`));
    });

    this.client.on('ready', async () => {
      this.emit('ready');
      this.emit('log', {
        type: 'success',
        message: 'WhatsApp conectado y listo',
        timestamp: new Date().toISOString()
      });
      await this.startValidationProcess();
    });

    this.client.on('disconnected', (reason) => {
      this.emit('log', {
        type: 'warning',
        message: `WhatsApp desconectado: ${reason}`,
        timestamp: new Date().toISOString()
      });
      if (this.isRunning) {
        this.emit('error', new Error(`WhatsApp desconectado: ${reason}`));
      }
    });

    this.client.on('loading_screen', (percent, message) => {
      this.emit('log', {
        type: 'info',
        message: `Cargando WhatsApp: ${percent}% - ${message}`,
        timestamp: new Date().toISOString()
      });
    });

    // Inicializar cliente con timeout y retry
    try {
      this.emit('log', {
        type: 'info',
        message: 'Iniciando cliente de WhatsApp...',
        timestamp: new Date().toISOString()
      });

      await this.client.initialize();
    } catch (error) {
      this.emit('log', {
        type: 'error',
        message: `Error inicializando WhatsApp: ${error.message}`,
        timestamp: new Date().toISOString()
      });
      
      // Intentar reinicializar una vez más con configuración más permisiva
      if (!this.retryAttempted) {
        this.retryAttempted = true;
        this.emit('log', {
          type: 'info',
          message: 'Reintentando inicialización con configuración alternativa...',
          timestamp: new Date().toISOString()
        });
        
        await this.cleanup();
        await this.sleep(3000);
        await this.initializeWhatsApp();
        return;
      }
      
      this.emit('error', error);
      throw error;
    }
  }
  
  // *** FUNCIÓN MODIFICADA: startValidationProcess para procesar números en vez de emails ***
  async startValidationProcess() {
    try {
      this.emit('log', {
        type: 'info',
        message: 'Iniciando proceso de validación...',
        timestamp: new Date().toISOString()
      });

      // Fase 1: Escanear todas las hojas
      this.emit('log', {
        type: 'info',
        message: 'Fase 1: Escaneando hojas de cálculo...',
        timestamp: new Date().toISOString()
      });

      for (const hoja of this.CONFIG.principales) {
        if (!this.isRunning || this.isPaused) return;
        const data = await this.escanearHoja(hoja);
        this.hojasParsed.push({ ...hoja, data });

        // *** MODIFICADO: Procesar números de WhatsApp para detección de duplicados ***
        const columnas = hoja.columnas || {};
        const whatsappColName = columnas.whatsapp;
        
        for (const row of data) {
          const numeroRaw = row[whatsappColName]?.toString().trim();
          const numeroNormalizado = this.normalizarNumero(numeroRaw);
          const fecha = row['Fecha'] ? new Date(row['Fecha']) : null;
          
          // Solo procesar si el número es válido
          if (!numeroNormalizado) continue;
          
          this.hojaNumeros.push({
            spreadsheetId: hoja.spreadsheetId,
            sheetName: hoja.sheetName,
            numero: numeroNormalizado, // *** CAMBIO: numero en vez de email ***
            rowIndex: row.__rowIndex,
            fecha,
          });
        }

        this.emit('log', {
          type: 'success',
          message: `Hoja escaneada: ${hoja.sheetName} (${data.length} filas)`,
          timestamp: new Date().toISOString()
        });
      }

      // Fase 2: Marcar duplicados
      this.emit('log', {
        type: 'info',
        message: 'Fase 2: Detectando y marcando duplicados por número de WhatsApp...',
        timestamp: new Date().toISOString()
      });

      for (const hoja of this.hojasParsed) {
        if (!this.isRunning || this.isPaused) return;
        await this.marcarDuplicados(hoja, this.hojaNumeros, this.hojaPrioridad); // *** CAMBIO: hojaNumeros ***
      }

      // Fase 3: Validar números de WhatsApp
      this.emit('log', {
        type: 'info',
        message: 'Fase 3: Validando números de WhatsApp...',
        timestamp: new Date().toISOString()
      });

      // Calcular total de números a validar
      let totalNumbers = 0;
      for (const hoja of this.hojasParsed) {
        const columnas = hoja.columnas || {};
        const validacionColName = columnas.validacion;
        if (validacionColName) {
          const pendientes = hoja.data.filter(row => {
            const estado = row[validacionColName]?.trim().toLowerCase();
            return !['si', 'sí', 'no', 'duplicado', 'enviado'].includes(estado);
          });
          totalNumbers += pendientes.length;
        }
      }
      this.validationData.total = totalNumbers;
      this.emit('progress', { ...this.validationData });

      // Validar cada hoja
      for (const hoja of this.hojasParsed) {
        if (!this.isRunning || this.isPaused) return;
        await this.validarNumerosWhatsApp(hoja);
      }
      
      // Completado
      this.emit('log', {
        type: 'success',
        message: 'Validación completada exitosamente',
        timestamp: new Date().toISOString()
      });
      
      this.emit('completed', {
        total: this.validationData.total,
        valid: this.validationData.valid,
        invalid: this.validationData.invalid,
        duplicates: this.validationData.duplicates,
        errors: this.validationData.errors
      });
      
      this.isRunning = false;
      
      // *** Cierra el cliente automáticamente al finalizar ***
      await this.stop();

    } catch (error) {
      this.emit('error', error);
      this.isRunning = false;
      // *** También cierra el cliente si ocurre un error ***
      await this.stop();
    }
  }
  
  async escanearHoja(config) {
    const authClient = await this.getAuth();
    const sheets = google.sheets({ version: 'v4', auth: authClient });
    
    try {
      // *** Agregar retry para el error de visibility check ***
      let retries = 3;
      let lastError;
      
      while (retries > 0) {
        try {
          const res = await sheets.spreadsheets.values.get({
            spreadsheetId: config.spreadsheetId,
            range: `${config.sheetName}`,
            majorDimension: "ROWS",
          });
          
          const rows = res.data.values;
          if (!rows || rows.length < 2) return [];
          
          const headers = rows[0];
          const dataRows = rows.slice(1);
          
          return dataRows.map((row, i) => {
            const obj = {};
            headers.forEach((h, j) => obj[h.trim()] = row[j] !== undefined ? row[j] : '');
            obj.__rowIndex = i + 2;
            return obj;
          });
          
        } catch (error) {
          lastError = error;
          retries--;
          
          const errorMsg = error.message || error.toString();
          if (errorMsg.includes('Visibility check was unavailable') && retries > 0) {
            this.emit('log', {
              type: 'warning',
              message: `Error temporal en hoja ${config.sheetName}, reintentando... (${retries} intentos restantes)`,
              timestamp: new Date().toISOString()
            });
            
            // Esperar antes del siguiente intento
            await this.sleep(5000);
            
            // Renovar auth client para el siguiente intento
            authClient = await this.getAuth();
            sheets = google.sheets({ version: 'v4', auth: authClient });
            continue;
          }
          
          // Si no es un error de visibility o no quedan reintentos, lanzar el error
          throw error;
        }
      }
      
      // Si llegamos aquí, se agotaron los reintentos
      throw lastError;
      
    } catch (error) {
      this.emit('log', {
        type: 'error',
        message: `Error escaneando hoja ${config.sheetName}: ${error.message}`,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }
  
  // *** FUNCIÓN COMPLETAMENTE REESCRITA: marcarDuplicados por número de WhatsApp ***
  async marcarDuplicados(config, hojaNumeros, hojaPrioridad) {
    const headers = Object.keys(config.data[0] || {});
    const validacionIndex = headers.findIndex(h => h === (config.columnas?.validacion || 'Validación WA'));
    const estadoIndex = headers.findIndex(h => h === (config.columnas?.estado || 'Estado'));
    const whatsappIndex = headers.findIndex(h => h === (config.columnas?.whatsapp || 'WhatsApp'));
    
    if (validacionIndex === -1 || whatsappIndex === -1) {
      this.emit('log', {
        type: 'warning',
        message: `Columnas faltantes en hoja: ${config.sheetName}`,
        timestamp: new Date().toISOString()
      });
      return;
    }
    
    const valCol = this.indexToColumnLetter(validacionIndex);
    const estadoCol = estadoIndex !== -1 ? this.indexToColumnLetter(estadoIndex) : null;
    const whatsappColName = config.columnas?.whatsapp || 'WhatsApp';
    let duplicatesCount = 0;
    
    for (const row of config.data) {
      if (!this.isRunning || this.isPaused) return;
      
      const rowNumber = row.__rowIndex;
      const numeroRaw = row[whatsappColName]?.toString().trim();
      const numeroNormalizado = this.normalizarNumero(numeroRaw);
      const estado = row[config.columnas?.validacion || 'Validación WA']?.trim().toLowerCase();
      
      // Saltar si no hay número válido o ya está procesado
      if (!numeroNormalizado || estado) continue;
      
      // *** CAMBIO PRINCIPAL: Buscar ocurrencias por número normalizado ***
      const ocurrencias = hojaNumeros.filter(n => n.numero === numeroNormalizado);
      
      if (ocurrencias.length > 1) {
        // Ordenar ocurrencias por prioridad (fecha primero, luego hoja, luego fila)
        const ordenadas = ocurrencias.sort((a, b) => {
          // 1. Priorizar por fecha (más antigua primero)
          if (a.fecha && b.fecha) return a.fecha - b.fecha;
          if (b.fecha) return 1; // b tiene fecha, a no -> b es primero
          if (a.fecha) return -1; // a tiene fecha, b no -> a es primero
          
          // 2. Priorizar por orden de hojas en configuración
          const pa = hojaPrioridad[a.spreadsheetId] ?? 999;
          const pb = hojaPrioridad[b.spreadsheetId] ?? 999;
          if (pa !== pb) return pa - pb;
          
          // 3. Por último, por número de fila
          return a.rowIndex - b.rowIndex;
        });
        
        // Verificar si esta fila es la primera ocurrencia (la que se mantiene)
        const actualEsPrimero = ordenadas[0]?.spreadsheetId === config.spreadsheetId && 
                                ordenadas[0].rowIndex === rowNumber;
        
        if (!actualEsPrimero) {
          duplicatesCount++;
          this.validationData.duplicates++;
          
          // *** CAMBIO: Log mejorado mostrando el número duplicado ***
          const logMsg = `Duplicado: ${numeroNormalizado} en ${config.sheetName} fila ${rowNumber}`;
          this.emit('log', {
            type: 'warning',
            message: logMsg,
            timestamp: new Date().toISOString()
          });
          
          fs.appendFileSync(this.DUPLICADOS_LOG_PATH, logMsg + '\n');
          
          // Actualizar columna de validación
          await this.updateSheet(config.spreadsheetId, `${config.sheetName}!${valCol}${rowNumber}`, 'duplicado');
          
          // Actualizar columna de estado si existe
          if (estadoCol) {
            await this.updateSheet(config.spreadsheetId, `${config.sheetName}!${estadoCol}${rowNumber}`, 'Inválido');
          }
          
          await this.sleep(1500);
        }
      }
    }
    
    if (duplicatesCount > 0) {
      this.emit('log', {
        type: 'info', 
        message: `${duplicatesCount} duplicados encontrados por número de WhatsApp en ${config.sheetName}`,
        timestamp: new Date().toISOString()
      });
      this.emit('progress', { ...this.validationData });
    }
  }
  
  /**
   * *** FUNCIÓN COMPLETAMENTE REEMPLAZADA: validarNumerosWhatsApp con normalización de nombres integrada ***
   */
  async validarNumerosWhatsApp(config) {
    const columnas = config.columnas || {};
    const whatsappColName = columnas.whatsapp;
    const validacionColName = columnas.validacion;
    const estadoColName = columnas.estado;
    const nombreColName = columnas.nombre; // *** NUEVA LÍNEA ***
    
    const headers = Object.keys(config.data[0] || {});
    const whatsappIndex = headers.findIndex(h => h === whatsappColName);
    const validacionIndex = headers.findIndex(h => h === validacionColName);
    const estadoIndex = headers.findIndex(h => h === estadoColName);
    const nombreIndex = headers.findIndex(h => h === nombreColName); // *** NUEVA LÍNEA ***
    
    if ([whatsappIndex, validacionIndex].includes(-1)) {
      this.emit('log', {
        type: 'warning',
        message: `Columnas faltantes en hoja: ${config.sheetName}`,
        timestamp: new Date().toISOString()
      });
      return;
    }
    
    const valCol = this.indexToColumnLetter(validacionIndex);
    const estadoCol = estadoIndex !== -1 ? this.indexToColumnLetter(estadoIndex) : null;
    const nombreCol = nombreIndex !== -1 ? this.indexToColumnLetter(nombreIndex) : null; // *** NUEVA LÍNEA ***
    
    const pendientes = config.data.filter(row => {
      const estado = row[validacionColName]?.trim().toLowerCase();
      return !['si', 'sí', 'no', 'duplicado', 'enviado'].includes(estado);
    });
    
    // *** MODIFICAR LOG para incluir info sobre normalización ***
    let logMessage = `Validando ${pendientes.length} números en hoja: ${config.sheetName}`;
    if (nombreCol) {
      logMessage += ` (incluye normalización de nombres)`;
    }
    
    this.emit('log', {
      type: 'info',
      message: logMessage,
      timestamp: new Date().toISOString()
    });
    
    for (let i = 0; i < pendientes.length; i += this.BATCH_SIZE) {
      if (!this.isRunning || this.isPaused) return;
      
      const batch = pendientes.slice(i, i + this.BATCH_SIZE);
      
      for (const row of batch) {
        if (!this.isRunning || this.isPaused) return;
        
        const rowNumber = row.__rowIndex;
        const number = this.normalizarNumero(row[whatsappColName]);
        
        // *** NUEVA LÓGICA: Normalizar nombre si la columna existe ***
        let needsNameUpdate = false;
        let normalizedName = null;
        
        if (nombreCol && row[nombreColName]) {
          const originalName = row[nombreColName];
          normalizedName = this.normalizeLeadName(originalName);
          needsNameUpdate = (originalName !== normalizedName);
        }
        
        // Emitir progreso del número actual
        this.emit('progress', {
          ...this.validationData,
          currentNumber: number || 'Número inválido',
          currentStatus: 'Validando...'
        });
        
        try {
          // Verificar estado actual en la hoja
          const checkRes = await this.checkCurrentStatus(config.spreadsheetId, config.sheetName, valCol, rowNumber);
          const estadoActual = checkRes?.trim().toLowerCase() || '';
          
          if (['si', 'sí', 'no', 'duplicado', 'enviado'].includes(estadoActual)) {
            this.emit('log', {
              type: 'info',
              message: `Fila ${rowNumber} ya procesada (${estadoActual})`,
              timestamp: new Date().toISOString()
            });
            
            // *** NUEVA LÓGICA: Aún normalizar el nombre si es necesario ***
            if (needsNameUpdate) {
              try {
                await this.updateSheet(config.spreadsheetId, `${config.sheetName}!${nombreCol}${rowNumber}`, normalizedName);
                this.emit('log', {
                  type: 'success', 
                  message: `Nombre normalizado en fila ${rowNumber}: "${row[nombreColName]}" → "${normalizedName}"`,
                  timestamp: new Date().toISOString()
                });
              } catch (nameError) {
                this.emit('log', {
                  type: 'warning',
                  message: `Error normalizando nombre en fila ${rowNumber}: ${nameError.message}`,
                  timestamp: new Date().toISOString()
                });
              }
              // Pequeño delay adicional después de actualizar nombre
              await this.sleep(500);
            }
            
            continue;
          }
          
          // Manejo de números inválidos
          if (!number) {
            // Actualizar columna de validación
            await this.updateSheet(config.spreadsheetId, `${config.sheetName}!${valCol}${rowNumber}`, 'no');
            
            // Actualizar columna de estado si existe
            if (estadoCol) {
              await this.updateSheet(config.spreadsheetId, `${config.sheetName}!${estadoCol}${rowNumber}`, 'Inválido');
            }
            
            // *** NUEVA LÓGICA: Normalizar nombre incluso si el número es inválido ***
            if (needsNameUpdate) {
              await this.updateSheet(config.spreadsheetId, `${config.sheetName}!${nombreCol}${rowNumber}`, normalizedName);
              this.emit('log', {
                type: 'success',
                message: `Nombre normalizado en fila ${rowNumber}: "${row[nombreColName]}" → "${normalizedName}"`,
                timestamp: new Date().toISOString()
              });
            }
            
            this.validationData.invalid++;
            this.validationData.completed++;
            
            this.emit('log', {
              type: 'warning',
              message: `Número inválido en fila ${rowNumber}`,
              timestamp: new Date().toISOString()
            });
          } else {
            // Validar número de WhatsApp
            const whatsappId = `${number}@c.us`;
            const exists = await this.client.isRegisteredUser(whatsappId);
            const status = exists ? 'si' : 'no';
            
            // Actualizar columna de validación
            await this.updateSheet(config.spreadsheetId, `${config.sheetName}!${valCol}${rowNumber}`, status);
            
            // Actualizar columna de estado para números "no"
            if (!exists && estadoCol) {
              await this.updateSheet(config.spreadsheetId, `${config.sheetName}!${estadoCol}${rowNumber}`, 'Inválido');
            }
            
            // *** NUEVA LÓGICA: Normalizar nombre junto con la validación ***
            if (needsNameUpdate) {
              await this.updateSheet(config.spreadsheetId, `${config.sheetName}!${nombreCol}${rowNumber}`, normalizedName);
              this.emit('log', {
                type: 'success',
                message: `Nombre normalizado en fila ${rowNumber}: "${row[nombreColName]}" → "${normalizedName}"`,
                timestamp: new Date().toISOString()
              });
            }
            
            if (exists) {
              this.validationData.valid++;
            } else {
              this.validationData.invalid++;
            }
            this.validationData.completed++;
            
            // *** MODIFICAR LOG para incluir info de normalización si aplica ***
            let logMsg = `${number}: ${exists ? 'Válido' : 'No registrado'}`;
            if (needsNameUpdate) {
              logMsg += ` | Nombre normalizado`;
            }
            
            this.emit('log', {
              type: exists ? 'success' : 'info',
              message: logMsg,
              timestamp: new Date().toISOString()
            });
          }
          
          this.emit('progress', { ...this.validationData });
          await this.sleep(1500); // Delay estándar
          
        } catch (error) {
          this.validationData.errors = (this.validationData.errors || 0) + 1;
          this.emit('log', {
            type: 'error',
            message: `Error validando ${number}: ${error.message}`,
            timestamp: new Date().toISOString()
          });
          await this.sleep(5000); // Esperar más tiempo en caso de error
        }
      }
    }
  }
  
  async checkCurrentStatus(sheetId, sheetName, column, row) {
    try {
      const authClient = await this.getAuth();
      const sheets = google.sheets({ version: 'v4', auth: authClient });
      
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: `${sheetName}!${column}${row}`,
      });
      
      return res.data.values?.[0]?.[0] || '';
    } catch (error) {
      return '';
    }
  }
  
  async updateSheet(sheetId, range, value, retries = 3) {
    const authClient = await this.getAuth();
    const sheets = google.sheets({ version: 'v4', auth: authClient });
    
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        await sheets.spreadsheets.values.update({
          spreadsheetId: sheetId,
          range: range,
          valueInputOption: 'RAW',
          resource: { values: [[value]] },
        });
        return;
      } catch (error) {
        const mensaje = error?.errors?.[0]?.reason || error.message;
        if (mensaje === 'rateLimitExceeded' || mensaje === 'userRateLimitExceeded') {
          await this.sleep(3000);
        } else {
          throw error;
        }
      }
    }
    throw new Error(`Falló la escritura en ${range} tras múltiples intentos.`);
  }
  
  async getAuth() {
    const auth = new google.auth.GoogleAuth({
      keyFile: this.CREDENTIALS_PATH,
      scopes: this.SCOPES,
    });
    return auth.getClient();
  }
  
  // *** FUNCIÓN MEJORADA: normalizarNumero con validación más estricta ***
  normalizarNumero(number) {
    // Si no hay número o es vacío, retornar cadena vacía
    if (!number || typeof number !== 'string') {
      // Convertir a string si es número
      if (typeof number === 'number') {
        number = number.toString();
      } else {
        return '';
      }
    }
    
    // Limpiar el número (solo dígitos)
    let normalized = number.toString().replace(/\D/g, '');
    
    // Si el número limpio está vacío, retornar vacío
    if (!normalized) return '';
    
    // *** VALIDACIÓN MEJORADA: Verificar longitud y formato ***
    // Si tiene menos de 8 dígitos (muy corto para ser un número válido), retornar vacío
    if (normalized.length < 8) return '';
    
    // Si ya empieza con 54 (código de Argentina), verificar longitud total
    if (normalized.startsWith('54')) {
      // Debe tener entre 12 y 15 dígitos para ser válido con código de país
      if (normalized.length >= 12 && normalized.length <= 15) {
        return normalized;
      } else {
        return ''; // Longitud incorrecta
      }
    }
    
    // Si tiene exactamente 10 dígitos, agregar 54
    if (normalized.length === 10) {
      return '54' + normalized;
    }
    
    // Si tiene 11 dígitos y empieza con 1, podría ser formato 1XXXXXXXXX, agregar 54
    if (normalized.length === 11 && normalized.startsWith('1')) {
      return '54' + normalized;
    }
    
    // *** NUEVA VALIDACIÓN: Para números de 8-9 dígitos, agregar 54 + código de área ***
    if (normalized.length >= 8 && normalized.length <= 9) {
      // Asumir que necesita código de área 11 (Buenos Aires) si es muy corto
      const withAreaCode = '54' + '11' + normalized;
      return withAreaCode;
    }
    
    // Para cualquier otro caso que no sea válido, retornar vacío
    return '';
  }
  
  indexToColumnLetter(index) {
    let letter = '';
    while (index >= 0) {
      letter = String.fromCharCode((index % 26) + 65) + letter;
      index = Math.floor(index / 26) - 1;
    }
    return letter;
  }
  
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  async pause() {
    this.isPaused = true;
    this.emit('log', {
      type: 'warning',
      message: 'Validación pausada',
      timestamp: new Date().toISOString()
    });
  }
  
  async stop() {
    this.isRunning = false;
    this.isPaused = false;
    
    if (this.client) {
      try {
        await this.client.destroy();
        this.client = null;
        this.emit('log', {
          type: 'info',
          message: 'Cliente WhatsApp cerrado correctamente',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.emit('log', {
          type: 'warning',
          message: `Error cerrando cliente: ${error.message}`,
          timestamp: new Date().toISOString()
        });
      }
    }
    
    this.emit('log', {
      type: 'warning',
      message: 'Validación detenida',
      timestamp: new Date().toISOString()
    });
  }
  
  async cleanup() {
    await this.stop();
  }
  
  getStatus() {
    return {
      status: this.isRunning ? (this.isPaused ? 'paused' : 'running') : 'inactive',
      data: this.validationData
    };
  }
}

module.exports = ValidadorCore;