# 📊 Reverificación de Inventario por Zonas

Aplicación PWA (Progressive Web App) para reverificación de inventario por zonas de responsabilidad con almacenamiento en Supabase y sincronización en tiempo real.

---

## 🎯 Características Principales

- ✅ **Gestión de Zonas**: Crear, editar y eliminar zonas de responsabilidad
- ✅ **Reverificación de Artículos**: Verificar y registrar artículos dentro de cada zona
- ✅ **Planes de Acción**: Crear planes de acción por artículo con fechas
- ✅ **Novedades/Tareas**: Registrar observaciones y tareas pendientes
- ✅ **Almacenamiento en la Nube**: Sincronización con Supabase
- ✅ **Funcionamiento Offline**: Service Worker para uso sin conexión
- ✅ **Importar/Exportar**: Respaldar y restaurar datos en archivo JSON
- ✅ **Modo Oscuro/Claro**: Tema adaptable a preferencias del usuario
- ✅ **Interfaz Responsiva**: Optimizada para móvil, tablet y escritorio
- ✅ **Instalable**: Se puede instalar como aplicación nativa

---

## 📁 Estructura del Proyecto

```
inventory-reverification-pwa/
├── index.html                 # HTML principal con meta tags PWA
├── manifest.json             # Configuración PWA (nombre, iconos, colores)
├── sw.js                     # Service Worker (cache, offline)
│
├── css/
│   └── style.css            # Estilos CSS (variables, componentes, temas)
│
├── js/
│   ├── supabase.js          # Inicialización cliente Supabase
│   ├── data.js              # Lógica de datos y modelos (InventoryData)
│   ├── storage.js           # Capa persistencia Supabase (InventoryStorage)
│   ├── ui.js                # Componentes UI y DOM (InventoryUI)
│   └── app.js               # Controlador principal y orquestación
│
└── README.md               # Este archivo
```

---

## 🗄️ Base de Datos: Supabase

### Tablas Actuales

#### 1. **zones** (Zonas de Responsabilidad)
```sql
CREATE TABLE zones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Campos:**
- `id`: UUID única de la zona
- `name`: Nombre/descripción de la zona
- `created_at`: Fecha de creación

---

#### 2. **articles** (Artículos)
```sql
CREATE TABLE articles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  zone_id UUID NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  article_code TEXT NOT NULL,
  name TEXT NOT NULL,
  inventory_quantity INTEGER DEFAULT 0,
  image_url TEXT,
  comment TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Campos:**
- `id`: UUID única del registro
- `zone_id`: Relación con la zona
- `article_code`: ID/código del artículo (ej: "ART-101")
- `name`: Nombre del artículo
- `inventory_quantity`: Cantidad esperada en inventario
- `image_url`: URL de imagen del artículo (opcional)
- `comment`: Comentario o nota
- `created_at`: Fecha de creación

---

#### 3. **verifications** (Verificaciones/Reverificaciones)
```sql
CREATE TABLE verifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  found_quantity INTEGER DEFAULT 0,
  verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Campos:**
- `id`: UUID única del registro
- `article_id`: Relación con el artículo
- `found_quantity`: Cantidad encontrada en la reverificación
- `verified`: Si fue verificado o no
- `verified_at`: Fecha de verificación
- `created_at`: Fecha de creación

---

#### 4. **action_plans** (Planes de Acción) ⚠️ EN DESARROLLO

⚠️ **ESTADO ACTUAL**: Los planes de acción están guardados en **localStorage** (no en Supabase)

**Necesita ser migrado a tabla Supabase:**
```sql
CREATE TABLE action_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  zone_id UUID NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  status TEXT DEFAULT 'pendiente', -- 'pendiente', 'en_progreso', 'completado'
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## 📦 Módulos JavaScript

### 1. **InventoryData** (`data.js`)
Lógica de modelos y cálculos de datos.

**Funciones públicas:**
```javascript
InventoryData.createZone(name)                    // Crea una zona
InventoryData.createArticle({...})               // Crea un artículo con cálculos
InventoryData.createNovelty(text)                // Crea una novedad/tarea
InventoryData.calculateDifference(expected, found)
InventoryData.determineStatus(difference)        // 'correcto', 'sobrante', 'faltante'
InventoryData.calculateZoneStats(articles)       // Estadísticas por zona
InventoryData.formatDate(dateInput)              // Formatea fechas
InventoryData.generateUniqueId()                 // ID único tipo: ID-timestamp-random
InventoryData.compressImage(file, maxW, maxH)   // Comprime imagen a Base64
```

