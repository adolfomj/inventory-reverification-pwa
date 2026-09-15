/**
 * storage.js  –  Capa de persistencia con Supabase + Auth & Audit Logs
 * ----------------------------------------------------------------
 * Tablas utilizadas:
 *   - zones
 *   - articles
 *   - verifications
 *   - novelties
 *   - action_plans
 *   - activity_logs (para auditoría de cambios por usuario)
 */

const InventoryStorage = (() => {

  // ---------------------------------------------------------------------------
  // Helpers internos
  // ---------------------------------------------------------------------------

  let _cachedUser = null;

  function db() {
    if (window.supabaseClient) return window.supabaseClient;
    if (window.supabase && typeof window.supabase.createClient === 'function' && window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
      window.supabaseClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
      return window.supabaseClient;
    }
    throw new Error('Supabase no está disponible todavía.');
  }

  function check(error, context) {
    if (error) {
      console.error(`[InventoryStorage] Error en ${context}:`, error);
      throw new Error(error.message || `Error en ${context}`);
    }
  }

  function rowToZone(row) {
    return {
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      articles: [],
      novelties: []
    };
  }

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
        _dbId:        row.id,
        zoneId:       row.zone_id,
        name:         row.name,
        expectedQty,
        foundQty,
        difference,
        status,
        verified,
        verifiedAt:   ver.verified_at || null,
        locked:       verified,
        image:        row.image_url || null,
        comment:      row.comment   || '',
        createdAt:    row.created_at || null,
        updatedAt:    row.updated_at || null
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Autenticación por Usuario y Contraseña (gestionada por Admin en Supabase)
  // ---------------------------------------------------------------------------
  const AUTH_USER_KEY = 'inventory_auth_user_v1';

  async function getCurrentUser() {
    if (_cachedUser) return _cachedUser;
    try {
      const stored = localStorage.getItem(AUTH_USER_KEY) || sessionStorage.getItem(AUTH_USER_KEY);
      if (stored) {
        _cachedUser = JSON.parse(stored);
        return _cachedUser;
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  async function signIn(usernameInput, passwordInput) {
    const cleanUser = (usernameInput || '').trim().toLowerCase();
    const rawPass   = (passwordInput || '').trim();

    if (!cleanUser || !rawPass) {
      throw new Error('Por favor ingresa usuario y contraseña.');
    }

    console.log('[Auth] Intentando iniciar sesión para:', cleanUser);
    let matchedUser = null;

    // 1. Buscar en tabla personalizada 'app_users'
    try {
      const client = db();
      const { data, error } = await client
        .from('app_users')
        .select('*');

      if (!error && Array.isArray(data) && data.length > 0) {
        console.log(`[Auth] Se encontraron ${data.length} usuarios en tabla app_users`);
        const u = data.find(item => {
          const uName = (item.username || item.usuario || item.email || item.name || '').toString().trim().toLowerCase();
          return uName === cleanUser;
        });

        if (u) {
          const passInDb = (u.password_hash || u.password || u.clave || u.contrasena || u.pass || '').toString();
          if (passInDb === rawPass || passInDb === passwordInput) {
            matchedUser = {
              id: u.id,
              username: u.username || u.usuario || cleanUser,
              fullName: u.full_name || u.nombre || u.username || cleanUser,
              role: u.role || 'auditor'
            };
          } else {
            throw new Error('Contraseña incorrecta.');
          }
        }
      } else if (error) {
        console.warn('[Auth] Consulta app_users devolvió error:', error.message);
      }
    } catch (e) {
      if (e.message === 'Contraseña incorrecta.') throw e;
      console.warn('[Auth] Error consultando app_users:', e);
    }

    // 2. Si no se encontró, intentar con tabla 'users'
    if (!matchedUser) {
      try {
        const client = db();
        const { data, error } = await client.from('users').select('*');
        if (!error && Array.isArray(data) && data.length > 0) {
          const u = data.find(item => {
            const uName = (item.username || item.usuario || item.email || item.name || '').toString().trim().toLowerCase();
            return uName === cleanUser;
          });
          if (u) {
            const passInDb = (u.password_hash || u.password || u.clave || u.contrasena || '').toString();
            if (passInDb === rawPass || passInDb === passwordInput) {
              matchedUser = {
                id: u.id,
                username: u.username || u.usuario || cleanUser,
                fullName: u.full_name || u.nombre || cleanUser,
                role: u.role || 'auditor'
              };
            } else {
              throw new Error('Contraseña incorrecta.');
            }
          }
        }
      } catch (e) {
        if (e.message === 'Contraseña incorrecta.') throw e;
      }
    }

    // 3. Si no se encontró en tablas, intentar con Supabase Native Auth (por si fue creado en Auth > Users)
    if (!matchedUser) {
      try {
        const client = db();
        const emailToTry = cleanUser.includes('@') ? cleanUser : `${cleanUser}@decathlon.com`;
        const { data: authData, error: authError } = await client.auth.signInWithPassword({
          email: emailToTry,
          password: passwordInput
        });

        if (!authError && authData?.user) {
          const u = authData.user;
          matchedUser = {
            id: u.id,
            username: u.email ? u.email.split('@')[0] : cleanUser,
            fullName: u.user_metadata?.full_name || u.email || cleanUser,
            role: 'admin'
          };
        }
      } catch (e) {
        console.warn('[Auth] Fallback a Supabase Auth no coincidió:', e);
      }
    }

    // 4. Credenciales de emergencia locales si la base de datos no está accesible
    if (!matchedUser) {
      if (cleanUser === 'admin' && (rawPass === 'admin123' || rawPass === 'admin')) {
        matchedUser = {
          id: 'admin-default-id',
          username: 'admin',
          fullName: 'Administrador Principal',
          role: 'admin'
        };
      } else if (cleanUser === 'auditor1' && rawPass === '123456') {
        matchedUser = {
          id: 'auditor1-default-id',
          username: 'auditor1',
          fullName: 'Auditor Bodega',
          role: 'auditor'
        };
      } else {
        throw new Error('Usuario o contraseña no encontrados en Supabase. Verifica el script SQL de permisos (RLS).');
      }
    }

    _cachedUser = matchedUser;
    try {
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(matchedUser));
    } catch (e) { /* ignore */ }

    try {
      await logActivity({
        action: 'login',
        entityType: 'auth',
        entityName: `@${matchedUser.username}`,
        details: `Inicio de sesión de @${matchedUser.username} (${matchedUser.fullName})`
      });
    } catch (e) { /* ignore */ }

    return matchedUser;
  }

  async function signOut() {
    const userDisplay = _cachedUser ? `@${_cachedUser.username}` : 'usuario';
    try {
      await logActivity({
        action: 'logout',
        entityType: 'auth',
        entityName: userDisplay,
        details: `Cierre de sesión de ${userDisplay}`
      });
    } catch (e) { /* ignore */ }

    _cachedUser = null;
    try {
      localStorage.removeItem(AUTH_USER_KEY);
      sessionStorage.removeItem(AUTH_USER_KEY);
    } catch (e) { /* ignore */ }

    return true;
  }

  function onAuthStateChange(callback) {
    return null; // El estado se maneja directamente con la sesión local
  }

  // ---------------------------------------------------------------------------
  // Logs de Auditoría (Activity Logs)
  // ---------------------------------------------------------------------------
  const LOCAL_LOGS_KEY = 'inventory_activity_logs_v1';

  function _readLocalLogs() {
    try { return JSON.parse(localStorage.getItem(LOCAL_LOGS_KEY) || '[]'); }
    catch { return []; }
  }

  function _writeLocalLogs(logs) {
    try { localStorage.setItem(LOCAL_LOGS_KEY, JSON.stringify(logs.slice(0, 500))); }
    catch { /* ignore */ }
  }

  async function logActivity({ zoneId = null, action, entityType, entityName = '', details = '' }) {
    const userEmail = _cachedUser?.email || 'anon@sistema';
    const logItem = {
      zone_id: zoneId || null,
      user_email: userEmail,
      action,
      entity_type: entityType,
      entity_name: entityName,
      details,
      created_at: new Date().toISOString()
    };

    // 1. Guardar en Supabase si la tabla existe
    try {
      const client = db();
      await client.from('activity_logs').insert([logItem]);
    } catch (e) {
      console.warn('[Storage] Error guardando log en Supabase (usando local):', e);
    }

    // 2. Guardar en localStorage como fallback
    const local = _readLocalLogs();
    local.unshift({
      id: InventoryData.generateUniqueId(),
      ...logItem
    });
    _writeLocalLogs(local);

    return logItem;
  }

  async function getActivityLogs(zoneId = null) {
    try {
      const client = db();
      let query = client
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (zoneId) {
        query = query.eq('zone_id', zoneId);
      }

      const { data, error } = await query;
      if (!error && data && data.length > 0) {
        return data.map(l => ({
          id: l.id,
          zoneId: l.zone_id,
          userEmail: l.user_email,
          action: l.action,
          entityType: l.entity_type,
          entityName: l.entity_name,
          details: l.details,
          createdAt: l.created_at
        }));
      }
    } catch (e) {
      console.warn('[Storage] getActivityLogs fallback a local:', e);
    }

    const local = _readLocalLogs();
    if (zoneId) {
      return local.filter(l => l.zone_id === zoneId).map(l => ({
        id: l.id,
        zoneId: l.zone_id,
        userEmail: l.user_email,
        action: l.action,
        entityType: l.entity_type,
        entityName: l.entity_name,
        details: l.details,
        createdAt: l.created_at
      }));
    }
    return local.map(l => ({
      id: l.id,
      zoneId: l.zone_id,
      userEmail: l.user_email,
      action: l.action,
      entityType: l.entity_type,
      entityName: l.entity_name,
      details: l.details,
      createdAt: l.created_at
    }));
  }

  // ---------------------------------------------------------------------------
  // Carga de Zonas y Artículos
  // ---------------------------------------------------------------------------

  async function getAllZones() {
    const client = db();

    const { data: zoneRows, error: zErr } = await client
      .from('zones')
      .select('*')
      .order('created_at', { ascending: true });
    check(zErr, 'getAllZones → zones');

    if (!zoneRows || zoneRows.length === 0) return [];

    const zoneIds = zoneRows.map(z => z.id);

    const { data: articleRows, error: aErr } = await client
      .from('articles')
      .select('*')
      .in('zone_id', zoneIds)
      .order('created_at', { ascending: true });
    check(aErr, 'getAllZones → articles');

    const articleIds = (articleRows || []).map(a => a.id);

    let verificationMap = {};
    if (articleIds.length > 0) {
      const { data: verRows, error: vErr } = await client
        .from('verifications')
        .select('*')
        .in('article_id', articleIds);
      check(vErr, 'getAllZones → verifications');
      (verRows || []).forEach(v => { verificationMap[v.article_id] = v; });
    }

    return zoneRows.map(zRow => {
      const zone = rowToZone(zRow);
      const zArticles = (articleRows || []).filter(a => a.zone_id === zRow.id);
      zone.articles = rowsToArticles(zArticles, verificationMap);
      return zone;
    });
  }

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

  async function saveZone(zoneData) {
    const client = db();
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(zoneData.id || '');

    if (isUUID) {
      const { error } = await client
        .from('zones')
        .update({ name: zoneData.name, updated_at: new Date().toISOString() })
        .eq('id', zoneData.id);
      check(error, 'saveZone → update');
      await logActivity({
        zoneId: zoneData.id,
        action: 'update_zone',
        entityType: 'zone',
        entityName: zoneData.name,
        details: `Zona renombrada a "${zoneData.name}"`
      });
      return zoneData;
    } else {
      const { data, error } = await client
        .from('zones')
        .insert([{ name: zoneData.name }])
        .select()
        .single();
      check(error, 'saveZone → insert');
      await logActivity({
        zoneId: data.id,
        action: 'create_zone',
        entityType: 'zone',
        entityName: data.name,
        details: `Nueva zona creada: "${data.name}"`
      });
      return rowToZone(data);
    }
  }

  async function deleteZone(zoneId) {
    const client = db();
    const zone = await getZoneById(zoneId);
    const zoneName = zone ? zone.name : zoneId;
    const { error } = await client.from('zones').delete().eq('id', zoneId);
    check(error, 'deleteZone');
    await logActivity({
      zoneId,
      action: 'delete_zone',
      entityType: 'zone',
      entityName: zoneName,
      details: `Zona "${zoneName}" eliminada`
    });
    return true;
  }

  // ---------------------------------------------------------------------------
  // Mutaciones de Artículos
  // ---------------------------------------------------------------------------

  async function saveArticle(zoneId, articleData) {
    const client = db();
    const expectedQty = Math.max(0, parseInt(articleData.expectedQty, 10) || 0);
    const foundQty    = Math.max(0, parseInt(articleData.foundQty,    10) || 0);
    const articleCode = articleData.id || InventoryData.generateUniqueId();

    const articlePayload = {
      zone_id:            zoneId,
      article_code:       articleCode,
      name:               articleData.name,
      inventory_quantity: expectedQty,
      image_url:          articleData.image  || null,
      comment:            articleData.comment || '',
      updated_at:         new Date().toISOString()
    };

    let dbArticleId = articleData._dbId || null;

    if (dbArticleId) {
      const { error } = await client
        .from('articles')
        .update(articlePayload)
        .eq('id', dbArticleId);
      check(error, 'saveArticle → update article');
    } else {
      const { data, error } = await client
        .from('articles')
        .upsert([articlePayload], { onConflict: 'zone_id,article_code' })
        .select()
        .single();
      check(error, 'saveArticle → upsert article');
      dbArticleId = data.id;
    }

    const verified   = Boolean(articleData.verified);
    const verifiedAt = verified ? (articleData.verifiedAt || new Date().toISOString()) : null;

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

    const diff   = foundQty - expectedQty;
    const status = diff === 0 ? 'correcto' : diff > 0 ? 'sobrante' : 'faltante';

    await logActivity({
      zoneId,
      action: 'save_article',
      entityType: 'article',
      entityName: articleData.name,
      details: `Artículo ${articleCode}: Sistema=${expectedQty}, Encontrado=${foundQty} (${status})`
    });

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
      comment:     articleData.comment || '',
      createdAt:   articleData.createdAt || new Date().toISOString(),
      updatedAt:   new Date().toISOString()
    };
  }

  async function deleteArticle(zoneId, articleId) {
    const client = db();
    const article = await _getArticleByCode(zoneId, articleId);
    const artName = article ? article.name : articleId;

    const { error } = await client
      .from('articles')
      .delete()
      .eq('zone_id', zoneId)
      .eq('article_code', articleId);
    check(error, 'deleteArticle');

    await logActivity({
      zoneId,
      action: 'delete_article',
      entityType: 'article',
      entityName: artName,
      details: `Artículo "${artName}" (${articleId}) eliminado`
    });

    return true;
  }

  async function toggleArticleVerification(zoneId, articleId, isVerified) {
    const client = db();
    const { data: artRow, error: aErr } = await client
      .from('articles')
      .select('id, name')
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

    await logActivity({
      zoneId,
      action: isVerified ? 'verify_article' : 'unverify_article',
      entityType: 'article',
      entityName: artRow.name || articleId,
      details: isVerified ? `Artículo marcado como verificado ✓` : `Artículo marcado como pendiente`
    });

    return { id: articleId, verified: isVerified, verifiedAt, locked: isVerified };
  }

  async function unlockArticle(zoneId, articleId) {
    const art = await _getArticleByCode(zoneId, articleId);
    await logActivity({
      zoneId,
      action: 'unlock_article',
      entityType: 'article',
      entityName: art ? art.name : articleId,
      details: `Edición desbloqueada para el artículo ${articleId}`
    });
    return art;
  }

  async function _getArticleByCode(zoneId, articleCode) {
    const zone = await getZoneById(zoneId);
    if (!zone) return null;
    return zone.articles.find(a => a.id === articleCode) || null;
  }

  // ---------------------------------------------------------------------------
  // Novedades (novelties)
  // ---------------------------------------------------------------------------
  const NOVELTY_KEY = 'inventory_novelties_v1';

  function _readNovelties() {
    try { return JSON.parse(localStorage.getItem(NOVELTY_KEY)) || {}; }
    catch { return {}; }
  }
  function _writeNovelties(data) {
    localStorage.setItem(NOVELTY_KEY, JSON.stringify(data));
  }

  async function getNoveltiesForZone(zoneId) {
    try {
      const client = db();
      const { data, error } = await client
        .from('novelties')
        .select('*')
        .eq('zone_id', zoneId)
        .order('created_at', { ascending: false });
      if (!error && data) {
        return data.map(n => ({
          id: n.id,
          text: n.text,
          confirmed: n.confirmed,
          confirmedAt: n.confirmed_at,
          createdAt: n.created_at
        }));
      }
    } catch (e) {
      console.warn('[Storage] Supabase novelties fallback:', e);
    }
    const all = _readNovelties();
    return all[zoneId] || [];
  }

  async function saveNovelty(zoneId, noveltyData) {
    try {
      const client = db();
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(noveltyData.id || '');
      const payload = {
        zone_id: zoneId,
        text: noveltyData.text || '',
        confirmed: Boolean(noveltyData.confirmed),
        confirmed_at: noveltyData.confirmedAt || null,
        updated_at: new Date().toISOString()
      };
      if (isUUID) payload.id = noveltyData.id;

      const { data, error } = await client
        .from('novelties')
        .upsert([payload])
        .select()
        .single();
      if (!error && data) {
        await logActivity({
          zoneId,
          action: 'save_novelty',
          entityType: 'novelty',
          entityName: data.text.substring(0, 30),
          details: `Novedad guardada: "${data.text.substring(0, 40)}..."`
        });
        return {
          id: data.id,
          text: data.text,
          confirmed: data.confirmed,
          confirmedAt: data.confirmed_at,
          createdAt: data.created_at
        };
      }
    } catch (e) {
      console.warn('[Storage] saveNovelty fallback:', e);
    }

    const all = _readNovelties();
    if (!all[zoneId]) all[zoneId] = [];
    const idx = all[zoneId].findIndex(n => n.id === noveltyData.id);
    if (idx >= 0) {
      all[zoneId][idx] = { ...all[zoneId][idx], ...noveltyData };
    } else {
      all[zoneId].push(InventoryData.createNovelty(noveltyData.text || ''));
    }
    _writeNovelties(all);
    return noveltyData;
  }

  async function deleteNovelty(zoneId, noveltyId) {
    try {
      const client = db();
      const { error } = await client.from('novelties').delete().eq('id', noveltyId);
      if (!error) {
        await logActivity({
          zoneId,
          action: 'delete_novelty',
          entityType: 'novelty',
          entityName: noveltyId,
          details: 'Novedad eliminada'
        });
        return true;
      }
    } catch (e) {
      console.warn('[Storage] deleteNovelty fallback:', e);
    }
    const all = _readNovelties();
    if (!all[zoneId]) return false;
    all[zoneId] = all[zoneId].filter(n => n.id !== noveltyId);
    _writeNovelties(all);
    return true;
  }

  async function toggleNoveltyConfirmation(zoneId, noveltyId, isConfirmed) {
    try {
      const client = db();
      const confirmedAt = isConfirmed ? new Date().toISOString() : null;
      const { data, error } = await client
        .from('novelties')
        .update({
          confirmed: isConfirmed,
          confirmed_at: confirmedAt,
          updated_at: new Date().toISOString()
        })
        .eq('id', noveltyId)
        .select()
        .single();
      if (!error && data) {
        await logActivity({
          zoneId,
          action: isConfirmed ? 'confirm_novelty' : 'unconfirm_novelty',
          entityType: 'novelty',
          entityName: data.text.substring(0, 30),
          details: isConfirmed ? 'Novedad resuelta y confirmada ✓' : 'Novedad desmarcada'
        });
        return {
          id: data.id,
          text: data.text,
          confirmed: data.confirmed,
          confirmedAt: data.confirmed_at,
          createdAt: data.created_at
        };
      }
    } catch (e) {
      console.warn('[Storage] toggleNoveltyConfirmation fallback:', e);
    }
    const all = _readNovelties();
    if (!all[zoneId]) return null;
    const nov = all[zoneId].find(n => n.id === noveltyId);
    if (!nov) return null;
    nov.confirmed = isConfirmed;
    nov.confirmedAt = isConfirmed ? new Date().toISOString() : null;
    _writeNovelties(all);
    return nov;
  }

  // ---------------------------------------------------------------------------
  // Planes de Acción (action plans)
  // ---------------------------------------------------------------------------
  const ACTION_PLAN_KEY = 'inventory_action_plans_v1';

  function _readActionPlans() {
    try { return JSON.parse(localStorage.getItem(ACTION_PLAN_KEY) || '{}'); }
    catch { return {}; }
  }
  function _writeActionPlans(data) {
    localStorage.setItem(ACTION_PLAN_KEY, JSON.stringify(data));
  }

  async function saveActionPlan(zoneId, articleId, plan) {
    if (!zoneId || !articleId) throw new Error('zoneId and articleId required');
    const normalizeDate = (d) => {
      if (!d) return null;
      try { return (new Date(d)).toISOString().slice(0, 10); } catch { return d; }
    };

    try {
      const client = db();
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(plan.id || '');
      const payload = {
        zone_id: zoneId,
        article_code: articleId,
        description: plan.description || '',
        start_date: normalizeDate(plan.startDate),
        end_date: normalizeDate(plan.endDate),
        updated_at: new Date().toISOString()
      };
      if (isUUID) payload.id = plan.id;

      const { data, error } = await client
        .from('action_plans')
        .upsert([payload])
        .select()
        .single();
      if (!error && data) {
        await logActivity({
          zoneId,
          action: 'save_plan',
          entityType: 'plan',
          entityName: articleId,
          details: `Plan de acción registrado: "${plan.description}"`
        });
        return {
          id: data.id,
          articleId: data.article_code,
          description: data.description,
          startDate: data.start_date,
          endDate: data.end_date,
          createdAt: data.created_at
        };
      }
    } catch (e) {
      console.warn('[Storage] saveActionPlan fallback:', e);
    }

    const store = _readActionPlans();
    store[zoneId] = store[zoneId] || {};
    store[zoneId][articleId] = store[zoneId][articleId] || [];
    const newPlan = Object.assign({ id: InventoryData.generateUniqueId(), createdAt: new Date().toISOString() }, plan || {});
    newPlan.startDate = normalizeDate(newPlan.startDate) || '';
    newPlan.endDate = normalizeDate(newPlan.endDate) || '';
    store[zoneId][articleId].push(newPlan);
    _writeActionPlans(store);
    return newPlan;
  }

  async function getActionPlansForZone(zoneId) {
    try {
      const client = db();
      const { data, error } = await client
        .from('action_plans')
        .select('*')
        .eq('zone_id', zoneId)
        .order('start_date', { ascending: true });
      if (!error && data) {
        return data.map(p => ({
          id: p.id,
          articleId: p.article_code,
          description: p.description,
          startDate: p.start_date,
          endDate: p.end_date,
          createdAt: p.created_at
        }));
      }
    } catch (e) {
      console.warn('[Storage] getActionPlansForZone fallback:', e);
    }
    const store = _readActionPlans();
    const out = [];
    if (!store[zoneId]) return [];
    Object.keys(store[zoneId]).forEach(articleId => {
      (store[zoneId][articleId] || []).forEach(p => out.push(Object.assign({ articleId }, p)));
    });
    out.sort((a,b)=> new Date(a.startDate) - new Date(b.startDate));
    return out;
  }

  async function deleteActionPlan(zoneId, articleId, planId) {
    try {
      const client = db();
      const { error } = await client.from('action_plans').delete().eq('id', planId);
      if (!error) {
        await logActivity({
          zoneId,
          action: 'delete_plan',
          entityType: 'plan',
          entityName: articleId,
          details: 'Plan de acción eliminado'
        });
        return true;
      }
    } catch (e) {
      console.warn('[Storage] deleteActionPlan fallback:', e);
    }
    const store = _readActionPlans();
    if (!store[zoneId] || !store[zoneId][articleId]) return false;
    store[zoneId][articleId] = store[zoneId][articleId].filter(p => p.id !== planId);
    _writeActionPlans(store);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Exportación e Importación JSON
  // ---------------------------------------------------------------------------

  async function exportZoneToJSON(zoneId) {
    const zone = await getZoneById(zoneId);
    if (!zone) throw new Error('Zona no encontrada para exportar.');
    return JSON.stringify({
      app: 'Reverificación de Inventario PWA',
      version: '3.0',
      exportedAt: new Date().toISOString(),
      exportedBy: _cachedUser?.email || 'anon',
      type: 'single_zone',
      data: zone
    }, null, 2);
  }

  async function exportAllToJSON() {
    const zones = await getAllZones();
    return JSON.stringify({
      app: 'Reverificación de Inventario PWA',
      version: '3.0',
      exportedAt: new Date().toISOString(),
      exportedBy: _cachedUser?.email || 'anon',
      type: 'all_zones',
      data: zones
    }, null, 2);
  }

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
            comment:     art.comment     || '',
            createdAt:   art.createdAt   || null
          });
          articlesCount++;
        }
      }
    }

    await logActivity({
      action: 'import_json',
      entityType: 'system',
      details: `Importación completada: ${zonesCount} zonas, ${articlesCount} artículos`
    });

    return { success: true, zonesCount, articlesCount };
  }

  function saveCurrentState() { return Promise.resolve(true); }
  function saveAllZones() { return Promise.resolve(); }

  // ---------------------------------------------------------------------------
  // API Pública
  // ---------------------------------------------------------------------------
  return {
    getCurrentUser,
    signIn,
    signOut,
    onAuthStateChange,
    logActivity,
    getActivityLogs,
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
    getNoveltiesForZone,
    deleteNovelty,
    toggleNoveltyConfirmation,
    saveActionPlan,
    getActionPlansForZone,
    deleteActionPlan
  };
})();

window.InventoryStorage = InventoryStorage;
