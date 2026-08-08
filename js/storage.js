/**
 * storage.js
 * Capa de abstracción para la gestión de persistencia en localStorage.
 * Diseñada siguiendo el patrón Repository para ser fácilmente reemplazable
 * por servicios asíncronos como Firebase, Supabase o una API REST.
 */

const InventoryStorage = (() => {
  const STORAGE_KEY = 'inventory_reverification_zones_v1';

  /**
   * Lee la lista completa de zonas desde localStorage.
   * Si es la primera vez que se ejecuta, inicializa con datos de muestra.
   * @returns {Array} Lista de Zonas.
   */
  function getAllZones() {
    try {
      const rawData = localStorage.getItem(STORAGE_KEY);
      if (!rawData) {
        // Cargar datos por defecto en primera visita
        const sampleData = InventoryData.getSampleData();
        saveAllZones(sampleData);
        return sampleData;
      }
      const zones = JSON.parse(rawData);
      return Array.isArray(zones) ? zones : [];
    } catch (error) {
      console.error('Error al leer de localStorage:', error);
      return [];
    }
  }

  /**
   * Guarda el arreglo completo de zonas en localStorage.
   * @param {Array} zones - Arreglo de zonas.
   */
  function saveAllZones(zones) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(zones));
    } catch (error) {
      console.error('Error al guardar en localStorage:', error);
      throw new Error('No se pudieron guardar los cambios en el almacenamiento local.');
    }
  }

  /**
   * Guarda manualmente el estado actual de la aplicación en localStorage.
   * @returns {boolean} true si se guardó con éxito.
   */
  function saveCurrentState() {
    const zones = getAllZones();
    saveAllZones(zones);
    return true;
  }

  /**
   * Obtiene una zona específica por su ID.
   * @param {string} zoneId 
   * @returns {Object|null} Objeto de zona o null.
   */
  function getZoneById(zoneId) {
    const zones = getAllZones();
    return zones.find(z => z.id === zoneId) || null;
  }

  /**
   * Guarda o actualiza una zona.
   * @param {Object} zoneToSave 
   * @returns {Object} Zona guardada.
   */
  function saveZone(zoneToSave) {
    const zones = getAllZones();
    const index = zones.findIndex(z => z.id === zoneToSave.id);

    if (index >= 0) {
      zones[index] = { ...zones[index], ...zoneToSave };
    } else {
      zones.push(zoneToSave);
    }

    saveAllZones(zones);
    return zoneToSave;
  }

  /**
   * Elimina una zona por su ID.
   * @param {string} zoneId 
   * @returns {boolean} true si se eliminó con éxito.
   */
  function deleteZone(zoneId) {
    let zones = getAllZones();
    const initialLength = zones.length;
    zones = zones.filter(z => z.id !== zoneId);
    saveAllZones(zones);
    return zones.length < initialLength;
  }

  /**
   * Agrega o actualiza un artículo dentro de una zona específica.
   * Recalcula automáticamente diferencia, estado y timestamp de verificación.
   * @param {string} zoneId 
   * @param {Object} articleData 
   * @returns {Object} Artículo guardado.
   */
  function saveArticle(zoneId, articleData) {
    const zone = getZoneById(zoneId);
    if (!zone) throw new Error('La zona especificada no existe.');

    const article = InventoryData.createArticle(articleData);
    const existingIndex = zone.articles.findIndex(a => a.id === article.id);

    if (existingIndex >= 0) {
      zone.articles[existingIndex] = article;
    } else {
      zone.articles.push(article);
    }

    saveZone(zone);
    return article;
  }

  /**
   * Elimina un artículo de una zona.
   * @param {string} zoneId 
   * @param {string} articleId 
   */
  function deleteArticle(zoneId, articleId) {
    const zone = getZoneById(zoneId);
    if (!zone) return false;

    zone.articles = zone.articles.filter(a => a.id !== articleId);
    saveZone(zone);
    return true;
  }

  /**
   * Cambia el estado de verificación de un artículo y ajusta su bloqueo.
   * @param {string} zoneId 
   * @param {string} articleId 
   * @param {boolean} isVerified 
   */
  function toggleArticleVerification(zoneId, articleId, isVerified) {
    const zone = getZoneById(zoneId);
    if (!zone) return null;

    const article = zone.articles.find(a => a.id === articleId);
    if (!article) return null;

    article.verified = isVerified;
    if (isVerified) {
      article.verifiedAt = new Date().toISOString();
      article.locked = true; // Se bloquea automáticamente al verificar
    } else {
      article.verifiedAt = null;
      article.locked = false;
    }

    saveZone(zone);
    return article;
  }

  /**
   * Desbloquea la edición de un artículo verificado.
   * @param {string} zoneId 
   * @param {string} articleId 
   */
  function unlockArticle(zoneId, articleId) {
    const zone = getZoneById(zoneId);
    if (!zone) return null;

    const article = zone.articles.find(a => a.id === articleId);
    if (!article) return null;

    article.locked = false;
    saveZone(zone);
    return article;
  }

  /**
   * Exporta la zona indicada a una cadena en formato JSON.
   * @param {string} zoneId 
   * @returns {string} JSON formateado.
   */
  function exportZoneToJSON(zoneId) {
    const zone = getZoneById(zoneId);
    if (!zone) throw new Error('Zona no encontrada para exportar.');

    const exportObject = {
      app: 'Reverificación de Inventario PWA',
      version: '1.0',
      exportedAt: new Date().toISOString(),
      type: 'single_zone',
      data: zone
    };

    return JSON.stringify(exportObject, null, 2);
  }

  /**
   * Exporta todas las zonas de la aplicación a JSON.
   * @returns {string} JSON formateado.
   */
  function exportAllToJSON() {
    const zones = getAllZones();
    const exportObject = {
      app: 'Reverificación de Inventario PWA',
      version: '1.0',
      exportedAt: new Date().toISOString(),
      type: 'all_zones',
      data: zones
    };

    return JSON.stringify(exportObject, null, 2);
  }

  /**
   * Importa datos desde un string JSON. Valida la estructura e integra las zonas/artículos.
   * @param {string} jsonString - Contenido del archivo JSON importado.
   * @returns {Object} Resultado con estadísticas de importación.
   */
  function importFromJSON(jsonString) {
    try {
      const parsed = JSON.parse(jsonString);
      let importedZonesCount = 0;
      let importedArticlesCount = 0;

      const currentZones = [];

      // Determinar si es exportación simple o completa
      let zonesToImport = [];

      if (parsed && parsed.data) {
        if (Array.isArray(parsed.data)) {
          zonesToImport = parsed.data;
        } else if (typeof parsed.data === 'object' && parsed.data.name) {
          zonesToImport = [parsed.data];
        }
      } else if (Array.isArray(parsed)) {
        zonesToImport = parsed;
      } else if (parsed && parsed.name) {
        zonesToImport = [parsed];
      } else {
        throw new Error('El formato del archivo JSON no es válido.');
      }

      zonesToImport.forEach(rawZone => {
        if (!rawZone.name) return;

        // Normalizar estructura de la zona
        const normalizedZone = InventoryData.createZone(rawZone.name);
        if (rawZone.id) normalizedZone.id = rawZone.id;
        if (rawZone.createdAt) normalizedZone.createdAt = rawZone.createdAt;

        // Normalizar artículos de la zona
        if (Array.isArray(rawZone.articles)) {
          normalizedZone.articles = rawZone.articles.map(art => {
            importedArticlesCount++;
            return InventoryData.createArticle(art);
          });
        }

        // Normalizar novedades de la zona
        if (Array.isArray(rawZone.novelties)) {
          normalizedZone.novelties = rawZone.novelties.map(nov => {
            return {
              id: nov.id || InventoryData.generateUniqueId(),
              text: (nov.text || '').toString(),
              confirmed: Boolean(nov.confirmed),
              confirmedAt: nov.confirmedAt || null,
              createdAt: nov.createdAt || new Date().toISOString()
            };
          });
        } else {
          normalizedZone.novelties = [];
        }

        currentZones.push(normalizedZone);

        importedZonesCount++;
      });

      saveAllZones(currentZones);

      return {
        success: true,
        zonesCount: importedZonesCount,
        articlesCount: importedArticlesCount
      };
    } catch (error) {
      console.error('Error durante la importación JSON:', error);
      throw new Error('Error al importar el archivo JSON: ' + error.message);
    }
  }

  /**
   * Guarda o actualiza una novedad dentro de una zona específica.
   * @param {string} zoneId 
   * @param {Object} noveltyData 
   * @returns {Object} Novedad guardada.
   */
  function saveNovelty(zoneId, noveltyData) {
    const zone = getZoneById(zoneId);
    if (!zone) throw new Error('La zona especificada no existe.');

    if (!zone.novelties) zone.novelties = [];

    const existingIndex = zone.novelties.findIndex(n => n.id === noveltyData.id);
    if (existingIndex >= 0) {
      zone.novelties[existingIndex] = { ...zone.novelties[existingIndex], ...noveltyData };
    } else {
      const newNov = InventoryData.createNovelty(noveltyData.text);
      if (noveltyData.id) newNov.id = noveltyData.id;
      zone.novelties.push(newNov);
    }

    saveZone(zone);
    return noveltyData;
  }

  /**
   * Elimina una novedad de una zona.
   * @param {string} zoneId 
   * @param {string} noveltyId 
   */
  function deleteNovelty(zoneId, noveltyId) {
    const zone = getZoneById(zoneId);
    if (!zone) return false;

    if (!zone.novelties) return false;
    zone.novelties = zone.novelties.filter(n => n.id !== noveltyId);
    saveZone(zone);
    return true;
  }

  /**
   * Cambia el estado de confirmación de una novedad.
   * @param {string} zoneId 
   * @param {string} noveltyId 
   * @param {boolean} isConfirmed 
   */
  function toggleNoveltyConfirmation(zoneId, noveltyId, isConfirmed) {
    const zone = getZoneById(zoneId);
    if (!zone) return null;

    if (!zone.novelties) zone.novelties = [];
    const novelty = zone.novelties.find(n => n.id === noveltyId);
    if (!novelty) return null;

    novelty.confirmed = isConfirmed;
    novelty.confirmedAt = isConfirmed ? new Date().toISOString() : null;

    saveZone(zone);
    return novelty;
  }

  return {
    getAllZones,
    getZoneById,
    saveAllZones,
    saveCurrentState,
    saveZone,
    deleteZone,
    saveArticle,
    deleteArticle,
    toggleArticleVerification,
    unlockArticle,
    exportZoneToJSON,
    exportAllToJSON,
    importFromJSON,
    saveNovelty,
    deleteNovelty,
    toggleNoveltyConfirmation
  };
})();
