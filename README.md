# 📊 Reverificación de Inventario por Zonas (PWA Mobile-First)

> **🤖 CONTEXTO RÁPIDO PARA AGENTES DE IA (LEER PRIMERO ANTES DE EDITAR EL PROYECTO)**
> Este documento contiene el estado real y actualizado de la arquitectura, esquema de base de datos en Supabase, contratos de módulos y reglas de negocio para **evitar leer todo el código fuente** en cada sesión.
>
> ### 🚨 Reglas Críticas del Proyecto
> 1. **NO USAR GIT:** No ejecutar `git add`, `git commit` ni `git push` bajo ninguna circunstancia salvo petición explícita del usuario.
> 2. **Sin Bundler / Sin ES Modules en navegador:** Los scripts se cargan de forma secuencial en `index.html` mediante etiquetas `<script>` clásicas y exponen globales en `window` (`window.InventoryData`, `window.InventoryStorage`, `window.InventoryUI`). **Nota:** `js/supabase.js` es un archivo huérfano legado que usa `import` y **NO** se carga en `index.html`; el cliente Supabase se inicializa inline en `index.html` (`window.supabaseClient`).
> 3. **Cuidado con Columnas Inexistentes en Supabase (Error `PGRST204`):** No enviar columnas como `created_by`, `updated_by` o `verified_by` en `INSERT`/`UPDATE` de `zones`, `articles` o `verifications` a menos que el usuario confirme haber ejecutado un `ALTER TABLE` en Supabase. Toda la trazabilidad de autoría (`@usuario`) se persiste en la tabla `activity_logs`.
> 4. **Service Worker (`sw.js`):** Siempre que modifiques archivos JS o CSS, incrementa `CACHE_NAME` (actualmente `inventory-pwa-v8`) en `sw.js` para evitar que el navegador sirva versiones en caché.

---

## 🎯 Propósito del Proyecto y Flujo de Negocio

Aplicación **Progressive Web App (PWA) diseñada primordialmente para dispositivos móviles (celular en mano en piso de venta o bodega)** que permite a auditores y líderes de zona:
1. **Registrar rápidamente el estado físico del inventario:** Comparar la cantidad teórica del sistema (`expectedQty`) contra la cantidad física contada (`foundQty`), detectando al instante **Faltantes** (`difference < 0`), **Sobrantes** (`difference > 0`) o **Correctos** (`difference === 0`).
2. **Dejar constancia auditable (Qué, Cuánto, Quién y Cuándo):** Cada conteo, verificación, desbloqueo, novedad o creación queda registrado con fecha/hora exacta y usuario responsable (`@username`), más evidencia fotográfica comprimida.
3. **Identificar problemas repetitivos y ejecutar Planes de Acción:** Cuando un artículo presenta diferencias recurrentes o incidencias en la zona, se programan **Planes de Acción** con fechas de inicio/fin (visibles en la tarjeta del artículo y en el calendario de la zona) y **Novedades/Tareas** para revertir la causa raíz.

---

## 📁 Estructura del Proyecto y Mapa de Archivos

```text
inventory-reverification-pwa/
├── index.html          # Shell único SPA: Auth View + App Shell + Modales + Inicialización Supabase
├── manifest.json       # Configuración PWA instalable en Android/iOS
├── sw.js               # Service Worker (Network-First para HTML, Cache-First para assets, v7)
├── css/
│   └── style.css       # Sistema de diseño Material 3, variables CSS, dark/light mode, responsive móvil
├── js/
│   ├── data.js         # window.InventoryData: Modelos puros, cálculos, fechas, compresión de fotos
│   ├── storage.js      # window.InventoryStorage: CRUD Supabase + Auth + Logs + Fallbacks localStorage
│   ├── ui.js           # window.InventoryUI: Renderizado DOM, tarjetas, carpetas >30d, calendario, modales
│   ├── app.js          # Controlador principal: AppState, eventos, flujos de usuario
│   └── supabase.js     # ⚠️ HUÉRFANO (No cargado en index.html, ignorar)
└── README.md           # Documentación maestra y contexto para IAs
```

