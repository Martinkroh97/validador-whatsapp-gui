# 📱 Validador de WhatsApp - Código Fuente

Aplicación de escritorio desarrollada en Electron para validar números de WhatsApp de forma masiva y gestionar leads de manera automatizada.

## 🚀 Características Principales

### ✅ **Validación Masiva de WhatsApp**
- Valida automáticamente si los números tienen cuenta de WhatsApp activa
- Procesa múltiples hojas de Google Sheets simultáneamente
- Manejo inteligente de lotes para optimizar el rendimiento
- Detección automática de números duplicados

### 🔄 **Normalización Automática de Nombres**
- Elimina comillas y caracteres especiales problemáticos
- Corrige capitalización automáticamente
- Normaliza espacios múltiples
- Mejora la compatibilidad con integraciones (Make, Zapier, etc.)

### 📊 **Integración con Google Sheets**
- Conexión directa con Google Sheets API
- Actualización en tiempo real de resultados
- Soporte para múltiples hojas de cálculo
- Configuración flexible de columnas

### 🎯 **Gestión de Estados**
- Marca números válidos/inválidos automáticamente
- Gestiona estados personalizados (procesado, enviado, etc.)
- Control de duplicados con priorización por fecha
- Logs detallados de todo el proceso

## 📋 Requisitos de Desarrollo

### **Sistema**
- **Node.js**: v16.0.0 o superior
- **npm**: v7.0.0 o superior
- **Sistema Operativo**: Windows 10+, macOS 10.14+, o Ubuntu 18.04+
- **Memoria RAM**: Mínimo 4GB, recomendado 8GB
- **Conexión a internet**: Requerida para WhatsApp Web y Google Sheets

### **Navegadores soportados**
- Google Chrome
- Microsoft Edge
- Brave Browser
- Chromium

## 🛠 Instalación y Configuración

### 1. **Clonar el repositorio**
```bash
git clone https://github.com/tu-usuario/validador-whatsapp.git
cd validador-whatsapp
```

### 2. **Instalar dependencias**
```bash
npm install
```

### 3. **Configurar Google Sheets API**
1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Crea un nuevo proyecto o selecciona uno existente
3. Habilita la **Google Sheets API**
4. Ve a **Credenciales** → **Crear credenciales** → **Cuenta de servicio**
5. Completa los datos y descarga el archivo JSON
6. Renómbralo a `credenciales.json`
7. Colócalo en la carpeta que la app te indique al ejecutarse

### 4. **Ejecutar en modo desarrollo**
```bash
npm run dev
```

### 5. **Compilar para producción**
```bash
# Para tu plataforma actual
npm run build

# Para plataformas específicas
npm run build:win    # Windows
npm run build:mac    # macOS
npm run build:linux  # Linux
```

## 📁 Estructura del Proyecto

```
validador-whatsapp/
├── src/
│   ├── main/
│   │   ├── main.js              # Proceso principal de Electron
│   │   └── preload.js           # Script de preload
│   ├── core/
│   │   └── validator.js         # Lógica de validación de WhatsApp
│   └── renderer/
│       ├── index.html           # Interfaz principal
│       ├── renderer.js          # Lógica del frontend
│       └── styles.css           # Estilos de la aplicación
├── configs/                     # Archivos de configuración JSON
├── package.json                 # Dependencias y scripts
├── electron-builder.yml        # Configuración de compilación
└── README.md                   # Este archivo
```

## 🔧 Scripts Disponibles

```bash
# Desarrollo
npm run dev              # Ejecutar en modo desarrollo
npm run start           # Iniciar aplicación compilada

# Compilación
npm run build           # Compilar para la plataforma actual
npm run build:win       # Compilar para Windows
npm run build:mac       # Compilar para macOS
npm run build:linux     # Compilar para Linux
npm run build:all       # Compilar para todas las plataformas

# Utilidades
npm run clean           # Limpiar archivos temporales
npm run lint            # Verificar código con ESLint
npm run test            # Ejecutar tests (si están configurados)
```

## ⚙️ Configuración de Desarrollo

### **Variables de Entorno**
Crea un archivo `.env` en la raíz del proyecto:

```env
NODE_ENV=development
DEBUG=true
GOOGLE_SHEETS_SCOPES=https://www.googleapis.com/auth/spreadsheets
BATCH_SIZE=5
DELAY_BETWEEN_REQUESTS=1500
```

### **Configuración de Google Sheets**
Tu hoja de cálculo debe tener estas columnas (nombres configurables):

| Columna | Descripción | Requerida |
|---------|-------------|-----------|
| **WhatsApp** | Números de teléfono | ✅ |
| **Validación WA** | Resultado de validación | ✅ |
| **Estado** | Estado del lead | ❌ |
| **Nombre** | Nombre del lead | ❌ |
| **WhatsApp** | WhastApp (para detección de duplicados) | ❌ |

### **Archivo de Configuración**
Crea archivos JSON en la carpeta `configs/`:

```json
{
  "nombre": "Mi Empresa - Validación",
  "descripcion": "Validación de leads para campaña 2024",
  "principales": [
    {
      "spreadsheetId": "1ABC123-ID-DE-GOOGLE-SHEETS-XYZ",
      "sheetName": "Leads Enero",
      "range": "A1:Z",
      "columnas": {
        "whatsapp": "WhatsApp",
        "validacion": "Validación WA",
        "estado": "Estado",
        "nombre": "Nombre"
      }
    }
  ]
}
```

## 🏗 Arquitectura del Código

### **Proceso Principal (main.js)**
```javascript
// Maneja:
- Creación de ventanas de Electron
- Comunicación IPC con el renderer
- Gestión de archivos de configuración
- Validación de credenciales
```

### **Core de Validación (validator.js)**
```javascript
// Clase principal que maneja:
- Conexión con WhatsApp Web via puppeteer
- Validación masiva de números
- Normalización automática de nombres
- Detección de números duplicados
- Actualización de Google Sheets
```

### **Interfaz de Usuario (renderer.js)**
```javascript
// Controla:
- Interfaz gráfica y UX
- Creación visual de configuraciones
- Monitoreo en tiempo real
- Sistema de logs y notificaciones
```

## 🔄 Flujo de Validación

1. **Inicialización**
   ```javascript
   // validator.js - Constructor
   new ValidadorCore(configPath, baseDir, userDataPath)
   ```

2. **Conexión WhatsApp**
   ```javascript
   // Inicializar cliente WhatsApp Web
   await this.initializeWhatsApp()
   ```

3. **Procesamiento**
   ```javascript
   // Escanear → Duplicados → Validar → Normalizar
   await this.startValidationProcess()
   ```

4. **Normalización de Nombres**
   ```javascript
   // Función integrada en validarNumerosWhatsApp()
   const normalizedName = this.normalizeLeadName(originalName)
   ```

## 🧪 Testing y Debug

### **Modo Debug**
```bash
# Ejecutar con logs detallados
DEBUG=* npm run dev

# O establecer en el código
process.env.DEBUG = 'true'
```

### **Logs del Sistema**
Los logs se guardan en:
- **Windows**: `%APPDATA%/Validador WhatsApp/`
- **macOS**: `~/Library/Application Support/Validador WhatsApp/`
- **Linux**: `~/.config/Validador WhatsApp/`

### **Testing Manual**
1. Crea una hoja de Google Sheets de prueba
2. Agrega algunos números de prueba
3. Configura una configuración de test
4. Ejecuta validación con lote pequeño

## 🔧 Personalización y Extensions

### **Agregar Nuevas Funcionalidades**

1. **Nueva columna personalizada**:
```javascript
// En validator.js - función validarNumerosWhatsApp
const nuevaColName = columnas.nuevaColumna;
const nuevaIndex = headers.findIndex(h => h === nuevaColName);
```

2. **Modificar normalización**:
```javascript
// En validator.js - función normalizeLeadName
// Agregar nuevas reglas de limpieza
normalized = normalized.replace(/patrón/g, 'reemplazo');
```

3. **Nueva validación**:
```javascript
// Crear nueva función en validator.js
async nuevaValidacion(config) {
  // Tu lógica aquí
}
```

