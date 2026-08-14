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
   * Crea un nuevo objeto de Zona de Responsabilidad.
   * @param {string} name - Nombre de la zona.
   * @returns {Object} Objeto de Zona.
   */
  function createZone(name) {
    return {
      id: generateUniqueId(),
      name: name.trim(),
      createdAt: new Date().toISOString(),
      articles: [],
      novelties: []
    };
  }

  /**
   * Crea un objeto de Novedad/Tarea para una zona.
   * @param {string} text - Contenido del comentario o novedad.
   * @returns {Object}
   */
  function createNovelty(text) {
    return {
      id: generateUniqueId(),
      text: text.trim(),
      confirmed: false,
      confirmedAt: null,
      createdAt: new Date().toISOString()
    };
  }

  /**
   * Crea o actualiza un objeto de Artículo con cálculos automáticos e imagen.
   * @param {Object} param0 
   * @returns {Object} Objeto de Artículo formateado.
   */
  function createArticle({ id, name, expectedQty = 0, foundQty = 0, verified = false, verifiedAt = null, locked = false, image = null, comment = '' }) {
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
      comment: (comment && typeof comment === 'string') ? comment.trim() : ''
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

  return {
    calculateDifference,
    determineStatus,
    generateUniqueId,
    formatDate,
    createZone,
    createArticle,
    calculateZoneStats,
    getSampleData,
    compressImage,
    createNovelty
  };
})();