---

## 🗄️ Esquema Real de Base de Datos (Supabase)

**URL Proyecto:** `https://rserzjanocqmgubdevow.supabase.co` (Configurado en `index.html`).

> ⚠️ **IMPORTANTE PARA IAs:** Respeta estrictamente las columnas listadas debajo al construir payloads para `window.supabaseClient.from(...)`. Enviar propiedades extra provoca `HTTP 400 (PGRST204: Column not found in schema cache)`.

### 1. Tabla `zones` (Zonas Comerciales / de Responsabilidad)
| Columna | Tipo | Descripción |
| :--- | :--- | :--- |
| `id` | `UUID` (PK) | Generado por Supabase (`default gen_random_uuid()`) |
| `name` | `TEXT` | Nombre de la zona comercial (ej. "Running", "Fitness", "Bicicleta") |
| `hidden` | `BOOLEAN` | `false` por defecto. Si es `true`, solo el rol `admin` puede verla |
| `created_at` | `TIMESTAMPTZ` | Fecha de creación |
| `updated_at` | `TIMESTAMPTZ` | Fecha de última modificación |

### 2. Tabla `articles` (Artículos por Zona)
*Constraint único:* `UNIQUE (zone_id, article_code)` — usado en `.upsert(..., { onConflict: 'zone_id,article_code' })`.

| Columna | Tipo | Descripción |
| :--- | :--- | :--- |
| `id` | `UUID` (PK) | ID interno en base de datos (`_dbId` en el frontend) |
| `zone_id` | `UUID` (FK) | Referencia a `zones(id) ON DELETE CASCADE` |
| `article_code` | `TEXT` | Código visible del artículo (`id` en el frontend, ej. código de barras/ítem) |
| `name` | `TEXT` | Nombre descriptivo del artículo |
| `inventory_quantity` | `INTEGER` | Cantidad teórica en sistema (`expectedQty` en frontend) |
| `image_url` | `TEXT` | Imagen comprimida en Base64 (`data:image/jpeg;base64,...`) o URL |
| `comment` | `TEXT` | Observación sobre ubicación, empaque o causa de diferencia |
| `created_at` | `TIMESTAMPTZ` | Fecha de creación |
| `updated_at` | `TIMESTAMPTZ` | Fecha de última edición |

### 3. Tabla `verifications` (Estado de Conteo y Verificación)
*Constraint único:* `article_id` — usado en `.upsert(..., { onConflict: 'article_id' })`.

| Columna | Tipo | Descripción |
| :--- | :--- | :--- |
| `article_id` | `UUID` (PK/FK) | Referencia a `articles(id) ON DELETE CASCADE` |
| `found_quantity` | `INTEGER` | Cantidad física encontrada en reverificación (`foundQty`) |
| `verified` | `BOOLEAN` | Si ya fue verificado (`true` bloquea la edición del input numérico) |
| `verified_at` | `TIMESTAMPTZ` | Fecha/hora exacta en que se marcó como verificado (`null` si se desbloquea) |
| `created_at` | `TIMESTAMPTZ` | Fecha de creación del registro |
| `updated_at` | `TIMESTAMPTZ` | Última actualización |

### 4. Tabla `activity_logs` (Historial de Auditoría: Quién, Qué y Cuándo)
Tiene fallback automático a `localStorage` (`inventory_activity_logs_v1`).