### **Modificar la Interfaz**

1. **Estilos CSS**:
```css
/* En styles.css */
.nueva-clase {
  /* Tus estilos */
}
```

2. **Nuevos componentes**:
```javascript
// En renderer.js
function nuevoComponente() {
  // Tu lógica de UI
}
```

## 📦 Dependencias Principales

```json
{
  "electron": "^28.0.0",
  "whatsapp-web.js": "^1.23.0",
  "googleapis": "^128.0.0",
  "puppeteer": "^21.0.0"
}
```

### **Dependencias de Desarrollo**
```json
{
  "electron-builder": "^24.6.0",
  "nodemon": "^3.0.0",
  "eslint": "^8.0.0"
}
```

## 🛠 Troubleshooting de Desarrollo

### **Problemas Comunes**

#### **Error de instalación de Puppeteer**
```bash
# Reinstalar puppeteer
npm install puppeteer --force

# O usar variable de entorno
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true npm install
```

#### **Problemas con Electron**
```bash
# Limpiar cache de Electron
npm run clean
rm -rf node_modules
npm install
```

#### **Error de permisos en macOS**
```bash
# Dar permisos a la app
sudo xattr -rd com.apple.quarantine dist/mac/Validador.app
```

#### **Debug de WhatsApp Web**
```javascript
// En validator.js - cambiar headless a false
puppeteer: {
  headless: false,  // Ver el navegador
  devtools: true    // Abrir DevTools
}
```

## 🔒 Consideraciones de Seguridad

### **Credenciales**
- ✅ Nunca commites `credenciales.json`
- ✅ Usa variables de entorno para datos sensibles
- ✅ Las credenciales se procesan localmente

### **WhatsApp**
- ✅ Usa WhatsApp Web oficial
- ✅ No almacena datos de WhatsApp
- ✅ Respeta términos de servicio de WhatsApp

### **Google Sheets**
- ✅ Conexión encriptada (HTTPS)
- ✅ Permisos mínimos necesarios
- ✅ No almacena datos de hojas localmente

## 🤝 Contribución

### **Setup para Contribuir**
1. Fork el repositorio
2. Crea una rama: `git checkout -b feature/nueva-funcionalidad`
3. Instala dependencias: `npm install`
4. Haz tus cambios
5. Ejecuta tests: `npm run lint`
6. Commit: `git commit -am 'Agregar nueva funcionalidad'`
7. Push: `git push origin feature/nueva-funcionalidad`
8. Abre un Pull Request

### **Guías de Contribución**
- Usa **ESLint** para mantener consistencia en el código
- Comenta funciones complejas
- Actualiza el README si agregas nuevas features
- Prueba en múltiples plataformas si es posible

### **Estructura de Commits**
```
tipo(scope): descripción corta

Descripción más detallada si es necesario

- Cambio 1
- Cambio 2
```

Tipos: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

## 📄 Licencia

Este proyecto es de libre uso.

## 💬 Soporte para Desarrolladores

### **Canales de Comunicación**
- 🐛 **Issues**: [GitHub Issues](../../issues)
- 💬 **Discusiones**: [GitHub Discussions](../../discussions)
- 📖 **Wiki**: [Documentación técnica](../../wiki)
- 📧 **Email**: [mkroh81@gmail.com](mailto:mkroh81@gmail.com)

### **Recursos Útiles**
- [Electron Documentation](https://electronjs.org/docs)
- [WhatsApp Web.js Guide](https://wwebjs.dev/)
- [Google Sheets API](https://developers.google.com/sheets/api)
- [Puppeteer Documentation](https://pptr.dev/)

---

## 🚀 Quick Start para Desarrolladores

```bash
# Clonar e instalar
git clone https://github.com/tu-usuario/validador-whatsapp.git
cd validador-whatsapp
npm install

# Configurar credenciales (ver sección de configuración)
# Colocar credenciales.json en la carpeta indicada

# Ejecutar en desarrollo
npm run dev

# Para producción
npm run build
```

---

**⭐ Si contribuyes al proyecto, no olvides darle una estrella en GitHub**

---

Desarrollado con Electron y Node.js