---

### 2. **InventoryStorage** (`storage.js`)
Capa de persistencia con Supabase.

**Funciones Públicas:**
```javascript
// Zonas
await InventoryStorage.getAllZones()             // Trae todas las zonas
await InventoryStorage.getZoneById(zoneId)       // Una zona con artículos
await InventoryStorage.saveZone(zoneData)        // Crear/actualizar zona
await InventoryStorage.deleteZone(zoneId)        // Eliminar zona

// Artículos
await InventoryStorage.saveArticle(zoneId, articleData)    // Guardar artículo
await InventoryStorage.deleteArticle(zoneId, articleId)    // Eliminar artículo

// Verificaciones
await InventoryStorage.toggleArticleVerification(zoneId, articleId, isVerified)
await InventoryStorage.unlockArticle(zoneId, articleId)

// Planes de Acción (actualmente en localStorage)
await InventoryStorage.saveActionPlan(zoneId, articleId, plan)
await InventoryStorage.getActionPlansForZone(zoneId)
await InventoryStorage.getActionPlansForArticle(zoneId, articleId)
await InventoryStorage.updateActionPlan(zoneId, articleId, plan)
await InventoryStorage.deleteActionPlan(zoneId, articleId, planId)

// Import/Export
await InventoryStorage.exportAllToJSON()         // Exporta todo a JSON
await InventoryStorage.importFromJSON(jsonStr)   // Importa desde JSON
await InventoryStorage.exportZoneToJSON(zoneId)  // Exporta zona específica
```

---

### 3. **InventoryUI** (`ui.js`)
Componentes de interfaz de usuario y renderizado del DOM.

**Funciones Principales:**
```javascript
// Vistas principales
InventoryUI.showZonesView()
InventoryUI.showZoneDetailView(zoneId)

// Renderizado
InventoryUI.renderZonesList(zones, searchQuery, callbacks)
InventoryUI.renderArticlesList(articles, filter, searchQuery, callbacks)
InventoryUI.renderZoneCalendar(plans)              // Calendario de planes
InventoryUI.injectArticlePlans(plans)              // Inyecta planes en tarjetas

// Modales y alertas
InventoryUI.showToast(message, type)               // Notificación flotante
InventoryUI.showModal(title, contentHTML, buttons) // Modal genérico
InventoryUI.showImageModal(imageUrl, title)        // Visor de imagen

// Elementos del DOM
InventoryUI.elements                               // Objeto con referencias a elementos
```

---

### 4. **App** (`app.js`)
Controlador principal que orquesta todo.

**Responsabilidades:**
- Inicializar la aplicación y registro de Service Worker
- Gestión de estado global (`AppState`)
- Manejo de eventos de UI
- Bindings de botones y formularios
- Modales de zona, artículo, planes de acción
- Lógica de búsqueda y filtrado
- Manejo de temas (claro/oscuro)
- Import/Export

---

## 🎨 Estructura de Datos en la App

### Objeto Zona
```javascript
{
  id: "ZONE-123",
  name: "Zona A - Almacén",
  createdAt: "2026-08-13T10:30:00Z",
  articles: [ /* Array de artículos */ ],
  novelties: [ /* Array de novedades */ ]
}
```

### Objeto Artículo
```javascript
{
  id: "ART-101",                    // Código del artículo
  _dbId: "uuid-...",               // UUID real en BD (para upserts)
  zoneId: "ZONE-123",
  name: "Monitor LED 24\"",
  expectedQty: 15,                 // Cantidad inventariada original
  foundQty: 14,                    // Cantidad encontrada en reverificación
  difference: -1,                  // foundQty - expectedQty
  status: "faltante",              // 'correcto' | 'sobrante' | 'faltante'
  verified: true,                  // Si fue verificado
  verifiedAt: "2026-08-13T11:45:00Z", // Cuándo se verificó
  locked: true,                    // Bloqueado si verified
  image: "data:image/jpeg;base64,...", // Imagen comprimida en Base64
  comment: "Nota sobre el artículo"
}
```

### Objeto Plan de Acción
```javascript
{
  id: "PLAN-456",
  zoneId: "ZONE-123",
  articleId: "ART-101",
  description: "Realizar reorden de stock",
  startDate: "2026-08-13",
  endDate: "2026-08-20",
  status: "pendiente",             // 'pendiente' | 'en_progreso' | 'completado'
  createdAt: "2026-08-13T10:00:00Z"
}
```