| Columna | Tipo | Descripción |
| :--- | :--- | :--- |
| `id` | `UUID` (PK) | Identificador del evento |
| `zone_id` | `UUID` (Nullable)| Zona donde ocurrió la acción (`null` para login/logout/import) |
| `user_email` | `TEXT` | Tag del usuario que ejecutó la acción (ej. `@admin`, `@auditor1`) |
| `action` | `TEXT` | Ej: `save_article`, `verify_article`, `unlock_article`, `hide_zone`, `login` |
| `entity_type` | `TEXT` | `'zone'`, `'article'`, `'novelty'`, `'plan'`, `'auth'`, `'system'` |
| `entity_name` | `TEXT` | Nombre o código del elemento afectado |
| `details` | `TEXT` | Resumen legible del cambio (ej. `"Artículo 8541234: Sistema=15, Encontrado=13 (faltante)"`) |
| `created_at` | `TIMESTAMPTZ` | Fecha/hora exacta del evento |

### 5. Tablas con Fallback Híbrido (Supabase + `localStorage`)
* **`app_users` / `users`**: Autenticación personalizada con columnas flexibles (`username`/`usuario`, `password`/`password_hash`/`clave`, `full_name`/`nombre`, `role`: `'admin'` | `'auditor'`). Si la tabla no responde, `storage.js` hace fallback a Supabase Native Auth (`@decathlon.com`) y finalmente a credenciales locales de emergencia (`admin`/`admin123` y `auditor1`/`123456`).
* **`novelties`**: Tareas u observaciones generales de la zona (`id`, `zone_id`, `text`, `confirmed`, `confirmed_at`, `created_at`, `updated_at`). Fallback en `localStorage` (`inventory_novelties_v1`).
* **`action_plans`**: Planes de acción por artículo (`id`, `zone_id`, `article_code`, `description`, `start_date`, `end_date`, `created_at`, `updated_at`). Fallback en `localStorage` (`inventory_action_plans_v1`).

---

## 🔐 Roles de Usuario y Reglas de Visibilidad

| Funcionalidad | Rol `admin` | Rol `auditor` (Usuario normal) |
| :--- | :---: | :---: |
| Ver zonas activas (`hidden = false`) | ✅ | ✅ |
| Ocultar / Mostrar zonas comerciales (`hidden = true`) | ✅ (Botón ojo + Pestañas Todas/Activas/Ocultas) | ❌ (Invisibles para el auditor) |
| Botón `⚡` Desplegable "Últimos Cambios" (Header) | ✅ (Ve cambios + inicios/cierres de sesión) | ✅ (Ve **solo** cambios de inventario; **sin** eventos `login`/`logout`) |
| Sub-vista "Historial / Logs" completos dentro de Zona | ✅ | ❌ (Pestaña oculta) |
| Crear/Editar/Verificar/Desbloquear artículos y novedades | ✅ | ✅ |

---

## 🧩 Contratos de Módulos JavaScript

### 1. `window.InventoryData` (`js/data.js`)
Funciones puras sin efectos secundarios:
* `calculateDifference(expectedQty, foundQty)` → `found - expected`
* `determineStatus(difference)` → `'correcto' | 'sobrante' | 'faltante'`
* `calculateZoneStats(articles)` → `{ total, pending, verified, faltantes, sobrantes, correctos, percentageVerified }`
* `isOlderThanOneMonth(dateInput)` → `boolean` (Usado para enviar artículos > 30 días a la **Carpeta de Archivo** dentro de cada zona).
* `groupItemsByDate(items, dateAccessor)` → Agrupa cronológicamente en `"Hoy — ..."`, `"Ayer — ..."`, `"Esta semana (...)"`, `"Este mes (...)"`, etc.
* `compressImage(file, maxWidth=500, maxHeight=500)` → Redimensiona en `<canvas>` y comprime a JPEG `0.75` Base64.

