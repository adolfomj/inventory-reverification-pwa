/**
 * ui.js
 * Módulo de interfaz de usuario para la PWA de Reverificación de Inventario.
 * Maneja el renderizado de vistas, modales, alertas, toasts, login, logs y agrupación por fechas.
 */

const InventoryUI = (() => {

  // Elementos principales del DOM
  const elements = {
    // Auth & App Shell
    authView: document.getElementById('auth-view'),
    appShell: document.getElementById('app-shell'),
    loginForm: document.getElementById('login-form'),
    loginUsername: document.getElementById('login-username'),
    loginPassword: document.getElementById('login-password'),
    loginError: document.getElementById('login-error'),
    loginSubmit: document.getElementById('login-submit'),
    loginSubmitText: document.getElementById('login-submit-text'),
    authTitle: document.getElementById('auth-title'),
    authDesc: document.getElementById('auth-desc'),

    // Encabezado
    appHeader: document.getElementById('app-header'),
    headerTitle: document.getElementById('header-title'),
    headerSubtitle: document.getElementById('header-subtitle'),
    btnBack: document.getElementById('btn-back'),
    userChip: document.getElementById('user-chip'),
    userChipEmail: document.getElementById('user-chip-email'),
    btnLogout: document.getElementById('btn-logout'),
    btnBackupExport: document.getElementById('btn-backup-export'),
    btnBackupImport: document.getElementById('btn-backup-import'),
    btnGlobalImport: document.getElementById('btn-global-import'),
    btnGlobalExport: document.getElementById('btn-global-export'),
    themeToggleBtn: document.getElementById('theme-toggle-btn'),
    btnExportZone: document.getElementById('btn-export-zone'),
    
    // Contenedores de Vistas
    zonesView: document.getElementById('zones-view'),
    zoneDetailView: document.getElementById('zone-detail-view'),

    // Elementos de la vista de Zonas
    zonesListContainer: document.getElementById('zones-list-container'),
    zoneSearchInput: document.getElementById('zone-search-input'),
    zonesAdminFilters: document.getElementById('zones-admin-filters'),
    fabAddZone: document.getElementById('fab-add-zone'),

    // Elementos de la vista de Detalle de Zona
    statsContainer: document.getElementById('stats-container'),
    btnShareSummary: document.getElementById('btn-share-summary'),
    btnExportCsv: document.getElementById('btn-export-csv'),
    btnScanBarcode: document.getElementById('btn-scan-barcode'),
    articleSearchInput: document.getElementById('article-search-input'),
    filterTabs: document.querySelectorAll('#filter-bar .filter-tab'),
    articlesListContainer: document.getElementById('articles-list-container'),
    fabAddArticle: document.getElementById('fab-add-article'),
    // Control de Sub-vistas (Artículos vs Novedades vs Logs)
    btnToggleArticles: document.getElementById('btn-toggle-articles'),
    btnToggleNovelties: document.getElementById('btn-toggle-novelties'),
    btnToggleLogs: document.getElementById('btn-toggle-logs'),
    articlesSubView: document.getElementById('articles-sub-view'),
    noveltiesSubView: document.getElementById('novelties-sub-view'),
    logsSubView: document.getElementById('logs-sub-view'),
    noveltiesListContainer: document.getElementById('novelties-list-container'),
    noveltyStatsContainer: document.getElementById('novelty-stats-container'),
    logsListContainer: document.getElementById('logs-list-container'),
    fabAddNovelty: document.getElementById('fab-add-novelty'),

    // Desplegable de Actividad y Logs
    activitySidebar: document.getElementById('activity-sidebar'),
    activityDropdownBackdrop: document.getElementById('activity-dropdown-backdrop'),
    activitySidebarFeed: document.getElementById('activity-sidebar-feed'),
    btnRefreshSidebar: document.getElementById('btn-refresh-sidebar'),
    btnToggleActivity: document.getElementById('btn-toggle-activity'),
    btnCloseActivity: document.getElementById('btn-close-activity'),

    // Modales y Diálogos
    modalContainer: document.getElementById('modal-container'),
    toastContainer: document.getElementById('toast-container')
  };

  /**
   * Muestra un mensaje flotante Toast (notificación).
   * @param {string} message - Texto del mensaje.
   * @param {'success' | 'warning' | 'error' | 'info'} type - Tipo de notificación.
   */
  function showToast(message, type = 'info') {
    if (!elements.toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'info';
    if (type === 'success') icon = 'check_circle';
    if (type === 'warning') icon = 'warning';
    if (type === 'error') icon = 'error';

    toast.innerHTML = `
      <span class="material-symbols-outlined toast-icon">${icon}</span>
      <span class="toast-message">${escapeHTML(message)}</span>
    `;

    elements.toastContainer.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  /**
   * Previene inyección XSS escapando HTML.
   * @param {string} str 
   * @returns {string} String seguro.
   */
  function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Métodos para abrir y cerrar el desplegable de Últimos Cambios
   */
  function openActivityDropdown() {
    elements.activitySidebar?.classList.remove('hidden');
    elements.activityDropdownBackdrop?.classList.remove('hidden');
    elements.btnToggleActivity?.classList.add('active');
  }

  function closeActivityDropdown() {
    elements.activitySidebar?.classList.add('hidden');
    elements.activityDropdownBackdrop?.classList.add('hidden');
    elements.btnToggleActivity?.classList.remove('active');
  }

  function toggleActivityDropdown() {
    const isHidden = elements.activitySidebar?.classList.contains('hidden');
    if (isHidden) {
      openActivityDropdown();
      return true;
    } else {
      closeActivityDropdown();
      return false;
    }
  }

  function isActivityDropdownOpen() {
    return !elements.activitySidebar?.classList.contains('hidden');
  }

  /**
   * Control de pantalla de autenticación y Shell de la app
   */
  function showAuthView() {
    if (elements.authView) elements.authView.classList.remove('hidden');
    if (elements.appShell) elements.appShell.classList.add('hidden');
    
    closeActivityDropdown();
    elements.btnToggleActivity?.classList.add('hidden');
    elements.btnToggleLogs?.classList.add('hidden');
    elements.zonesAdminFilters?.classList.add('hidden');
  }

  function showAppShell(user) {
    if (elements.authView) elements.authView.classList.add('hidden');
    if (elements.appShell) elements.appShell.classList.remove('hidden');

    const isAdmin = user && (user.role === 'admin');
    const roleLabel = isAdmin ? 'Admin' : 'Auditor';
    const displayName = user?.username ? `@${user.username}` : (user?.fullName || 'Usuario');

    if (elements.userChipEmail && user) {
      elements.userChipEmail.textContent = `${displayName} (${roleLabel})`;
    }

    // El botón desplegable de Últimos Cambios está disponible para TODOS los usuarios logueados
    elements.btnToggleActivity?.classList.remove('hidden');
    closeActivityDropdown();

    // La pestaña "Historial / Logs" totales y los filtros de visibilidad de zona solo son visibles para el Admin
    if (isAdmin) {
      elements.btnToggleLogs?.classList.remove('hidden');
      elements.zonesAdminFilters?.classList.remove('hidden');
    } else {
      elements.btnToggleLogs?.classList.add('hidden');
      elements.zonesAdminFilters?.classList.add('hidden');
      switchSubView('articles');
    }
  }

  /**
   * Muestra la vista de Lista de Zonas.
   */
  function showZonesView() {
    elements.zonesView.classList.remove('hidden');
    elements.zoneDetailView.classList.add('hidden');
    elements.btnBack.classList.add('hidden');
    elements.btnExportZone.classList.add('hidden');
    elements.headerTitle.textContent = 'Zonas de Responsabilidad';
    elements.headerSubtitle.textContent = 'Reverificación de Inventario';
  }

  /**
   * Muestra la vista de Detalle de Zona.
   * @param {Object} zone 
   */
  function showZoneDetailView(zone) {
    elements.zonesView.classList.add('hidden');
    elements.zoneDetailView.classList.remove('hidden');
    elements.btnBack.classList.remove('hidden');
    elements.btnExportZone.classList.remove('hidden');
    elements.headerTitle.textContent = zone.name;

    const createdBy = zone.createdBy || '@admin';
    const updatedBy = zone.updatedBy || zone.createdBy || '@admin';
    elements.headerSubtitle.textContent = `👤 Creado por ${escapeHTML(createdBy)} (${InventoryData.formatDate(zone.createdAt)}) • ✏️ Modif: ${escapeHTML(updatedBy)} (${InventoryData.getRelativeTime(zone.updatedAt || zone.createdAt)})`;
    switchSubView('articles');
  }

  /**
   * Cambia entre sub-vistas: 'articles', 'novelties', 'logs'
   */
  function switchSubView(subViewName) {
    // Si se intenta entrar a logs pero el botón está oculto (no admin), forzar artículos
    let target = subViewName;
    if (target === 'logs' && elements.btnToggleLogs?.classList.contains('hidden')) {
      target = 'articles';
    }

    const isArticles = target === 'articles';
    const isNovelties = target === 'novelties';
    const isLogs = target === 'logs';

    elements.btnToggleArticles?.classList.toggle('active', isArticles);
    elements.btnToggleNovelties?.classList.toggle('active', isNovelties);
    elements.btnToggleLogs?.classList.toggle('active', isLogs);

    elements.articlesSubView?.classList.toggle('hidden', !isArticles);
    elements.noveltiesSubView?.classList.toggle('hidden', !isNovelties);
    elements.logsSubView?.classList.toggle('hidden', !isLogs);
  }

  /**
   * Renderiza las tarjetas de la lista de Zonas de Responsabilidad.
   * @param {Array} zones 
   * @param {string} searchQuery 
   * @param {Object} callbacks 
   * @param {boolean} isAdmin - Si es admin puede ver/gestionar zonas ocultas
   * @param {string} zoneFilter - 'all' | 'visible' | 'hidden'
   */
  function renderZonesList(zones, searchQuery = '', callbacks = {}, isAdmin = false, zoneFilter = 'all') {
    const container = elements.zonesListContainer;
    container.innerHTML = '';

    // Actualizar contadores en la barra de filtros de admin
    const countAll = document.getElementById('count-all-zones');
    const countVis = document.getElementById('count-visible-zones');
    const countHid = document.getElementById('count-hidden-zones');
    if (countAll) countAll.textContent = zones.length;
    if (countVis) countVis.textContent = zones.filter(z => !z.hidden).length;
    if (countHid) countHid.textContent = zones.filter(z => Boolean(z.hidden)).length;

    const query = searchQuery.trim().toLowerCase();

    // Filtrado por rol y por pestaña
    let filteredZones = zones.filter(z => z.name.toLowerCase().includes(query));
    if (!isAdmin) {
      // Los auditores NUNCA ven zonas ocultas
      filteredZones = filteredZones.filter(z => !z.hidden);
    } else {
      // El admin puede filtrar por Todas, Activas o Ocultas
      if (zoneFilter === 'visible') {
        filteredZones = filteredZones.filter(z => !z.hidden);
      } else if (zoneFilter === 'hidden') {
        filteredZones = filteredZones.filter(z => Boolean(z.hidden));
      }
    }

    if (filteredZones.length === 0) {
      const msg = !isAdmin 
        ? 'No hay zonas activas registradas' 
        : (zoneFilter === 'hidden' ? 'No hay zonas ocultas' : 'No se encontraron zonas');
      container.innerHTML = `
        <div class="empty-state">
          <span class="material-symbols-outlined empty-icon">inventory_2</span>
          <h3>${msg}</h3>
          <p>${query ? 'Intenta buscar con otros términos.' : 'Presiona el botón "+" para crear tu primera zona de responsabilidad.'}</p>
        </div>
      `;
      return;
    }

    filteredZones.forEach(zone => {
      const stats = InventoryData.calculateZoneStats(zone.articles);
      const card = document.createElement('div');
      const isHidden = Boolean(zone.hidden);
      card.className = `zone-card surface-card ripple${isHidden ? ' zone-hidden' : ''}`;
      card.dataset.id = zone.id;

      const createdUser = zone.createdBy || '@admin';
      const updatedUser = zone.updatedBy || zone.createdBy || '@admin';

      // Botón de visibilidad — solo para admin
      const visibilityBtn = isAdmin ? `
        <button class="icon-btn btn-toggle-zone-visibility ${isHidden ? 'zone-is-hidden' : ''}"
          title="${isHidden ? 'Mostrar zona' : 'Ocultar zona'}"
          data-id="${zone.id}"
          data-hidden="${isHidden}">
          <span class="material-symbols-outlined">${isHidden ? 'visibility' : 'visibility_off'}</span>
        </button>
      ` : '';

      // Badge "Oculta" visible solo para admin
      const hiddenBadge = isAdmin && isHidden ? `
        <span class="zone-hidden-badge">
          <span class="material-symbols-outlined text-icon">visibility_off</span>
          Oculta
        </span>
      ` : '';

      card.innerHTML = `
        <div class="zone-card-header">
          <div class="zone-info">
            <div class="zone-title-row">
              <h3 class="zone-title">${escapeHTML(zone.name)}</h3>
              ${hiddenBadge}
            </div>
            <span class="zone-date">
              <span class="material-symbols-outlined text-icon">calendar_today</span>
              ${InventoryData.formatDate(zone.createdAt)}
            </span>
          </div>
          <div class="zone-actions">
            ${visibilityBtn}
            <button class="icon-btn btn-delete-zone" title="Eliminar Zona" data-id="${zone.id}">
              <span class="material-symbols-outlined">delete</span>
            </button>
          </div>
        </div>

        <div class="zone-card-body">
          <div class="zone-metric">
            <span class="metric-label">Artículos</span>
            <span class="metric-value">${stats.total}</span>
          </div>
          <div class="zone-metric">
            <span class="metric-label">Verificados</span>
            <span class="metric-value font-semibold">${stats.verified} / ${stats.total}</span>
          </div>
          <div class="zone-metric">
            <span class="metric-label">Avance</span>
            <span class="metric-value font-bold ${stats.percentageVerified === 100 ? 'text-success' : ''}">${stats.percentageVerified}%</span>
          </div>
        </div>

        <div class="progress-bar-container">
          <div class="progress-bar-fill" style="width: ${stats.percentageVerified}%"></div>
        </div>

        <div class="zone-author-meta">
          <div class="author-item">
            <span class="material-symbols-outlined author-icon">person_add</span>
            <span>Creado por: <strong>${escapeHTML(createdUser)}</strong></span>
          </div>
          <div class="author-item">
            <span class="material-symbols-outlined author-icon">edit_note</span>
            <span>Modif: <strong>${escapeHTML(updatedUser)}</strong> (${InventoryData.getRelativeTime(zone.updatedAt || zone.createdAt)})</span>
          </div>
        </div>
      `;

      card.addEventListener('click', (e) => {
        // Botón de ocultar/mostrar (solo admin)
        if (e.target.closest('.btn-toggle-zone-visibility')) {
          e.stopPropagation();
          if (callbacks.onToggleZoneVisibility) callbacks.onToggleZoneVisibility(zone, !isHidden);
          return;
        }
        // Botón de eliminar
        if (e.target.closest('.btn-delete-zone')) {
          e.stopPropagation();
          if (callbacks.onDeleteZone) callbacks.onDeleteZone(zone);
          return;
        }
        // Click en la tarjeta — navegar a la zona (incluso si está oculta, admin puede entrar)
        if (callbacks.onSelectZone) callbacks.onSelectZone(zone.id);
      });

      container.appendChild(card);
    });
  }


  /**
   * Renderiza las tarjetas de estadísticas superiores dentro de una zona.
   * @param {Object} stats - Resumen obtenido de InventoryData.calculateZoneStats.
   */
  function renderStats(stats) {
    const container = elements.statsContainer;
    container.innerHTML = `
      <div class="stat-card stat-total">
        <span class="stat-value">${stats.total}</span>
        <span class="stat-label">Total</span>
      </div>
      <div class="stat-card stat-pending">
        <span class="stat-value">${stats.pending}</span>
        <span class="stat-label">Pendientes</span>
      </div>
      <div class="stat-card stat-verified">
        <span class="stat-value">${stats.verified}</span>
        <span class="stat-label">Verificados</span>
      </div>
      <div class="stat-card stat-faltante">
        <span class="stat-value">${stats.faltantes}</span>
        <span class="stat-label">Faltantes</span>
      </div>
      <div class="stat-card stat-sobrante">
        <span class="stat-value">${stats.sobrantes}</span>
        <span class="stat-label">Sobrantes</span>
      </div>
    `;
  }

  /**
   * Renderiza la lista de artículos agrupada por categorías de fecha y carpeta para antiguos (> 1 mes).
   * @param {Array} articles 
   * @param {string} currentFilter - 'todos', 'pendientes', 'verificados', 'faltantes', 'sobrantes'
   * @param {string} searchQuery 
   * @param {Object} callbacks 
   */
  function renderArticlesList(articles = [], currentFilter = 'todos', searchQuery = '', callbacks = {}) {
    const container = elements.articlesListContainer;
    container.innerHTML = '';

    const query = searchQuery.trim().toLowerCase();

    // 1. Filtro de búsqueda
    let filtered = articles.filter(art => {
      const matchId = (art.id || '').toLowerCase().includes(query);
      const matchName = (art.name || '').toLowerCase().includes(query);
      return matchId || matchName;
    });

    // 2. Filtro de estado
    if (currentFilter === 'pendientes') {
      filtered = filtered.filter(a => !a.verified);
    } else if (currentFilter === 'verificados') {
      filtered = filtered.filter(a => a.verified);
    } else if (currentFilter === 'faltantes') {
      filtered = filtered.filter(a => a.status === 'faltante');
    } else if (currentFilter === 'sobrantes') {
      filtered = filtered.filter(a => a.status === 'sobrante');
    } else if (currentFilter === 'reincidentes') {
      filtered = filtered.filter(a => Boolean(a.isRecurrent) || (a.discrepancyCount >= 2));
    }

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="material-symbols-outlined empty-icon">category</span>
          <h3>No se encontraron artículos</h3>
          <p>No existen registros que coincidan con la búsqueda o el filtro de estado seleccionado.</p>
        </div>
      `;
      return;
    }

    // 3. Separar en Recientes (<= 30 días) y Antiguos / Archivados (> 30 días / 1 mes)
    const recentArticles = [];
    const archivedArticles = [];

    filtered.forEach(art => {
      const dateVal = art.verifiedAt || art.updatedAt || art.createdAt;
      if (InventoryData.isOlderThanOneMonth(dateVal)) {
        archivedArticles.push(art);
      } else {
        recentArticles.push(art);
      }
    });

    // 4. Renderizar artículos recientes agrupados por fecha
    if (recentArticles.length > 0) {
      const dateGroups = InventoryData.groupItemsByDate(recentArticles, (art) => art.verifiedAt || art.updatedAt || art.createdAt);

      dateGroups.forEach(group => {
        const groupSection = document.createElement('div');
        groupSection.className = 'date-group-section';

        const isToday = group.category.startsWith('Hoy');
        const groupHeader = document.createElement('div');
        groupHeader.className = 'date-group-header';
        groupHeader.innerHTML = `
          <span class="date-group-badge ${isToday ? 'badge-today' : ''}">
            <span class="material-symbols-outlined text-icon">${isToday ? 'event_available' : 'calendar_month'}</span>
            ${escapeHTML(group.category)}
          </span>
          <span class="date-group-count">${group.items.length} ${group.items.length === 1 ? 'artículo' : 'artículos'}</span>
        `;
        groupSection.appendChild(groupHeader);

        const itemsContainer = document.createElement('div');
        itemsContainer.className = 'date-group-items';

        group.items.forEach(art => {
          const card = _createArticleCard(art, callbacks, false);
          itemsContainer.appendChild(card);
        });

        groupSection.appendChild(itemsContainer);
        container.appendChild(groupSection);
      });
    }

    // 5. Renderizar Carpeta de Artículos Antiguos (> 1 mes)
    if (archivedArticles.length > 0) {
      const folderWrapper = document.createElement('div');
      folderWrapper.className = 'archive-folder-wrapper';

      folderWrapper.innerHTML = `
        <div class="archive-folder-card surface-card">
          <div class="archive-folder-header">
            <div class="archive-folder-title">
              <span class="material-symbols-outlined folder-icon">folder_zip</span>
              <div>
                <h4>📁 Carpeta de Artículos Antiguos (> 1 mes)</h4>
                <span class="archive-folder-desc">Artículos registrados o verificados hace más de 30 días organizados en archivo.</span>
              </div>
            </div>
            <div class="archive-folder-right">
              <span class="archive-badge">${archivedArticles.length} ${archivedArticles.length === 1 ? 'artículo' : 'artículos'}</span>
              <button class="icon-btn folder-toggle-btn" title="Desplegar / Ocultar carpeta">
                <span class="material-symbols-outlined folder-chevron">expand_more</span>
              </button>
            </div>
          </div>
          <div class="archive-folder-body hidden">
            <div class="date-group-items archive-articles-items"></div>
          </div>
        </div>
      `;

      const listInside = folderWrapper.querySelector('.archive-articles-items');
      archivedArticles.forEach(art => {
        listInside.appendChild(_createArticleCard(art, callbacks, true));
      });

      const header = folderWrapper.querySelector('.archive-folder-header');
      const body = folderWrapper.querySelector('.archive-folder-body');
      const chevron = folderWrapper.querySelector('.folder-chevron');

      header.addEventListener('click', () => {
        const isHidden = body.classList.toggle('hidden');
        if (chevron) {
          chevron.textContent = isHidden ? 'expand_more' : 'expand_less';
        }
      });

      container.appendChild(folderWrapper);
    }
  }

  /**
   * Helper para construir una tarjeta individual de artículo
   */
  function _createArticleCard(art, callbacks = {}, isArchived = false) {
    const card = document.createElement('div');
    const isRecurrent = Boolean(art.isRecurrent) || (art.discrepancyCount >= 2);
    card.className = `article-card surface-card ${art.verified ? 'is-verified' : ''} ${art.locked ? 'is-locked' : ''} ${isArchived ? 'is-archived' : ''} ${isRecurrent ? 'is-recurrent' : ''}`;
    card.dataset.id = art.id;

    let statusBadgeClass = 'badge-correcto';
    let statusBadgeLabel = 'Correcto';
    let statusIcon = 'check_circle';

    if (art.status === 'sobrante') {
      statusBadgeClass = 'badge-sobrante';
      statusBadgeLabel = `Sobrante (+${art.difference})`;
      statusIcon = 'add_circle';
    } else if (art.status === 'faltante') {
      statusBadgeClass = 'badge-faltante';
      statusBadgeLabel = `Faltante (${art.difference})`;
      statusIcon = 'warning';
    }

    const createdUser = art.createdBy || '@admin';
    const updatedUser = art.updatedBy || art.createdBy || '@admin';
    const needsPlanHighlight = art.status !== 'correcto' || isRecurrent;

    card.innerHTML = `
      <div class="article-card-header">
        <div class="article-header-main">
          <div class="article-checkbox-wrapper">
            <input type="checkbox" id="chk-${art.id}" class="article-checkbox" ${art.verified ? 'checked' : ''}>
            <label for="chk-${art.id}" class="checkbox-label"></label>
          </div>

          ${art.image ? `
            <div class="article-thumb-wrapper btn-view-image" data-img="${art.image}" data-title="${escapeHTML(art.name)}">
              <img src="${art.image}" alt="${escapeHTML(art.name)}" class="article-thumb-img">
              <span class="material-symbols-outlined thumb-zoom-icon">zoom_in</span>
            </div>
          ` : `
            <div class="article-thumb-placeholder">
              <span class="material-symbols-outlined">inventory_2</span>
            </div>
          `}

          <div class="article-title-block">
            <span class="article-id">${escapeHTML(art.id)}</span>
            <h4 class="article-name">
              <a href="https://www.google.com/search?q=site:decathlon.com.co+${encodeURIComponent(art.name)}" target="_blank" rel="noopener noreferrer" class="article-name-link" title="Buscar '${escapeHTML(art.name)}'">
                ${escapeHTML(art.name)}
              </a>
            </h4>
          </div>
        </div>
        <div class="article-badges">
          <span class="badge ${statusBadgeClass}">
            <span class="material-symbols-outlined text-icon">${statusIcon}</span>
            ${statusBadgeLabel}
          </span>
        </div>
      </div>

      ${isRecurrent ? `
        <div class="recurrent-alert-banner">
          <div class="recurrent-alert-text">
            <span class="material-symbols-outlined text-icon">local_fire_department</span>
            <span><strong>Problema Reincidente:</strong> ${art.discrepancyCount} registros con diferencia de stock.</span>
          </div>
          <button type="button" class="btn-recurrent-plan btn-open-plan-modal" data-id="${art.id}">
            + Crear Plan
          </button>
        </div>
      ` : ''}

      <div class="article-card-body">
        <div class="qty-grid">
          <div class="qty-box">
            <span class="qty-label">Cant. en Inventario</span>
            <span class="qty-value">${art.expectedQty}</span>
          </div>
          <div class="qty-box qty-box-interactive">
            <span class="qty-label">Cant. Inventariada</span>
            <div class="qty-stepper-wrapper">
              <button type="button" class="qty-step-btn btn-qty-minus" ${art.locked ? 'disabled' : ''} title="Restar 1" aria-label="Restar 1">−</button>
              <input 
                type="number" 
                inputmode="numeric"
                class="qty-input input-found-qty" 
                value="${art.foundQty}" 
                min="0" 
                ${art.locked ? 'disabled' : ''}
                data-id="${art.id}"
              >
              <button type="button" class="qty-step-btn btn-qty-plus" ${art.locked ? 'disabled' : ''} title="Sumar 1" aria-label="Sumar 1">+</button>
            </div>
            ${!art.locked && art.foundQty !== art.expectedQty ? `
              <button type="button" class="btn-qty-match" title="Igualar a cantidad en sistema (${art.expectedQty})">
                = Igualar a ${art.expectedQty}
              </button>
            ` : ''}
          </div>
          <div class="qty-box">
            <span class="qty-label">Diferencia</span>
            <span class="qty-value diff-value ${art.difference > 0 ? 'diff-plus' : art.difference < 0 ? 'diff-minus' : ''}">
              ${art.difference > 0 ? '+' + art.difference : art.difference}
            </span>
          </div>
        </div>

        ${art.comment ? `
          <div class="article-comment-box">
            <span class="material-symbols-outlined text-icon">comment</span>
            <span class="article-comment-text">${escapeHTML(art.comment)}</span>
          </div>
        ` : ''}

        ${art.verified && art.verifiedAt ? `
          <div class="verification-timestamp">
            <span class="material-symbols-outlined text-icon">done_all</span>
            Verificado el: ${InventoryData.formatDate(art.verifiedAt)}
          </div>
        ` : ''}

        <!-- Atribución de Usuario en Artículo -->
        <div class="article-author-meta">
          <span class="author-tag">
            <span class="material-symbols-outlined author-icon">person_add</span>
            Creado: <strong>${escapeHTML(createdUser)}</strong>
          </span>
          <span class="author-tag">
            <span class="material-symbols-outlined author-icon">edit_note</span>
            Modif: <strong>${escapeHTML(updatedUser)}</strong> <span class="author-time">(${InventoryData.getRelativeTime(art.updatedAt || art.verifiedAt || art.createdAt)})</span>
          </span>
        </div>
      </div>

      <div class="article-card-footer">
        <div class="article-actions-left">
          ${art.locked ? `
            <button type="button" class="btn btn-sm btn-outlined btn-unlock-article" data-id="${art.id}" title="Desbloquear edición">
              <span class="material-symbols-outlined text-icon">lock_open</span>
              Desbloquear
            </button>
          ` : ''}
          <button type="button" class="btn btn-sm ${needsPlanHighlight ? 'btn-plan-highlight' : 'btn-outlined'} btn-open-plan-modal" data-id="${art.id}" title="Crear o ver Plan de Acción para este artículo">
            <span class="material-symbols-outlined text-icon">add_task</span>
            + Plan
          </button>
          <button type="button" class="btn btn-sm btn-outlined btn-article-history" data-id="${art.id}" title="Ver historial de conteos de este artículo">
            <span class="material-symbols-outlined text-icon">history</span>
            Historial${art.historyCount ? ` (${art.historyCount})` : ''}
          </button>
        </div>
        <div class="article-actions-right">
          <button type="button" class="icon-btn btn-edit-article" title="Editar Artículo" data-id="${art.id}">
            <span class="material-symbols-outlined">edit</span>
          </button>
          <button type="button" class="icon-btn btn-delete-article" title="Eliminar Artículo" data-id="${art.id}">
            <span class="material-symbols-outlined">delete</span>
          </button>
        </div>
      </div>
    `;

    // Eventos del checkbox de verificación
    const chk = card.querySelector(`#chk-${art.id}`);
    if (chk) {
      chk.addEventListener('change', (e) => {
        if (callbacks.onToggleVerification) {
          callbacks.onToggleVerification(art.id, e.target.checked);
        }
      });
    }

    // Input de cantidad encontrada + Steppers táctiles (- / + / = Igualar)
    const inputFound = card.querySelector('.input-found-qty');
    const diffEl = card.querySelector('.diff-value');
    let stepDebounce = null;

    const triggerQtyUpdate = (newVal) => {
      const cleanVal = Math.max(0, parseInt(newVal, 10) || 0);
      if (inputFound) inputFound.value = cleanVal;
      if (diffEl) {
        const d = cleanVal - (art.expectedQty || 0);
        diffEl.textContent = d > 0 ? `+${d}` : `${d}`;
        diffEl.className = `qty-value diff-value ${d > 0 ? 'diff-plus' : d < 0 ? 'diff-minus' : ''}`;
      }
      clearTimeout(stepDebounce);
      stepDebounce = setTimeout(() => {
        if (callbacks.onUpdateFoundQty) callbacks.onUpdateFoundQty(art.id, cleanVal);
      }, 400);
    };

    if (inputFound) {
      inputFound.addEventListener('change', (e) => {
        const val = parseInt(e.target.value, 10);
        if (!isNaN(val) && callbacks.onUpdateFoundQty) {
          clearTimeout(stepDebounce);
          callbacks.onUpdateFoundQty(art.id, Math.max(0, val));
        }
      });
    }

    const btnMinus = card.querySelector('.btn-qty-minus');
    if (btnMinus) {
      btnMinus.addEventListener('click', (e) => {
        e.stopPropagation();
        const curr = parseInt(inputFound?.value, 10) || 0;
        triggerQtyUpdate(Math.max(0, curr - 1));
      });
    }

    const btnPlus = card.querySelector('.btn-qty-plus');
    if (btnPlus) {
      btnPlus.addEventListener('click', (e) => {
        e.stopPropagation();
        const curr = parseInt(inputFound?.value, 10) || 0;
        triggerQtyUpdate(curr + 1);
      });
    }

    const btnMatch = card.querySelector('.btn-qty-match');
    if (btnMatch) {
      btnMatch.addEventListener('click', (e) => {
        e.stopPropagation();
        clearTimeout(stepDebounce);
        if (callbacks.onUpdateFoundQty) callbacks.onUpdateFoundQty(art.id, art.expectedQty);
      });
    }

    // Botón desbloquear
    const btnUnlock = card.querySelector('.btn-unlock-article');
    if (btnUnlock) {
      btnUnlock.addEventListener('click', () => {
        if (callbacks.onUnlockArticle) callbacks.onUnlockArticle(art);
      });
    }

    // Botones de Plan de Acción
    card.querySelectorAll('.btn-open-plan-modal').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (callbacks.onOpenPlanModal) callbacks.onOpenPlanModal(art);
      });
    });

    // Botón de Historial del artículo
    const btnHistory = card.querySelector('.btn-article-history');
    if (btnHistory) {
      btnHistory.addEventListener('click', (e) => {
        e.stopPropagation();
        if (callbacks.onViewArticleHistory) callbacks.onViewArticleHistory(art);
      });
    }

    // Botones editar y eliminar
    const btnEdit = card.querySelector('.btn-edit-article');
    if (btnEdit) {
      btnEdit.addEventListener('click', () => {
        if (callbacks.onEditArticle) callbacks.onEditArticle(art);
      });
    }

    const btnDelete = card.querySelector('.btn-delete-article');
    if (btnDelete) {
      btnDelete.addEventListener('click', () => {
        if (callbacks.onDeleteArticle) callbacks.onDeleteArticle(art);
      });
    }

    const btnViewImg = card.querySelector('.btn-view-image');
    if (btnViewImg) {
      btnViewImg.addEventListener('click', (e) => {
        e.stopPropagation();
        showImageModal(art.image, art.name);
      });
    }

    return card;
  }

  /**
   * Renderiza las Novedades / Tareas agrupadas por fechas.
   * @param {Array} novelties 
   * @param {Object} callbacks 
   */
  function renderNoveltiesList(novelties = [], callbacks = {}) {
    const container = elements.noveltiesListContainer;
    if (!container) return;
    container.innerHTML = '';

    if (!novelties || novelties.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="material-symbols-outlined empty-icon">assignment_late</span>
          <h3>Sin novedades registradas</h3>
          <p>Usa el botón flotante (+) para agregar una tarea o novedad sobre esta zona.</p>
        </div>
      `;
      return;
    }

    const groups = InventoryData.groupItemsByDate(novelties, 'createdAt');

    groups.forEach(group => {
      const groupSection = document.createElement('div');
      groupSection.className = 'date-group-section';

      const groupHeader = document.createElement('div');
      groupHeader.className = 'date-group-header';
      groupHeader.innerHTML = `
        <span class="date-group-badge">
          <span class="material-symbols-outlined text-icon">event</span>
          ${escapeHTML(group.category)}
        </span>
        <span class="date-group-count">${group.items.length} ${group.items.length === 1 ? 'novedad' : 'novedades'}</span>
      `;
      groupSection.appendChild(groupHeader);

      const itemsContainer = document.createElement('div');
      itemsContainer.className = 'date-group-items';

      group.items.forEach(nov => {
        const card = document.createElement('div');
        card.className = `article-card surface-card ${nov.confirmed ? 'is-verified' : ''}`;

        card.innerHTML = `
          <div class="article-card-header">
            <div class="article-header-main">
              <div class="article-checkbox-wrapper">
                <input type="checkbox" id="chk-nov-${nov.id}" class="article-checkbox" ${nov.confirmed ? 'checked' : ''}>
                <label for="chk-nov-${nov.id}" class="checkbox-label"></label>
              </div>
              <div class="article-title-block">
                <h4 class="article-name">${escapeHTML(nov.text)}</h4>
                <span class="article-id">Registrado: ${InventoryData.formatDate(nov.createdAt)}</span>
              </div>
            </div>
            <div class="article-badges">
              <span class="badge ${nov.confirmed ? 'badge-correcto' : 'badge-faltante'}">
                <span class="material-symbols-outlined text-icon">${nov.confirmed ? 'check_circle' : 'pending'}</span>
                ${nov.confirmed ? 'Resuelta' : 'Pendiente'}
              </span>
            </div>
          </div>
          <div class="article-card-footer">
            <div class="article-actions-left">
              ${nov.confirmedAt ? `<span class="verification-timestamp">✓ Resuelta el ${InventoryData.formatDate(nov.confirmedAt)}</span>` : ''}
            </div>
            <div class="article-actions-right">
              <button class="icon-btn btn-delete-novelty" title="Eliminar novedad" data-id="${nov.id}">
                <span class="material-symbols-outlined">delete</span>
              </button>
            </div>
          </div>
        `;

        const chk = card.querySelector(`#chk-nov-${nov.id}`);
        if (chk) {
          chk.addEventListener('change', (e) => {
            if (callbacks.onToggleNovelty) callbacks.onToggleNovelty(nov.id, e.target.checked);
          });
        }

        const btnDel = card.querySelector('.btn-delete-novelty');
        if (btnDel) {
          btnDel.addEventListener('click', () => {
            if (callbacks.onDeleteNovelty) callbacks.onDeleteNovelty(nov.id);
          });
        }

        itemsContainer.appendChild(card);
      });

      groupSection.appendChild(itemsContainer);
      container.appendChild(groupSection);
    });
  }

  /**
   * Renderiza el Historial de Auditoría / Logs de Actividad agrupado por fechas.
   * @param {Array} logs 
   */
  function renderActivityLogs(logs = []) {
    const container = elements.logsListContainer;
    if (!container) return;
    container.innerHTML = '';

    if (!logs || logs.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="material-symbols-outlined empty-icon">history_toggle_off</span>
          <h3>Sin registros en el historial</h3>
          <p>Las acciones realizadas por los usuarios quedarán registradas aquí.</p>
        </div>
      `;
      return;
    }

    const groups = InventoryData.groupItemsByDate(logs, 'createdAt');

    groups.forEach(group => {
      const groupSection = document.createElement('div');
      groupSection.className = 'date-group-section';

      const groupHeader = document.createElement('div');
      groupHeader.className = 'date-group-header';
      groupHeader.innerHTML = `
        <span class="date-group-badge">
          <span class="material-symbols-outlined text-icon">history</span>
          ${escapeHTML(group.category)}
        </span>
        <span class="date-group-count">${group.items.length} ${group.items.length === 1 ? 'registro' : 'registros'}</span>
      `;
      groupSection.appendChild(groupHeader);

      const itemsContainer = document.createElement('div');
      itemsContainer.className = 'date-group-items';

      group.items.forEach(log => {
        const card = document.createElement('div');
        card.className = 'log-item-card surface-card';

        let badgeClass = 'log-badge-action';
        let actionIcon = 'info';

        if (log.action.includes('verify') || log.action.includes('confirm')) {
          badgeClass += ' log-badge-verify';
          actionIcon = 'check_circle';
        } else if (log.action.includes('delete')) {
          badgeClass += ' log-badge-delete';
          actionIcon = 'delete';
        } else if (log.action.includes('update') || log.action.includes('unlock')) {
          badgeClass += ' log-badge-update';
          actionIcon = 'edit';
        }

        card.innerHTML = `
          <div class="log-item-header">
            <span class="${badgeClass}">
              <span class="material-symbols-outlined text-icon">${actionIcon}</span>
              ${escapeHTML(log.action.replace('_', ' '))}
            </span>
            <div class="log-meta-right">
              <span class="log-user-chip">
                <span class="material-symbols-outlined text-icon">account_circle</span>
                ${escapeHTML(log.userEmail || 'anon')}
              </span>
              <span class="log-time">
                <span class="material-symbols-outlined text-icon">schedule</span>
                ${InventoryData.formatDate(log.createdAt)}
              </span>
            </div>
          </div>
          <div class="log-details-text">
            ${log.entityName ? `<span class="log-entity-tag">[${escapeHTML(log.entityName)}]</span> ` : ''}
            ${escapeHTML(log.details || '')}
          </div>
        `;

        itemsContainer.appendChild(card);
      });

      groupSection.appendChild(itemsContainer);
      container.appendChild(groupSection);
    });
  }

  /**
   * Renderiza el Feed lateral de actividad reciente en tiempo real (visible para todos).
   * @param {Array} logs 
   * @param {boolean} isAdmin - Si es admin, puede ver inicios de sesión; si no, solo cambios funcionales.
   */
  function renderActivitySidebarFeed(logs = [], isAdmin = false) {
    const container = elements.activitySidebarFeed;
    if (!container) return;
    container.innerHTML = '';

    // Filtrar: los usuarios normales NO ven inicios de sesión ni autenticación
    const filteredLogs = (logs || []).filter(log => {
      if (isAdmin) return true;
      const act = (log.action || '').toLowerCase();
      const ent = (log.entityType || '').toLowerCase();
      if (act === 'login' || act === 'logout' || ent === 'auth') return false;
      return true;
    });

    const recentLogs = filteredLogs.slice(0, 25);

    if (recentLogs.length === 0) {
      container.innerHTML = `
        <div class="empty-state small" style="padding: 28px 12px; text-align: center;">
          <span class="material-symbols-outlined empty-icon" style="font-size: 36px; opacity: 0.6;">history_toggle_off</span>
          <h4 style="font-size: 0.92rem; margin: 8px 0 3px; font-weight: 700;">Sin cambios recientes</h4>
          <p style="font-size: 0.78rem; color: var(--text-muted); line-height: 1.4;">Los cambios de inventario, verificaciones y creaciones aparecerán aquí en vivo.</p>
        </div>
      `;
      return;
    }

    recentLogs.forEach(log => {
      const item = document.createElement('div');
      
      let typeClass = 'item-info';
      let actionLabel = 'Modificación';
      let actionIcon = 'edit_note';

      const act = (log.action || '').toLowerCase();
      if (act.includes('verify') || act.includes('confirm')) {
        typeClass = 'item-verify';
        actionLabel = 'Verificación';
        actionIcon = 'check_circle';
      } else if (act.includes('delete')) {
        typeClass = 'item-delete';
        actionLabel = 'Eliminación';
        actionIcon = 'delete';
      } else if (act.includes('create') || act.includes('add') || act.includes('import')) {
        typeClass = 'item-create';
        actionLabel = 'Nuevo / Creado';
        actionIcon = 'add_circle';
      } else if (act.includes('unlock')) {
        typeClass = 'item-update';
        actionLabel = 'Desbloqueo';
        actionIcon = 'lock_open';
      } else if (act.includes('login') || act.includes('auth')) {
        typeClass = 'item-auth';
        actionLabel = 'Acceso';
        actionIcon = 'login';
      }

      const userTag = log.userEmail || '@admin';

      item.className = `sidebar-feed-item ${typeClass}`;
      item.innerHTML = `
        <div class="sidebar-item-header">
          <div class="sidebar-user-block">
            <span class="sidebar-user-tag">
              <span class="material-symbols-outlined user-tiny-icon">account_circle</span>
              ${escapeHTML(userTag)}
            </span>
          </div>
          <span class="sidebar-item-time" title="${InventoryData.formatDate(log.createdAt)}">
            <span class="material-symbols-outlined text-icon">schedule</span>
            ${InventoryData.getRelativeTime(log.createdAt)}
          </span>
        </div>
        <div class="sidebar-action-row">
          <span class="sidebar-action-pill pill-${typeClass}">
            <span class="material-symbols-outlined pill-icon">${actionIcon}</span>
            ${actionLabel}
          </span>
          ${log.entityName ? `<span class="sidebar-entity-name" title="${escapeHTML(log.entityName)}">${escapeHTML(log.entityName)}</span>` : ''}
        </div>
        <div class="sidebar-item-desc">
          ${escapeHTML(log.details || log.action.replace(/_/g, ' '))}
        </div>
      `;
      container.appendChild(item);
    });
  }

  /**
   * Visualizador ampliado de imagen en modal.
   * @param {string} imageSrc 
   * @param {string} title 
   */
  function showImageModal(imageSrc, title) {
    showModal({
      title: title || 'Fotografía del Artículo',
      contentHTML: `
        <div class="image-viewer-container">
          <img src="${imageSrc}" alt="${escapeHTML(title)}" class="image-viewer-img" />
        </div>
      `,
      buttons: [
        {
          text: 'Cerrar',
          class: 'btn-outlined',
          onClick: () => {
            elements.modalContainer.classList.add('hidden');
            elements.modalContainer.innerHTML = '';
          }
        }
      ]
    });
  }

  /**
   * Renderiza el calendario compacto de la zona.
   * @param {Array} plans 
   */
  function renderZoneCalendar(plans = []) {
    const container = document.getElementById('zone-calendar');
    if (!container) return;
    container.innerHTML = '';

    const upcoming = (plans || []).slice().sort((a,b)=> new Date(a.startDate) - new Date(b.startDate));
    const activeCount = upcoming.filter(p => p.status !== 'completado').length;

    container.classList.toggle('zone-calendar-empty', upcoming.length === 0);
    // En móvil iniciamos colapsado para dar prioridad inmediata a los artículos
    if (window.innerWidth <= 640 && !container.dataset.userToggled) {
      container.classList.add('is-collapsed-mobile');
    }

    const header = document.createElement('div');
    header.className = 'zone-calendar-header';
    header.innerHTML = `
      <div class="zc-header-title-group" id="btn-toggle-mobile-calendar" title="Mostrar / ocultar planes programados">
        <span class="material-symbols-outlined zc-cal-icon">event_note</span>
        <h3>Planes de Acción</h3>
        <span class="zc-count-pill ${activeCount > 0 ? 'has-active' : ''}">${upcoming.length === 0 ? '0' : `${activeCount} act. / ${upcoming.length}`}</span>
        ${upcoming.length > 0 ? `<span class="material-symbols-outlined zc-chevron-mobile">expand_more</span>` : ''}
      </div>
      <button class="btn btn-sm btn-outlined" id="btn-open-full-calendar">
        <span class="material-symbols-outlined text-icon">calendar_month</span>
        Calendario
      </button>
    `;
    container.appendChild(header);

    const toggleGroup = header.querySelector('#btn-toggle-mobile-calendar');
    if (toggleGroup && upcoming.length > 0) {
      toggleGroup.addEventListener('click', () => {
        container.dataset.userToggled = 'true';
        container.classList.toggle('is-collapsed-mobile');
      });
    }

    const list = document.createElement('div');
    list.className = 'zone-calendar-list';

    if (upcoming.length === 0) {
      list.innerHTML = `<div class="empty-state small">No hay planes de acción programados. Usa "+ Plan" en cualquier artículo con novedad.</div>`;
    } else {
      upcoming.slice(0,6).forEach(p => {
        const item = document.createElement('div');
        item.className = 'zone-calendar-item';
        item.dataset.articleId = p.articleId || '';

        const palette = ['#F97316','#6366f1','#06b6d4','#ef4444','#10b981','#f59e0b','#8b5cf6','#0ea5e9'];
        function hashString(s){ let h=0; for(let i=0;i<s.length;i++){ h=((h<<5)-h)+s.charCodeAt(i); h|=0;} return h; }
        const color = palette[Math.abs(hashString(p.articleId || (p.id||''))) % palette.length];

        item.style.borderLeft = `4px solid ${color}`;
        item.innerHTML = `
          <div class="zc-main"><strong class="zc-code">${escapeHTML(p.articleId || '')}</strong>
          <div class="zc-desc">${escapeHTML(p.description)}</div></div>
          <div class="zc-actions"><button class="btn btn-sm btn-outlined btn-zc-open">Abrir</button><button class="btn btn-sm btn-danger btn-zc-del">Eliminar</button></div>
        `;

        item.dataset.planId = p.id || '';
        item.dataset.articleId = p.articleId || '';
        list.appendChild(item);
      });

      list.addEventListener('click', (ev) => {
        const openBtn = ev.target.closest('.btn-zc-open');
        if (openBtn) {
          ev.stopPropagation();
          const item = openBtn.closest('.zone-calendar-item');
          const articleId = item ? item.dataset.articleId : null;
          window.dispatchEvent(new CustomEvent('zoneCalendar:openArticle', { detail: { articleId } }));
          return;
        }
        const delBtn = ev.target.closest('.btn-zc-del');
        if (delBtn) {
          ev.stopPropagation();
          const item = delBtn.closest('.zone-calendar-item');
          const articleId = item ? item.dataset.articleId : null;
          const planId = item ? item.dataset.planId : null;
          window.dispatchEvent(new CustomEvent('fullCalendar:deletePlan', { detail: { articleId, planId } }));
          return;
        }
      });

      if (upcoming.length > 5) {
        const more = document.createElement('div');
        more.className = 'zone-calendar-more';
        more.textContent = `+${upcoming.length - 5} más`;
        more.addEventListener('click', () => showFullCalendar(plans));
        list.appendChild(more);
      }
    }

    container.appendChild(list);

    const btnOpen = document.getElementById('btn-open-full-calendar');
    if (btnOpen) btnOpen.addEventListener('click', () => showFullCalendar(plans));
  }

  function injectArticlePlans(plans = []) {
    const byArticle = {};
    (plans || []).forEach(p => { 
      if (p.articleId) {
        (byArticle[p.articleId] = byArticle[p.articleId] || []).push(p);
      }
    });

    const palette = ['#F97316','#6366f1','#06b6d4','#ef4444','#10b981','#f59e0b','#8b5cf6','#0ea5e9'];

    document.querySelectorAll('.article-card').forEach(card => {
      const aid = card.dataset.id || '';
      if (!aid) return;
      
      const container = card.querySelector('.article-card-body');
      if (!container) return;
      
      const old = card.querySelector('.article-plans-list');
      if (old) old.remove();

      const plansFor = byArticle[aid] || [];
      if (plansFor.length === 0) return;
      
      const wrap = document.createElement('div');
      wrap.className = 'article-plans-list';

      function hashString(s) {
        let h = 0;
        for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
        return h;
      }
      const color = palette[Math.abs(hashString(aid)) % palette.length];

      plansFor.slice(0, 3).forEach(p => {
        const isDone = p.status === 'completado';
        const el = document.createElement('div');
        el.className = `article-plan-snippet ${isDone ? 'plan-is-done' : ''}`;
        el.style.borderLeftColor = isDone ? '#10b981' : color;
        
        const formattedStart = p.startDate || '-';
        const formattedEnd = p.endDate ? p.endDate : '';
        const dateRange = formattedEnd ? `${formattedStart} → ${formattedEnd}` : formattedStart;
        
        el.innerHTML = `
          <div class="ap-main">
            <div class="ap-top-row">
              <span class="ap-status-badge ${isDone ? 'ap-status-done' : 'ap-status-pending'}">
                ${isDone ? '✓ Resuelto' : '⏳ Plan Activo'}
              </span>
              <span class="ap-date">📅 ${escapeHTML(dateRange)}</span>
            </div>
            <div class="ap-desc">${escapeHTML(p.description)}</div>
          </div>
          <div class="ap-actions">
            <button type="button" class="icon-btn btn-sm btn-ap-toggle" title="${isDone ? 'Marcar como pendiente' : 'Marcar plan como resuelto/completado'}">
              <span class="material-symbols-outlined">${isDone ? 'restart_alt' : 'check_circle'}</span>
            </button>
            <button type="button" class="icon-btn btn-sm btn-ap-del" title="Eliminar plan de acción">
              <span class="material-symbols-outlined">delete</span>
            </button>
          </div>
        `;

        el.querySelector('.btn-ap-toggle')?.addEventListener('click', (e) => {
          e.stopPropagation();
          window.dispatchEvent(new CustomEvent('actionPlan:toggleStatus', { detail: { plan: p } }));
        });

        el.querySelector('.btn-ap-del')?.addEventListener('click', (e) => {
          e.stopPropagation();
          window.dispatchEvent(new CustomEvent('fullCalendar:deletePlan', { detail: { articleId: p.articleId, planId: p.id } }));
        });

        wrap.appendChild(el);
      });

      if (plansFor.length > 3) {
        const more = document.createElement('div');
        more.className = 'article-plan-more';
        more.textContent = `📋 +${plansFor.length - 3} planes más`;
        more.title = 'Click para ver todos los planes';
        more.addEventListener('click', (e) => {
          e.stopPropagation();
          showFullCalendar(plansFor);
        });
        wrap.appendChild(more);
      }
      
      container.appendChild(wrap);
    });
  }

  function showFullCalendar(plans = []) {
    const today = new Date();
    let currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const renderMonth = (monthDate, modal) => {
      const year = monthDate.getFullYear();
      const month = monthDate.getMonth();
      const firstDay = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();

      const monthName = monthDate.toLocaleString('default', { month: 'long' });
      const title = `${monthName} ${year}`;

      let grid = '<div class="full-calendar-toolbar">';
      grid += `<button class="btn btn-sm btn-outlined" id="fc-prev">‹</button>`;
      grid += `<div class="fc-title">${escapeHTML(title)}</div>`;
      grid += `<button class="btn btn-sm btn-outlined" id="fc-next">›</button>`;
      grid += '</div>';

      grid += '<div class="full-calendar-grid"><div class="fc-weekdays">';
      ['Dom','Lun','Mar','Mie','Jue','Vie','Sab'].forEach(d => grid += `<div class="fc-weekday">${d}</div>`);
      grid += '</div><div class="fc-days">';

      for (let i = 0; i < firstDay; i++) grid += `<div class="fc-day empty"></div>`;

      for (let d = 1; d <= daysInMonth; d++) {
        const cellDate = new Date(year, month, d);
        const iso = cellDate.toISOString().slice(0,10);
        const evs = (plans || []).filter(p => {
          const s = new Date(p.startDate).toISOString().slice(0,10);
          const e = new Date(p.endDate).toISOString().slice(0,10);
          return s <= iso && iso <= e;
        });

        grid += `<div class="fc-day" data-date="${iso}"><div class="fc-day-num">${d}</div>`;
        if (evs.length) {
          evs.slice(0,3).forEach(ev => {
            const planId = ev.id || '';
            const articleId = ev.articleId || '';
            const code = escapeHTML(articleId);
            const desc = escapeHTML(ev.description || '');
            const palette = ['#F97316','#6366f1','#06b6d4','#ef4444','#10b981','#f59e0b','#8b5cf6','#0ea5e9'];
            function hashString(s){ let h=0; for(let i=0;i<s.length;i++){ h=((h<<5)-h)+s.charCodeAt(i); h|=0;} return h; }
            const color = palette[Math.abs(hashString(articleId||planId)) % palette.length];
            grid += `<div class="fc-event" data-plan-id="${escapeHTML(planId)}" data-article-id="${escapeHTML(articleId)}" style="border-left:6px solid ${color};">` +
              `<div class="fc-event-main">` +
                `<span class="fc-color-swatch" style="background:${color}"></span>` +
                `<span class="fc-article-code">${code}</span>` +
                `<span class="fc-event-desc">${desc}</span>` +
              `</div>` +
            `</div>`;
          });
          if (evs.length > 3) grid += `<div class="fc-event-more">+${evs.length-3} más</div>`;
        }
        grid += '</div>';
      }

      grid += '</div></div>';

      modal.querySelector('.modal-body').innerHTML = grid;

      modal.querySelector('#fc-prev').addEventListener('click', () => {
        currentMonth = new Date(year, month - 1, 1);
        renderMonth(currentMonth, modal);
      });
      modal.querySelector('#fc-next').addEventListener('click', () => {
        currentMonth = new Date(year, month + 1, 1);
        renderMonth(currentMonth, modal);
      });

      setTimeout(() => {
        const events = modal.querySelectorAll('.fc-event');
        events.forEach(evtEl => {
          evtEl.addEventListener('click', () => {
            const planId = evtEl.dataset.planId;
            const articleId = evtEl.dataset.articleId;
            window.dispatchEvent(new CustomEvent('fullCalendar:openArticle', { detail: { articleId, planId } }));
          });
        });
      }, 50);
    };

    const m = showModal({
      title: 'Calendario de Planes de Acción',
      contentHTML: '<div class="full-calendar-root"></div>',
      buttons: [
        { text: 'Cerrar', class: 'btn-outlined', onClick: () => m.closeModal() }
      ]
    });

    const modalEl = document.getElementById('modal-container');
    const modalCard = modalEl.querySelector('.modal-card');
    renderMonth(currentMonth, modalCard);
    return m;
  }

  /**
   * Muestra un modal genérico personalizable.
   * @param {Object} options - { title, contentHTML, buttons: [{ text, class, onClick }] }
   */
  function showModal({ title, contentHTML, buttons = [] }) {
    const container = elements.modalContainer;
    container.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-card surface-card">
        <div class="modal-header">
          <h3 class="modal-title">${escapeHTML(title)}</h3>
          <button class="icon-btn btn-close-modal" id="modal-close-btn">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <div class="modal-body">
          ${contentHTML}
        </div>
        <div class="modal-footer" id="modal-footer-btns"></div>
      </div>
    `;

    const footer = container.querySelector('#modal-footer-btns');
    buttons.forEach(btnConfig => {
      const btn = document.createElement('button');
      btn.className = `btn ${btnConfig.class || 'btn-primary'}`;
      btn.textContent = btnConfig.text;
      btn.addEventListener('click', (e) => {
        if (btnConfig.onClick) btnConfig.onClick(e);
      });
      footer.appendChild(btn);
    });

    const closeModal = () => {
      container.classList.add('hidden');
      container.innerHTML = '';
    };

    container.querySelector('#modal-close-btn').addEventListener('click', closeModal);
    container.querySelector('.modal-backdrop').addEventListener('click', closeModal);
    container.classList.remove('hidden');

    return { closeModal };
  }

  /**
   * Cuadro de diálogo de confirmación.
   * @param {string} title 
   * @param {string} message 
   * @param {Function} onConfirm 
   * @param {string} confirmText 
   */
  function showConfirmDialog(title, message, onConfirm, confirmText = 'Confirmar') {
    const modal = showModal({
      title,
      contentHTML: `<p class="modal-text">${escapeHTML(message)}</p>`,
      buttons: [
        {
          text: 'Cancelar',
          class: 'btn-outlined',
          onClick: () => modal.closeModal()
        },
        {
          text: confirmText,
          class: 'btn-danger',
          onClick: () => {
            modal.closeModal();
            onConfirm();
          }
        }
      ]
    });
  }

  return {
    elements,
    showToast,
    showAuthView,
    showAppShell,
    showZonesView,
    showZoneDetailView,
    switchSubView,
    renderZonesList,
    renderStats,
    renderArticlesList,
    renderNoveltiesList,
    renderActivityLogs,
    renderActivitySidebarFeed,
    openActivityDropdown,
    closeActivityDropdown,
    toggleActivityDropdown,
    isActivityDropdownOpen,
    showModal,
    showConfirmDialog,
    showImageModal,
    renderZoneCalendar,
    injectArticlePlans,
    showFullCalendar,
    escapeHTML
  };
})();

window.InventoryUI = InventoryUI;