### Objeto Novedad/Tarea
```javascript
{
  id: "NOV-789",
  text: "Revisar sistema de cajas",
  confirmed: false,
  confirmedAt: null,
  createdAt: "2026-08-13T10:00:00Z"
}
```

---

## 🔄 Flujo de Datos

```
┌─────────────────────────────────┐
│  UI (app.js + ui.js + HTML)    │  ← Usuario interactúa
└────────┬────────────────────────┘
         │
         ↓
┌─────────────────────────────────┐
│   InventoryData (data.js)       │  ← Cálculos y modelos
└────────┬────────────────────────┘
         │
         ↓
┌─────────────────────────────────┐
│ InventoryStorage (storage.js)  │  ← Persistencia
└────────┬────────────────────────┘
         │
    ┌────┴────┐
    ↓         ↓
 Supabase  localStorage
  (Zones,    (Plans)
  Articles,
  Verif.)
```

---

## 🚀 Instalación y Configuración

### 1. Clonar el Repositorio
```bash
git clone <repo-url>
cd inventory-reverification-pwa
```

### 2. Configurar Supabase

Crear las 3 tablas en Supabase (o importar SQL):

```sql
-- 1. Zonas
CREATE TABLE zones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 2. Artículos
CREATE TABLE articles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  zone_id UUID NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  article_code TEXT NOT NULL,
  name TEXT NOT NULL,
  inventory_quantity INTEGER DEFAULT 0,
  image_url TEXT,
  comment TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 3. Verificaciones
CREATE TABLE verifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  found_quantity INTEGER DEFAULT 0,
  verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 3. Configurar Credenciales

En `index.html`, configurar:
```html
<script>
  window.SUPABASE_URL = 'https://tu-proyecto.supabase.co';
  window.SUPABASE_ANON_KEY = 'tu_anon_key_aqui';
</script>
```

### 4. Servir Localmente

```bash
# Python 3
python -m http.server 8000

# Node.js
npx http-server -p 8000
```

Acceder a: `https://localhost:8000`

### 5. Instalar PWA

En navegadores modernos (Chrome, Edge):
- Buscar el ícono "Instalar app" en la barra de direcciones
- O abrir menú → "Instalar en este dispositivo"

---

## 🎨 Personalización

### Variables CSS Principales
```css
--primary-color: #6366f1          /* Color principal */
--text-main: #1f2937             /* Texto principal */
--text-muted: #9ca3af            /* Texto secundario */
--surface-card: #1f2937           /* Fondo tarjetas */
--border-color: #374151           /* Bordes */
```

Ver `css/style.css` para todas las variables.

---

## ⚠️ TODO - Próximas Mejoras

### 🔴 URGENTE: Migrar Planes de Acción a Supabase
- [ ] Crear tabla `action_plans` en Supabase
- [ ] Actualizar queries en `InventoryStorage`
- [ ] Migrar datos de localStorage a Supabase
- [ ] Sincronizar en tiempo real

**Query necesario (para ChatGPT/Gemini):**
```sql
-- Crear tabla action_plans en Supabase
CREATE TABLE action_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  zone_id UUID NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  status TEXT DEFAULT 'pendiente',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Otros TODOs
- [ ] Agregar autenticación de usuarios
- [ ] Historial de cambios (audit log)
- [ ] Reportes y estadísticas
- [ ] Notificaciones push
- [ ] Integración con códigos de barras/QR
- [ ] Soporte multi-idioma

---

## 📱 Compatibilidad

| Navegador | Versión | Estado |
|-----------|---------|--------|
| Chrome    | 51+     | ✅ Full Support |
| Firefox   | 44+     | ✅ Full Support |
| Safari    | 11.1+   | ✅ Full Support |
| Edge      | 17+     | ✅ Full Support |
| IE 11     | —       | ❌ No soportado |

---

## 🔒 Seguridad y Privacidad

- ✅ Datos sincronizados con Supabase (encriptado en tránsito)
- ✅ Funciona offline con Service Worker
- ✅ Sin recopilación de datos personales
- ✅ Autorización vía Supabase (si está configurada)

---

## 📄 Licencia

MIT License - Ver archivo LICENSE para detalles.

---

## 📞 Soporte y Contacto

Para problemas, sugerencias o preguntas, contactar al equipo de desarrollo.