### 2. `window.InventoryStorage` (`js/storage.js`)
* **Auth:** `getCurrentUser()`, `signIn(username, password)`, `signOut()`
* **Logs:** `logActivity({ zoneId, action, entityType, entityName, details })`, `getActivityLogs(zoneId)`
* **Zonas:** `getAllZones()`, `getZoneById(zoneId)`, `saveZone(zoneData)`, `deleteZone(zoneId)`, `toggleZoneVisibility(zoneId, hide)`
* **Artículos:** `saveArticle(zoneId, articleData)`, `deleteArticle(zoneId, articleId)`, `toggleArticleVerification(zoneId, articleId, isVerified)`, `unlockArticle(zoneId, articleId)`, `getArticleHistory(zoneId, articleId, articleName)`
* **Novedades:** `getNoveltiesForZone(zoneId)`, `saveNovelty(zoneId, noveltyData)`, `deleteNovelty(zoneId, noveltyId)`, `toggleNoveltyConfirmation(zoneId, noveltyId, isConfirmed)`
* **Planes de Acción:** `getActionPlansForZone(zoneId)`, `saveActionPlan(zoneId, articleId, plan)`, `toggleActionPlanStatus(zoneId, plan)`, `deleteActionPlan(zoneId, articleId, planId)`
* **Respaldo JSON:** `exportZoneToJSON(zoneId)`, `exportAllToJSON()`, `importFromJSON(jsonString)`

### 3. `window.InventoryUI` (`js/ui.js`)
* `renderZonesList(zones, searchQuery, callbacks, isAdmin, zoneFilter)`
* `renderArticlesList(articles, currentFilter, searchQuery, callbacks)` — **4 parámetros exactos**. Separa artículos recientes (`<= 30 días`) agrupados por fecha y empaqueta los antiguos (`> 30 días`) dentro de un acordeón plegable `.archive-folder-card` dentro de la zona.
* `renderActivitySidebarFeed(logs, isAdmin)` — Renderiza el popover `#activity-sidebar` al pulsar `#btn-toggle-activity`.
* `renderZoneCalendar(plans)`, `injectArticlePlans(plans)`, `showFullCalendar(plans)`

---

## 🚀 Propuestas de Mejora y Hoja de Ruta (Enfoque Mobile-First, Auditoría y Planes de Acción)

Tras auditar el código actual frente al objetivo del proyecto (*uso cómodo en celular para registrar faltantes/sobrantes, dejar constancia de qué/cuánto/cuándo y generar planes de acción ante problemas repetitivos*), se identificaron las siguientes mejoras prioritarias:

### 🔴 Prioridad 1: Bugs Funcionales y Brechas en Planes de Acción (Quick Wins)
1. **Restaurar el botón/formulario para crear Planes de Acción desde el Artículo:**
   * *Diagnóstico:* `storage.js` tiene `saveActionPlan()` y `ui.js` tiene `renderZoneCalendar()` e `injectArticlePlans()`, pero en `app.js` y en las tarjetas de artículo **actualmente no hay botón ni sección en el modal para crear un Plan de Acción nuevo**.
   * *Solución:* Añadir un botón rápido `📋 + Plan de Acción` directamente en el pie de cada tarjeta de artículo (especialmente visible cuando el estado es `faltante` o `sobrante`) que abra un modal ligero con: Descripción de la acción correctiva, Fecha inicio y Fecha compromiso.
2. **Atribución exacta de quién creó/modificó cada artículo desde `activity_logs`:**
   * *Diagnóstico:* Como las tablas `zones` y `articles` no tienen columnas `created_by`/`updated_by`, `rowToZone` y `rowsToArticles` muestran `@admin` o `@auditor1` por defecto al recargar.
   * *Solución:* Cruzar en memoria los registros de `activity_logs` al cargar la zona (o añadir las columnas en Supabase mediante un script SQL opcional) para que cada artículo muestre siempre el `@usuario` real que hizo el último conteo y a qué hora exacta.

### 📱 Prioridad 2: Ergonomía Mobile-First (Uso a una sola mano en bodega/tienda)
3. **Botones `+1` y `-1` (Steppers táctiles) en la tarjeta del artículo:**
   * *Por qué:* En el celular, tocar un `<input type="number">`, borrar el número con el teclado virtual y escribir otro es lento e incómodo mientras se sostiene mercancía.
   * *Mejora:* Agregar botones grandes `-` y `+` a los lados del campo `Cant. Inventariada` con guardado automático (debounce de 500ms) y botón rápido `= Igualar a Sistema` para confirmar en un toque cuando el stock está completo.
