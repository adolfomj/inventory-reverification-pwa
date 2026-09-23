/**
 * data.js
 * Modelos de datos y lógica de cálculo para la aplicación de Reverificación de Inventario.
 * Diseñado modularmente para facilitar la migración futura a un backend (Firebase, Supabase, REST API).
 */

const InventoryData = (() => {

  /**
   * Calcula la diferencia entre lo encontrado en la reverificación y lo inventariado.
   * @param {number} expectedQty - Cantidad inventariada originalmente.
   * @param {number} foundQty - Cantidad encontrada en la reverificación.
   * @returns {number} Diferencia (encontrada - inventariada).
   */
  function calculateDifference(expectedQty, foundQty) {
    const expected = Number(expectedQty) || 0;
    const found = Number(foundQty) || 0;
    return found - expected;
  }

  /**
   * Determina el estado del artículo según la diferencia.
   * @param {number} difference - Diferencia calculada.
   * @returns {'correcto' | 'sobrante' | 'faltante'} Estado resultante.
   */
  function determineStatus(difference) {
    if (difference === 0) return 'correcto';
    if (difference > 0) return 'sobrante';
    return 'faltante';
  }

  /**
   * Genera un ID único para zonas o artículos si no se provee uno.
   * @returns {string} ID único basado en timestamp y aleatoriedad.
   */
  function generateUniqueId() {
    return 'ID-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
  }

  /**
   * Formatea una fecha al estándar local legible (ej: 05/08/2026 19:30).
   * @param {string | Date} dateInput 
   * @returns {string} Fecha formateada.
   */
  function formatDate(dateInput) {
    if (!dateInput) return '-';
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /**
   * Determina si una fecha tiene más de 1 mes (30 días) de antigüedad.
   * @param {string | Date} dateInput 
   * @returns {boolean}
   */
  function isOlderThanOneMonth(dateInput) {
    if (!dateInput) return false;
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return false;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
    return date < thirtyDaysAgo;
  }

  /**
   * Crea un nuevo objeto de Zona de Responsabilidad.
   * @param {string} name - Nombre de la zona.
   * @param {Object} user - Usuario que crea la zona.
   * @returns {Object} Objeto de Zona.
   */
  function createZone(name, user = null) {
    const userTag = user?.username ? `@${user.username}` : (user?.fullName || 'Sistema');
    const now = new Date().toISOString();
    return {
      id: generateUniqueId(),
      name: name.trim(),
      createdBy: userTag,
      createdAt: now,
      updatedBy: userTag,
      updatedAt: now,
      articles: [],
      novelties: []
    };
  }

  /**
   * Crea un objeto de Novedad/Tarea para una zona.
   * @param {string} text - Contenido del comentario o novedad.
   * @param {Object} user - Usuario que registra la novedad.
   * @returns {Object}
   */
  function createNovelty(text, user = null) {
    const userTag = user?.username ? `@${user.username}` : (user?.fullName || 'Sistema');
    const now = new Date().toISOString();
    return {
      id: generateUniqueId(),
      text: text.trim(),
      confirmed: false,
      confirmedAt: null,
      createdBy: userTag,
      createdAt: now
    };
  }

  /**
   * Crea o actualiza un objeto de Artículo con cálculos automáticos e imagen.
   * @param {Object} param0 
   * @returns {Object} Objeto de Artículo formateado.
   */
  function createArticle({ 
    id, 
    name, 
    expectedQty = 0, 
    foundQty = 0, 
    verified = false, 
    verifiedAt = null, 
    locked = false, 
    image = null, 
    comment = '',
    user = null,
    createdBy = null,
    createdAt = null,
    updatedBy = null,
    updatedAt = null
  }) {
    const parsedExpected = Math.max(0, parseInt(expectedQty, 10) || 0);
    const parsedFound = Math.max(0, parseInt(foundQty, 10) || 0);
    const diff = calculateDifference(parsedExpected, parsedFound);
    const status = determineStatus(diff);

    // Si se marca verificado y no tenía fecha, registrar fecha actual
    let isVerified = Boolean(verified);
    let verificationTimestamp = verifiedAt;
    if (isVerified && !verificationTimestamp) {
      verificationTimestamp = new Date().toISOString();
    } else if (!isVerified) {
      verificationTimestamp = null;
    }

    const userTag = user?.username ? `@${user.username}` : (user?.fullName || 'Sistema');
    const now = new Date().toISOString();

    return {
      id: (id && id.trim()) ? id.trim() : generateUniqueId(),
      name: name.trim(),
      expectedQty: parsedExpected,
      foundQty: parsedFound,
      difference: diff,
      status: status,
      verified: isVerified,
      verifiedAt: verificationTimestamp,
      // Si está verificado, por defecto queda bloqueado para evitar modificaciones accidentalmente
      locked: isVerified ? true : Boolean(locked),
      image: image || null,
      comment: (comment && typeof comment === 'string') ? comment.trim() : '',
      createdBy: createdBy || userTag,
      createdAt: createdAt || now,
      updatedBy: updatedBy || userTag,
      updatedAt: updatedAt || now
    };
  }

  /**
   * Calcula las estadísticas completas para una lista de artículos.
   * @param {Array} articles - Lista de artículos de una zona.
   * @returns {Object} Resumen estadístico.
   */
  function calculateZoneStats(articles = []) {
    const total = articles.length;
    let verified = 0;
    let pending = 0;
    let faltantes = 0;
    let sobrantes = 0;
    let correctos = 0;

    articles.forEach(art => {
      if (art.verified) {
        verified++;
      } else {
        pending++;
      }

      if (art.status === 'faltante') faltantes++;
      else if (art.status === 'sobrante') sobrantes++;
      else if (art.status === 'correcto') correctos++;
    });

    const percentageVerified = total > 0 ? Math.round((verified / total) * 100) : 0;

    return {
      total,
      pending,
      verified,
      faltantes,
      sobrantes,
      correctos,
      percentageVerified
    };
  }

  /**
   * Datos iniciales de demostración en caso de que localStorage esté vacío.
   */
  function getSampleData() {
    const zone1 = createZone('Zona A - Almacén Principal');
    zone1.articles = [
      createArticle({ id: 'ART-101', name: 'Monitor LED 24"', expectedQty: 15, foundQty: 15, verified: true }),
      createArticle({ id: 'ART-102', name: 'Teclado Mecánico RGB', expectedQty: 30, foundQty: 28, verified: true }),
      createArticle({ id: 'ART-103', name: 'Mouse Inalámbrico', expectedQty: 40, foundQty: 42, verified: false }),
      createArticle({ id: 'ART-104', name: 'Cable HDMI 2m', expectedQty: 50, foundQty: 45, verified: false })
    ];

    const zone2 = createZone('Zona B - Exhibición y Ventas');
    zone2.articles = [
      createArticle({ id: 'ART-201', name: 'Laptop Ultrabook i7', expectedQty: 8, foundQty: 8, verified: true }),
      createArticle({ id: 'ART-202', name: 'Tablet 10 Pulgadas', expectedQty: 12, foundQty: 14, verified: false }),
      createArticle({ id: 'ART-203', name: 'Auriculares Bluetooth', expectedQty: 25, foundQty: 20, verified: false })
    ];

    return [zone1, zone2];
  }

  /**
   * Lee un archivo de imagen, lo redimensiona en un Canvas y devuelve una URL Base64 optimizada.
   * @param {File} file - Archivo de imagen seleccionado.
   * @param {number} maxWidth - Ancho máximo.
   * @param {number} maxHeight - Alto máximo.
   * @returns {Promise<string>} Promesa con la DataURL comprimida.
   */
  function compressImage(file, maxWidth = 500, maxHeight = 500) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith('image/')) {
        reject(new Error('El archivo seleccionado no es una imagen válida.'));
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          // Convertir a JPEG comprimido al 75% para ahorro de memoria en localStorage
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.75);
          resolve(compressedDataUrl);
        };
        img.onerror = () => reject(new Error('Error al cargar la imagen.'));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error('Error al leer el archivo.'));
      reader.readAsDataURL(file);
    });
  }

  /**
   * Devuelve un texto de tiempo relativo ("hace 5 min", "hace 2 horas", "hace 3 días").
   * @param {string | Date} dateInput 
   * @returns {string}
   */
  function getRelativeTime(dateInput) {
    if (!dateInput) return '-';
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return '-';

    const now = new Date();
    const diffSecs = Math.floor((now - date) / 1000);

    if (diffSecs < 45) return 'hace unos segundos';
    if (diffSecs < 90) return 'hace 1 minuto';
    const diffMins = Math.floor(diffSecs / 60);
    if (diffMins < 60) return `hace ${diffMins} min`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours === 1) return 'hace 1 hora';
    if (diffHours < 24) return `hace ${diffHours} horas`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'ayer';
    if (diffDays < 7) return `hace ${diffDays} días`;
    if (diffDays < 30) return `hace ${Math.floor(diffDays / 7)} sem`;

    return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
  }

  /**
   * Obtiene la categoría de fecha amigable (Hoy, Ayer, Esta semana, etc.) con formato legible.
   * @param {string | Date} dateInput 
   * @returns {string} Categoría legible
   */
  function getDateCategory(dateInput) {
    if (!dateInput) return 'Sin fecha registrada';
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return 'Sin fecha registrada';

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const itemDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.floor((today - itemDate) / (1000 * 60 * 60 * 24));

    const dayName = date.toLocaleDateString('es-ES', { weekday: 'long' });
    const capitalizedDay = dayName.charAt(0).toUpperCase() + dayName.slice(1);
    const formattedShort = date.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });

    if (diffDays === 0) return `Hoy — ${capitalizedDay}, ${formattedShort}`;
    if (diffDays === 1) return `Ayer — ${capitalizedDay}, ${formattedShort}`;
    if (diffDays > 1 && diffDays <= 7) return `Esta semana (${capitalizedDay} ${date.getDate()})`;
    if (diffDays > 7 && diffDays <= 30) return `Este mes (${date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })})`;

    // Mes y año
    return date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  }

  /**
   * Agrupa una lista de elementos por categoría de fecha (de más reciente a más antiguo).
   * @param {Array} items - Lista de artículos, novedades o logs.
   * @param {string | Function} dateAccessor - Nombre de propiedad o función para obtener la fecha.
   * @returns {Array<{category: string, dateKey: string, items: Array}>} Grupos ordenados.
   */
  function groupItemsByDate(items = [], dateAccessor = 'createdAt') {
    if (!Array.isArray(items) || items.length === 0) return [];

    const getVal = (item) => {
      if (typeof dateAccessor === 'function') return dateAccessor(item);
      return item[dateAccessor] || item.verifiedAt || item.createdAt || null;
    };

    // Ordenar descendente (más nuevo primero)
    const sorted = [...items].sort((a, b) => {
      const da = new Date(getVal(a) || 0).getTime();
      const db = new Date(getVal(b) || 0).getTime();
      return db - da;
    });

    const groupsMap = new Map();

    sorted.forEach(item => {
      const rawDate = getVal(item);
      const cat = getDateCategory(rawDate);
      if (!groupsMap.has(cat)) {
        groupsMap.set(cat, {
          category: cat,
          items: []
        });
      }
      groupsMap.get(cat).items.push(item);
    });

    return Array.from(groupsMap.values());
  }

  return {
    calculateDifference,
    determineStatus,
    generateUniqueId,
    formatDate,
    getRelativeTime,
    getDateCategory,
    groupItemsByDate,
    createZone,
    createArticle,
    calculateZoneStats,
    getSampleData,
    compressImage,
    createNovelty,
    isOlderThanOneMonth
  };
})();

window.InventoryData = InventoryData;
