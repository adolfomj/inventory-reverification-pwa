/**
 * storage.js  –  Capa de persistencia con Supabase
 * ----------------------------------------------------------------
 * Usa las tablas:  zones · articles · verifications
 * El cliente de Supabase se inyecta en window.supabaseClient desde
 * js/supabase.js (que se carga como type="module" antes que este script).
 *
 * API pública (toda async, devuelve Promise):
 *   getAllZones()
 *   getZoneById(zoneId)
 *   saveZone(zoneData)
 *   deleteZone(zoneId)
 *   saveArticle(zoneId, articleData)
 *   deleteArticle(zoneId, articleId)
 *   toggleArticleVerification(zoneId, articleId, isVerified)
 *   unlockArticle(zoneId, articleId)
 *   exportZoneToJSON(zoneId)
 *   exportAllToJSON()
 *   importFromJSON(jsonString)
 *   saveCurrentState()  (no-op, compatibilidad con llamadas antiguas)
 */

const InventoryStorage = (() => {

  // ---------------------------------------------------------------------------
  // Helpers internos
  // ---------------------------------------------------------------------------

  /** Devuelve el cliente de Supabase (ya disponible en window tras el módulo). */
  function db() {
    const client = window.supabaseClient;
    if (!client) throw new Error('[InventoryStorage] supabaseClient no está disponible todavía.');
    return client;
  }

  /** Lanza el error de Supabase si existe. */
  function check(error, context) {
    if (error) {
      console.error(`[InventoryStorage] Error en ${context}:`, error);
      throw new Error(error.message || `Error en ${context}`);
    }
  }

  /**
   * Convierte una fila de Supabase al formato que espera la app:
   *   { id, name, createdAt, articles: [], novelties: [] }
   * Los artículos y novedades se deben cargar aparte.
   */
  function rowToZone(row) {
    return {
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      articles: [],
      novelties: []
    };
  }

  /**
   * Convierte filas de articles + verifications al formato interno de la app:
   *   { id, name, expectedQty, foundQty, difference, status, verified, verifiedAt, locked, image, comment }
   */
  function rowsToArticles(articleRows, verificationMap) {
    return articleRows.map(row => {
      const ver = verificationMap[row.id] || {};
      const expectedQty = row.inventory_quantity || 0;
      const foundQty    = ver.found_quantity != null ? ver.found_quantity : expectedQty;
      const difference  = foundQty - expectedQty;
      const status      = difference === 0 ? 'correcto' : difference > 0 ? 'sobrante' : 'faltante';
      const verified    = Boolean(ver.verified);

      return {
        id:           row.article_code || row.id,
        _dbId:        row.id,          // UUID real de la BD (necesario para upserts)
        zoneId:       row.zone_id,
        name:         row.name,
        expectedQty,
        foundQty,
        difference,
        status,
        verified,
        verifiedAt:   ver.verified_at || null,
        locked:       verified,        // bloqueado si está verificado
        image:        row.image_url || null,
        comment:      row.comment   || ''
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Carga de datos
  // ---------------------------------------------------------------------------

  /**
   * Trae todas las zonas con sus artículos y verificaciones.
   * @returns {Promise<Array>}
   */
  async function getAllZones() {
    const client = db();

    // 1. Zonas
    const { data: zoneRows, error: zErr } = await client
      .from('zones')
      .select('*')
      .order('created_at', { ascending: true });
    check(zErr, 'getAllZones → zones');

    if (!zoneRows || zoneRows.length === 0) return [];

    const zoneIds = zoneRows.map(z => z.id);

    // 2. Artículos de esas zonas
    const { data: articleRows, error: aErr } = await client
      .from('articles')
      .select('*')
      .in('zone_id', zoneIds)
      .order('created_at', { ascending: true });
    check(aErr, 'getAllZones → articles');

    const articleIds = (articleRows || []).map(a => a.id);

    // 3. Verificaciones de esos artículos
    let verificationMap = {};
    if (articleIds.length > 0) {
      const { data: verRows, error: vErr } = await client
        .from('verifications')
        .select('*')
        .in('article_id', articleIds);
      check(vErr, 'getAllZones → verifications');
      (verRows || []).forEach(v => { verificationMap[v.article_id] = v; });
    }

    // 4. Ensamblar zonas
    return zoneRows.map(zRow => {
      const zone = rowToZone(zRow);
      const zArticles = (articleRows || []).filter(a => a.zone_id === zRow.id);
      zone.articles = rowsToArticles(zArticles, verificationMap);
      return zone;
    });
  }

  /**
   * Devuelve una sola zona con sus artículos.
   * @param {string} zoneId - UUID de la zona.
   * @returns {Promise<Object|null>}
   */
  async function getZoneById(zoneId) {
    const client = db();

    const { data: zoneRow, error: zErr } = await client
      .from('zones')
      .select('*')
      .eq('id', zoneId)
      .single();
    check(zErr, 'getZoneById → zone');
    if (!zoneRow) return null;

    const { data: articleRows, error: aErr } = await client
      .from('articles')
      .select('*')
      .eq('zone_id', zoneId)
      .order('created_at', { ascending: true });
    check(aErr, 'getZoneById → articles');

    const articleIds = (articleRows || []).map(a => a.id);
    let verificationMap = {};
    if (articleIds.length > 0) {
      const { data: verRows, error: vErr } = await client
        .from('verifications')
        .select('*')
        .in('article_id', articleIds);
      check(vErr, 'getZoneById → verifications');
      (verRows || []).forEach(v => { verificationMap[v.article_id] = v; });
    }

    const zone = rowToZone(zoneRow);
    zone.articles = rowsToArticles(articleRows || [], verificationMap);
    return zone;
  }

  // ---------------------------------------------------------------------------
  // Mutaciones de Zonas
  // ---------------------------------------------------------------------------

  /**
   * Crea o actualiza una zona.
   * Si zoneData.id es un UUID válido → update. Si no → insert.
   * @param {Object} zoneData
   * @returns {Promise<Object>} Zona guardada.
   */
  async function saveZone(zoneData) {
    const client = db();

    // Detectar si el ID parece un UUID (formato estándar)
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(zoneData.id || '');

    if (isUUID) {
      // Update
      const { error } = await client
        .from('zones')
        .update({ name: zoneData.name, updated_at: new Date().toISOString() })
        .eq('id', zoneData.id);
      check(error, 'saveZone → update');
      return zoneData;
    } else {
      // Insert – Supabase genera el UUID
      const { data, error } = await client
        .from('zones')
        .insert([{ name: zoneData.name }])
        .select()
        .single();
      check(error, 'saveZone → insert');
      return rowToZone(data);
    }
  }

  /**
   * Elimina una zona (las tablas articles y verifications se borran en cascada).
   * @param {string} zoneId - UUID de la zona.
   * @returns {Promise<boolean>}
   */
  async function deleteZone(zoneId) {
    const client = db();
    const { error } = await client.from('zones').delete().eq('id', zoneId);
    check(error, 'deleteZone');
    return true;
  }

  // ---------------------------------------------------------------------------
  // Mutaciones de Artículos
  // ---------------------------------------------------------------------------

  /**
   * Crea o actualiza un artículo en una zona, y su registro de verificación.
   * @param {string} zoneId - UUID de la zona.
   * @param {Object} articleData - Datos del artículo (formato interno de la app).
   * @returns {Promise<Object>} Artículo guardado (formato interno).
   */
  async function saveArticle(zoneId, articleData) {
    const client = db();

    const expectedQty = Math.max(0, parseInt(articleData.expectedQty, 10) || 0);
    const foundQty    = Math.max(0, parseInt(articleData.foundQty,    10) || 0);
    const articleCode = articleData.id || InventoryData.generateUniqueId();

    // --- 1. Upsert en tabla articles ---
    const articlePayload = {
      zone_id:            zoneId,
      article_code:       articleCode,
      name:               articleData.name,
      inventory_quantity: expectedQty,
      image_url:          articleData.image  || null,
      comment:            articleData.comment || '',
      updated_at:         new Date().toISOString()
    };

    // Si ya tenemos el _dbId (UUID real) hacemos update; si no, insert
    let dbArticleId = articleData._dbId || null;

    if (dbArticleId) {
      const { error } = await client
        .from('articles')
        .update(articlePayload)
        .eq('id', dbArticleId);
      check(error, 'saveArticle → update article');
    } else {
      // Intentar upsert por zone_id + article_code (unique constraint)
      const { data, error } = await client
        .from('articles')
        .upsert([articlePayload], { onConflict: 'zone_id,article_code' })
        .select()
        .single();
      check(error, 'saveArticle → upsert article');
      dbArticleId = data.id;
    }

    // --- 2. Upsert en tabla verifications ---
    const verified    = Boolean(articleData.verified);
    const verifiedAt  = verified
      ? (articleData.verifiedAt || new Date().toISOString())
      : null;

    const verPayload = {
      article_id:     dbArticleId,
      found_quantity: foundQty,
      verified,
      verified_at:    verifiedAt,
      updated_at:     new Date().toISOString()
    };

    const { error: vErr } = await client
      .from('verifications')
      .upsert([verPayload], { onConflict: 'article_id' });
    check(vErr, 'saveArticle → upsert verification');

    // Devolver en formato interno
    const diff   = foundQty - expectedQty;
    const status = diff === 0 ? 'correcto' : diff > 0 ? 'sobrante' : 'faltante';

    return {
      id:          articleCode,
      _dbId:       dbArticleId,
      zoneId,
      name:        articleData.name,
      expectedQty,
      foundQty,
      difference:  diff,
      status,
      verified,
      verifiedAt,
      locked:      verified,
      image:       articleData.image  || null,
      comment:     articleData.comment || ''
    };
  }

  /**
   * Elimina un artículo (y su verificación en cascada).
   * @param {string} zoneId
   * @param {string} articleId  – article_code (no el UUID interno)
   * @returns {Promise<boolean>}
   */
  async function deleteArticle(zoneId, articleId) {
    const client = db();
    const { error } = await client
      .from('articles')
      .delete()
      .eq('zone_id', zoneId)
      .eq('article_code', articleId);
    check(error, 'deleteArticle');
    return true;
  }

  // ---------------------------------------------------------------------------
  // Verificación de Artículos
  // ---------------------------------------------------------------------------

  /**
   * Marca o desmarca un artículo como verificado.
   * @param {string} zoneId
   * @param {string} articleId  – article_code
   * @param {boolean} isVerified
   * @returns {Promise<Object|null>}
   */
  async function toggleArticleVerification(zoneId, articleId, isVerified) {
    const client = db();

    // Buscar el UUID real del artículo
    const { data: artRow, error: aErr } = await client
      .from('articles')
      .select('id')
      .eq('zone_id', zoneId)
      .eq('article_code', articleId)
      .single();
    check(aErr, 'toggleArticleVerification → get article');
    if (!artRow) return null;

    const verifiedAt = isVerified ? new Date().toISOString() : null;

    const { error: vErr } = await client
      .from('verifications')
      .upsert([{
        article_id:  artRow.id,
        verified:    isVerified,
        verified_at: verifiedAt,
        updated_at:  new Date().toISOString()
      }], { onConflict: 'article_id' });
    check(vErr, 'toggleArticleVerification → upsert verification');

    return { id: articleId, verified: isVerified, verifiedAt, locked: isVerified };
  }

  /**
   * Desbloquea un artículo verificado para permitir edición.
   * (Mantiene verified=true pero locked=false en memoria; el bloqueo es solo visual)
   */
  async function unlockArticle(zoneId, articleId) {
    // El desbloqueo es solo visual en la app (locked es campo de memoria, no en BD).
    // No requiere cambio en la BD. Devolvemos el artículo actual.
    return await _getArticleByCode(zoneId, articleId);
  }

  /** Helper: busca un artículo por su article_code dentro de una zona. */
  async function _getArticleByCode(zoneId, articleCode) {
    const zone = await getZoneById(zoneId);
    if (!zone) return null;
    return zone.articles.find(a => a.id === articleCode) || null;
  }

  // ---------------------------------------------------------------------------
  // Export / Import JSON (compatibilidad)
  // ---------------------------------------------------------------------------

  /**
   * Exporta una zona y sus artículos a un string JSON.
   * @param {string} zoneId
   * @returns {Promise<string>}
   */
  async function exportZoneToJSON(zoneId) {
    const zone = await getZoneById(zoneId);
    if (!zone) throw new Error('Zona no encontrada para exportar.');
    return JSON.stringify({
      app: 'Reverificación de Inventario PWA',
      version: '2.0',
      exportedAt: new Date().toISOString(),
      type: 'single_zone',
      data: zone
    }, null, 2);
  }

  /**
   * Exporta todas las zonas a un string JSON.
   * @returns {Promise<string>}
   */
  async function exportAllToJSON() {
    const zones = await getAllZones();
    return JSON.stringify({
      app: 'Reverificación de Inventario PWA',
      version: '2.0',
      exportedAt: new Date().toISOString(),
      type: 'all_zones',
      data: zones
    }, null, 2);
  }

  /**
   * Importa zonas y artículos desde un string JSON.
   * @param {string} jsonString
   * @returns {Promise<{success: boolean, zonesCount: number, articlesCount: number}>}
   */
  async function importFromJSON(jsonString) {
    const parsed = JSON.parse(jsonString);
    let zonesToImport = [];

    if (parsed && parsed.data) {
      zonesToImport = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
    } else if (Array.isArray(parsed)) {
      zonesToImport = parsed;
    } else if (parsed && parsed.name) {
      zonesToImport = [parsed];
    } else {
      throw new Error('El formato del archivo JSON no es válido.');
    }

    let zonesCount = 0;
    let articlesCount = 0;

    for (const rawZone of zonesToImport) {
      if (!rawZone.name) continue;
      const savedZone = await saveZone({ name: rawZone.name });
      zonesCount++;

      if (Array.isArray(rawZone.articles)) {
        for (const art of rawZone.articles) {
          await saveArticle(savedZone.id, {
            id:          art.id || art.article_code,
            name:        art.name,
            expectedQty: art.expectedQty || art.inventory_quantity || 0,
            foundQty:    art.foundQty    || 0,
            verified:    art.verified    || false,
            verifiedAt:  art.verifiedAt  || null,
            locked:      art.locked      || false,
            image:       art.image       || null,
            comment:     art.comment     || ''
          });
          articlesCount++;
        }
      }
    }

    return { success: true, zonesCount, articlesCount };
  }

  // ---------------------------------------------------------------------------
  // Novedades (novelties) — almacenadas en localStorage por ahora
  // ya que el esquema Supabase actual no las incluye
  // ---------------------------------------------------------------------------
  const NOVELTY_KEY = 'inventory_novelties_v1';

  function _readNovelties() {
    try { return JSON.parse(localStorage.getItem(NOVELTY_KEY)) || {}; }
    catch { return {}; }
  }
  function _writeNovelties(data) {
    localStorage.setItem(NOVELTY_KEY, JSON.stringify(data));
  }

  function saveNovelty(zoneId, noveltyData) {
    const all = _readNovelties();
    if (!all[zoneId]) all[zoneId] = [];
    const idx = all[zoneId].findIndex(n => n.id === noveltyData.id);
    if (idx >= 0) {
      all[zoneId][idx] = { ...all[zoneId][idx], ...noveltyData };
    } else {
      all[zoneId].push(InventoryData.createNovelty(noveltyData.text || ''));
    }
    _writeNovelties(all);
    return Promise.resolve(noveltyData);
  }

  function deleteNovelty(zoneId, noveltyId) {
    const all = _readNovelties();
    if (!all[zoneId]) return Promise.resolve(false);
    all[zoneId] = all[zoneId].filter(n => n.id !== noveltyId);
    _writeNovelties(all);
    return Promise.resolve(true);
  }

  function toggleNoveltyConfirmation(zoneId, noveltyId, isConfirmed) {
    const all = _readNovelties();
    if (!all[zoneId]) return Promise.resolve(null);
    const nov = all[zoneId].find(n => n.id === noveltyId);
    if (!nov) return Promise.resolve(null);
    nov.confirmed = isConfirmed;
    nov.confirmedAt = isConfirmed ? new Date().toISOString() : null;
    _writeNovelties(all);
    return Promise.resolve(nov);
  }

  // ---------------------------------------------------------------------------
  // Compatibilidad con llamadas síncronas del código antiguo
  // ---------------------------------------------------------------------------

  /** No-op: la persistencia es automática en Supabase. */
  function saveCurrentState() {
    return Promise.resolve(true);
  }

  /** No se usa con Supabase pero se deja por compatibilidad. */
  function saveAllZones() {
    return Promise.resolve();
  }

  // ---------------------------------------------------------------------------
  // API pública
  // ---------------------------------------------------------------------------
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