4. **Escáner de Código de Barras / QR con la cámara del celular:**
   * *Por qué:* Escribir códigos de 7-13 dígitos manualmente en el buscador o al crear un artículo genera errores de digitación.
   * *Mejora:* Integrar la API nativa `BarcodeDetector` o `html5-qrcode` en un botón `📷 Escanear` junto a la barra de búsqueda y en el modal de nuevo artículo. Al escanear un código:
     * Si el artículo ya existe en la zona, hace scroll directo a su tarjeta y enfoca la cantidad.
     * Si no existe, abre el modal de "Nuevo Artículo" con el código ya rellenado.
5. **Dictado por Voz (Web Speech API) para Comentarios y Novedades:**
   * *Por qué:* Escribir observaciones largas en pantalla táctil detiene el ritmo del conteo.
   * *Mejora:* Añadir un ícono de micrófono `🎤` en el campo de comentarios del artículo y en Novedades para dictar rápidamente *"Faltan 2 unidades, caja rota en altillo B"*.

### 🔁 Prioridad 3: Detección de Reincidencias e Historial de Conteos ("Qué, Cuánto y Cuándo")
6. **Historial de Reverificaciones por Artículo (Línea de tiempo del ítem):**
   * *Problema actual:* `verifications` sobrescribe `found_quantity` en cada conteo (`upsert` por `article_id`), por lo que en la tarjeta solo se ve la foto del último conteo y se pierde la vista rápida de cuántas veces ha fallado ese artículo en el pasado.
   * *Mejora:* Añadir un botón `🕒 Historial (N)` en la tarjeta del artículo que consulte en `activity_logs` todos los eventos `save_article` / `verify_article` de ese código y muestre una mini-tabla:
     * `07/11 14:20 — @auditor1: Sistema 15 | Encontrado 12 (Faltante -3)`
     * `01/11 09:10 — @auditor2: Sistema 15 | Encontrado 13 (Faltante -2)`
7. **Alerta Automática de "Artículo Reincidente" + Sugerencia de Plan de Acción:**
   * *Mejora:* Si un artículo acumula **2 o más registros consecutivos con estado `faltante` o `sobrante`** en el historial, mostrar una insignia roja/naranja `🔥 Reincidente (3 veces con diferencia)` en su tarjeta y sugerir automáticamente: *"Este artículo ha presentado diferencias repetitivas. ¿Deseas generar un Plan de Acción para revertir el problema?"*.
8. **Motivos Estandarizados de Diferencia (Tags rápidos en un toque):**
   * *Mejora:* Cuando `foundQty !== expectedQty`, mostrar chips seleccionables con un toque en el celular: `[📦 Mal ubicado]`, `[🏷️ Error de recepción]`, `[💔 Merma / Dañado]`, `[🛒 Posible hurto]`, `[🔄 Sin etiquetar]`. Esto permite estadificar por qué ocurren los faltantes/sobrantes sin obligar a escribir texto libre.

### 📊 Prioridad 4: Seguimiento Efectivo de Planes de Acción
9. **Estados de Plan de Acción (`Pendiente` → `En Progreso` → `Efectivo / Resuelto`):**
   * Permitir marcar un Plan de Acción como completado y vincular una **Reverificación de Control**: cuando vence la `end_date` del plan de acción, resaltar el artículo para verificar si la medida adoptada realmente revirtió el faltante/sobrante.
10. **Exportación a CSV / WhatsApp Resumen de Turno:**
    * Un botón para compartir por WhatsApp o descargar en CSV el resumen del conteo del día (ej. *"Zona Running: 42 verificados, 3 faltantes críticos, 2 planes de acción creados hoy por @auditor1"*).
