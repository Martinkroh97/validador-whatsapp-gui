# Validador WhatsApp GUI

Aplicación de escritorio para validar números de WhatsApp y gestionar duplicados en hojas de Google Sheets.

## 🚀 Características

- ✅ Validación automática de números de WhatsApp
- 📊 Integración con Google Sheets
- 🔍 Detección y manejo de duplicados
- 📱 Interfaz gráfica moderna y responsive
- 🔄 Soporte para múltiples configuraciones
- 📈 Progreso en tiempo real
- 📋 Logs detallados de actividad

## 📋 Requisitos

- Node.js 18+ 
- npm o yarn
- Google Chrome, Edge, Brave o Chromium instalado
- Archivo `credenciales.json` de Google Cloud Platform

## 🛠️ Instalación para Desarrollo

```bash
# Clonar repositorio
git clone https://github.com/tu-usuario/validador-whatsapp-gui.git
cd validador-whatsapp-gui

# Instalar dependencias
npm install

# Ejecutar en modo desarrollo
npm run dev
```

## 📦 Compilación

```bash
# Para macOS
npm run build:mac

# Para Windows
npm run build:win

# Para Linux
npm run build:linux

# Para todas las plataformas
npm run build
```

## ⚙️ Configuración

### 1. Credenciales de Google
Coloca tu archivo `credenciales.json` en:
- **macOS**: `~/Library/Application Support/Validador WhatsApp/`
- **Windows**: `%APPDATA%\Validador WhatsApp\`
- **Linux**: `~/.config/Validador WhatsApp/`

### 2. Archivos de Configuración
Crea archivos JSON en la carpeta `configs/` con la estructura:

```json
{
  "nombre": "Mi Configuración",
  "descripcion": "Descripción de la configuración",
  "principales": [
    {
      "spreadsheetId": "ID_DE_TU_HOJA",
      "sheetName": "Nombre de la Hoja",
      "columnas": {
        "whatsapp": "WhatsApp",
        "validacion": "Validación WA"
      }
    }
  ]
}
```

## 🔧 Desarrollo

### Scripts disponibles:
- `npm run dev` - Desarrollo con hot reload
- `npm run start` - Iniciar aplicación
- `npm run build` - Compilar para distribución
- `npm run clean` - Limpiar archivos temporales
- `npm run rebuild` - Recompilar módulos nativos

### Estructura del proyecto:
```
validador-whatsapp-gui/
├── src/
│   ├── main.js           # Proceso principal de Electron
│   ├── preload.js        # Script de preload
│   ├── core/
│   │   └── validator.js  # Lógica de validación
│   └── renderer/
│       ├── index.html    # Interfaz principal
│       ├── styles.css    # Estilos
│       └── renderer.js   # Lógica del frontend
├── build/                # Archivos de configuración de build
├── configs/              # Configuraciones de usuario
└── package.json
```

## 🔍 Troubleshooting

### Problema: QR no aparece
- Verifica que tengas Chrome/Edge/Brave instalado
- Revisa los logs en DevTools (F12)

### Problema: Error de credenciales
- Verifica que `credenciales.json` esté en la ubicación correcta
- Confirma que el archivo tenga los permisos adecuados

### Problema: Error al compilar
```bash
npm run clean
npm install
npm run rebuild
npm run build
```

## 🤝 Contribuir

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📞 Soporte

Si tienes problemas:
1. Abre un nuevo issue con detalles del problema
3. Incluye logs y capturas de pantalla si es posible