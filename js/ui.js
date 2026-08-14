/**
 * ui.js
 * Módulo de interfaz de usuario para la PWA de Reverificación de Inventario.
 * Maneja el renderizado de vistas, modales, alertas, toasts y eventos visuales.
 */

const InventoryUI = (() => {

  // Elementos principales del DOM
  const elements = {
    appHeader: document.getElementById('app-header'),
    headerTitle: document.getElementById('header-title'),
    headerSubtitle: document.getElementById('header-subtitle'),
    btnBack: document.getElementById('btn-back'),
    btnBackupExport: document.getElementById('btn-backup-export'),
    btnBackupImport: document.getElementById('btn-backup-import'),
    btnGlobalImport: document.getElementById('btn-global-import'),
    btnGlobalExport: document.getElementById('btn-global-export'),
    themeToggleBtn: document.getElementById('theme-toggle-btn'),
    
    // Contenedores de Vistas
    zonesView: document.getElementById('zones-view'),
    zoneDetailView: document.getElementById('zone-detail-view'),

    // Elementos de la vista de Zonas
    zonesListContainer: document.getElementById('zones-list-container'),
    zoneSearchInput: document.getElementById('zone-search-input'),
    fabAddZone: document.getElementById('fab-add-zone'),

    // Elementos de la vista de Detalle de Zona
    statsContainer: document.getElementById('stats-container'),
    articleSearchInput: document.getElementById('article-search-input'),
    filterTabs: document.querySelectorAll('.filter-tab'),
    articlesListContainer: document.getElementById('articles-list-container'),
    fabAddArticle: document.getElementById('fab-add-article'),
    btnExportZone: document.getElementById('btn-export-zone'),

    // Control de Sub-vistas (Artículos vs Novedades)
    btnToggleArticles: document.getElementById('btn-toggle-articles'),
    btnToggleNovelties: document.getElementById('btn-toggle-novelties'),
    articlesSubView: document.getElementById('articles-sub-view'),
    noveltiesSubView: document.getElementById('novelties-sub-view'),
    noveltiesListContainer: document.getElementById('novelties-list-container'),
    noveltyStatsContainer: document.getElementById('novelty-stats-container'),
    fabAddNovelty: document.getElementById('fab-add-novelty'),

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

    // Animación de entrada y temporizador de salida
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
    elements.headerSubtitle.textContent = `Creada: ${InventoryData.formatDate(zone.createdAt)}`;
  }

  /**
   * Renderiza las tarjetas de la lista de Zonas.
   * @param {Array} zones 
   * @param {string} searchQuery 
   */
  function renderZonesList(zones, searchQuery = '', callbacks = {}) {
    const container = elements.zonesListContainer;
    container.innerHTML = '';

    const query = searchQuery.trim().toLowerCase();
    const filteredZones = zones.filter(z => z.name.toLowerCase().includes(query));

    if (filteredZones.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="material-symbols-outlined empty-icon">inventory_2</span>
          <h3>${query ? 'No se encontraron zonas' : 'No hay zonas registradas'}</h3>
          <p>${query ? 'Intenta buscar con otros términos.' : 'Presiona el botón "+" para crear tu primera zona de responsabilidad.'}</p>
        </div>
      `;
      return;
    }

    filteredZones.forEach(zone => {
      const stats = InventoryData.calculateZoneStats(zone.articles);
      const card = document.createElement('div');
      card.className = 'zone-card surface-card ripple';
      card.dataset.id = zone.id;

      card.innerHTML = `
        <div class="zone-card-header">
          <div class="zone-info">
            <h3 class="zone-title">${escapeHTML(zone.name)}</h3>
            <span class="zone-date">
              <span class="material-symbols-outlined text-icon">calendar_today</span>
              ${InventoryData.formatDate(zone.createdAt)}
            </span>
          </div>
          <div class="zone-actions">
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
      `;

      // Evento de clic en la tarjeta para abrir la zona
      card.addEventListener('click', (e) => {
        // Evitar abrir si se hizo clic en el botón de eliminar
        if (e.target.closest('.btn-delete-zone')) {
          e.stopPropagation();
          if (callbacks.onDeleteZone) callbacks.onDeleteZone(zone);
          return;
        }
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
   * Renderiza la lista de artículos de la zona actual.
   * @param {Array} articles 
   * @param {string} currentFilter - 'todos', 'pendientes', 'verificados', 'faltantes', 'sobrantes'
   * @param {string} searchQuery 
   * @param {Object} callbacks 
   */
  function renderArticlesList(articles = [], currentFilter = 'todos', searchQuery = '', callbacks = {}) {
    const container = elements.articlesListContainer;
    container.innerHTML = '';

    const query = searchQuery.trim().toLowerCase();

    // Aplicar Filtro de búsqueda (ID o Nombre)
    let filtered = articles.filter(art => {
      const matchId = art.id.toLowerCase().includes(query);
      const matchName = art.name.toLowerCase().includes(query);
      return matchId || matchName;
    });

    // Aplicar Filtro de Categoría
    if (currentFilter === 'pendientes') {
      filtered = filtered.filter(a => !a.verified);
    } else if (currentFilter === 'verificados') {
      filtered = filtered.filter(a => a.verified);
    } else if (currentFilter === 'faltantes') {
      filtered = filtered.filter(a => a.status === 'faltante');
    } else if (currentFilter === 'sobrantes') {
      filtered = filtered.filter(a => a.status === 'sobrante');
    }

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="material-symbols-outlined empty-icon">category</span>
          <h3>No se encontraron artículos</h3>
          <p>No existen registros que coincidan con la búsqueda o el filtro seleccionado.</p>
        </div>
      `;
      return;
    }

    filtered.forEach(art => {
      const card = document.createElement('div');
      card.className = `article-card surface-card ${art.verified ? 'is-verified' : ''} ${art.locked ? 'is-locked' : ''}`;
      card.dataset.id = art.id;

      // Badge de estado
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
                <a href="https://www.google.com/search?q=site:decathlon.com.co+${encodeURIComponent(art.name)}" target="_blank" rel="noopener noreferrer" class="article-name-link" title="Buscar '${escapeHTML(art.name)}' en Decathlon Colombia">
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

        <div class="article-card-body">
          <div class="qty-grid">
            <div class="qty-box">
              <span class="qty-label">Cant. en Inventario</span>
              <span class="qty-value">${art.expectedQty}</span>
            </div>
            <div class="qty-box">
              <span class="qty-label">Cant. Inventariada</span>
              <div class="qty-input-wrapper">
                <input 
                  type="number" 
                  class="qty-input input-found-qty" 
                  value="${art.foundQty}" 
                  min="0" 
                  ${art.locked ? 'disabled' : ''}
                  data-id="${art.id}"
                >
              </div>
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
        </div>

        <div class="article-card-footer">
          ${art.locked ? `
            <button class="btn btn-outlined btn-sm btn-unlock-article" data-id="${art.id}">
              <span class="material-symbols-outlined text-icon">lock_open</span>
              Desbloquear edición
            </button>
          ` : `
            <div class="article-actions">
              <button class="icon-btn btn-edit-article" title="Editar detalles" data-id="${art.id}">
                <span class="material-symbols-outlined">edit</span>
              </button>
              <button class="icon-btn btn-delete-article text-danger" title="Eliminar artículo" data-id="${art.id}">
                <span class="material-symbols-outlined">delete</span>
              </button>
            </div>
          `}
        </div>
      `;

      // Eventos de interactividad en la tarjeta
      const chk = card.querySelector('.article-checkbox');
      chk.addEventListener('change', (e) => {
        if (callbacks.onToggleVerification) {
          callbacks.onToggleVerification(art.id, e.target.checked);
        }
      });

      const foundQtyInput = card.querySelector('.input-found-qty');
      if (foundQtyInput) {
        foundQtyInput.addEventListener('change', (e) => {
          const val = parseInt(e.target.value, 10) || 0;
          if (callbacks.onUpdateFoundQty) {
            callbacks.onUpdateFoundQty(art.id, val);
          }
        });
      }

      const btnUnlock = card.querySelector('.btn-unlock-article');
      if (btnUnlock) {
        btnUnlock.addEventListener('click', () => {
          if (callbacks.onUnlockArticle) {
            callbacks.onUnlockArticle(art);
          }
        });
      }

      const btnEdit = card.querySelector('.btn-edit-article');
      if (btnEdit) {
        btnEdit.addEventListener('click', () => {
          if (callbacks.onEditArticle) {
            callbacks.onEditArticle(art);
          }
        });
      }

      const btnDelete = card.querySelector('.btn-delete-article');
      if (btnDelete) {
        btnDelete.addEventListener('click', () => {
          if (callbacks.onDeleteArticle) {
            callbacks.onDeleteArticle(art);
          }
        });
      }

      const btnViewImg = card.querySelector('.btn-view-image');
      if (btnViewImg) {
        btnViewImg.addEventListener('click', (e) => {
          e.stopPropagation();
          showImageModal(art.image, art.name);
        });
      }

      container.appendChild(card);
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
          onClick: (e) => {
            elements.modalContainer.classList.add('hidden');
            elements.modalContainer.innerHTML = '';
          }
        }
      ]
    });
  }

  /**
   * Renderiza un resumen compacto del calendario de la zona.
   * @param {Array} plans - Array de planes con { id, articleId, description, startDate, endDate }
   */
  function renderZoneCalendar(plans = []) {
    const container = document.getElementById('zone-calendar');
    if (!container) return;
    container.innerHTML = '';

    const upcoming = (plans || []).slice().sort((a,b)=> new Date(a.startDate) - new Date(b.startDate));

    const header = document.createElement('div');
    header.className = 'zone-calendar-header';
    header.innerHTML = `<h3>Calendario de la Zona</h3><button class="btn btn-sm btn-outlined" id="btn-open-full-calendar">Abrir calendario</button>`;
    container.appendChild(header);

    const list = document.createElement('div');
    list.className = 'zone-calendar-list';

    console.log('[UI] renderZoneCalendar: plans=', upcoming.length);
    if (upcoming.length === 0) {
      list.innerHTML = `<div class="empty-state small">No hay planes de acción programados.</div>`;
    } else {
      upcoming.slice(0,6).forEach(p => {
        const item = document.createElement('div');
        item.className = 'zone-calendar-item';
        item.dataset.articleId = p.articleId || '';

        // color determinista
        const palette = ['#F97316','#6366f1','#06b6d4','#ef4444','#10b981','#f59e0b','#8b5cf6','#0ea5e9'];
        function hashString(s){ let h=0; for(let i=0;i<s.length;i++){ h=((h<<5)-h)+s.charCodeAt(i); h|=0;} return h; }
        const color = palette[Math.abs(hashString(p.articleId || (p.id||''))) % palette.length];

        item.style.borderLeft = `4px solid ${color}`;
        item.innerHTML = `
          <div class="zc-main"><strong class="zc-code">${escapeHTML(p.articleId || '')}</strong>
          <div class="zc-desc">${escapeHTML(p.description)}</div></div>
          <div class="zc-actions"><button class="btn btn-sm btn-outlined btn-zc-open">Abrir</button><button class="btn btn-sm btn-danger btn-zc-del">Eliminar</button></div>
        `;

          // set data attrs
          item.dataset.planId = p.id || '';
          item.dataset.articleId = p.articleId || '';
          list.appendChild(item);
      });

        // Delegated event handling for open/delete buttons (avoids listener duplication)
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

  /**
   * Inserta pequeños snippets de planes en las tarjetas de artículo.
   * @param {Array} plans
   */
  /**
   * Inyecta planes de acción en las tarjetas de artículos de la zona actual.
   * Por cada artículo, busca sus planes asociados y los muestra como snippets destacados.
   * @param {Array} plans - Array de planes de acción con { articleId, description, startDate, endDate, ... }
   */
  function injectArticlePlans(plans = []) {
    // Agrupar planes por artículo
    const byArticle = {};
    (plans || []).forEach(p => { 
      if (p.articleId) {
        (byArticle[p.articleId] = byArticle[p.articleId] || []).push(p);
      }
    });
    console.log('[UI] injectArticlePlans: Planes para', Object.keys(byArticle).length, 'artículos');

    // Palette de colores determinista
    const palette = ['#F97316','#6366f1','#06b6d4','#ef4444','#10b981','#f59e0b','#8b5cf6','#0ea5e9'];

    document.querySelectorAll('.article-card').forEach(card => {
      const aid = card.dataset.id || '';
      if (!aid) return;
      
      const container = card.querySelector('.article-card-body');
      if (!container) return;
      
      // Limpiar planes anteriores
      const old = card.querySelector('.article-plans-list');
      if (old) old.remove();

      const plansFor = byArticle[aid] || [];
      
      // Si no hay planes, no inyectar nada
      if (plansFor.length === 0) return;
      
      // Crear contenedor de planes
      const wrap = document.createElement('div');
      wrap.className = 'article-plans-list';

      // Color determinista basado en ID del artículo
      const color = palette[Math.abs(hashString(aid)) % palette.length];

      // Mostrar primeros 3 planes
      plansFor.slice(0, 3).forEach(p => {
        const el = document.createElement('div');
        el.className = 'article-plan-snippet';
        el.style.borderLeftColor = color;
        
        const formattedStart = InventoryData.formatDate(p.startDate);
        const formattedEnd = p.endDate ? InventoryData.formatDate(p.endDate) : '';
        const dateRange = formattedEnd ? `${formattedStart} — ${formattedEnd}` : formattedStart;
        
        el.innerHTML = `
          <div class="ap-main">
            <div class="ap-desc">${escapeHTML(p.description)}</div>
            <div class="ap-meta"><span class="ap-date">${escapeHTML(dateRange)}</span></div>
          </div>
        `;
        wrap.appendChild(el);
      });

      // Si hay más de 3 planes, mostrar contador y botón
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
      
      // Inyectar antes del footer
      container.appendChild(wrap);
    });

    /**
     * Genera hash simple para colorear de forma determinista
     */
    function hashString(s) {
      let h = 0;
      for (let i = 0; i < s.length; i++) {
        h = ((h << 5) - h) + s.charCodeAt(i);
        h |= 0;
      }
      return h;
    }
  }

  /**
   * Muestra un calendario mensual con eventos (soporta eventos multi-día).
   * @param {Array} plans
   */
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

      // blanks
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

        // Attach event listeners to event elements for open/delete
        setTimeout(() => {
          const events = modal.querySelectorAll('.fc-event');
          events.forEach(evtEl => {
            evtEl.addEventListener('click', (e) => {
              const planId = evtEl.dataset.planId;
              const articleId = evtEl.dataset.articleId;
              window.dispatchEvent(new CustomEvent('fullCalendar:openArticle', { detail: { articleId, planId } }));
            });
            // no delete button in full calendar (deletion handled from zone small list)
          });
        }, 50);
    };

    const m = showModal({
      title: 'Calendario de Planes de Acción',
      contentHTML: '<div class="full-calendar-root"></div>',
      buttons: [
        { text: 'Cerrar', class: 'btn-outlined', onClick: (e) => { m.closeModal(); } }
      ]
    });

    // Re-fetch modal element and render
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

    // Cerrar con backdrop o X
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
    showZonesView,
    showZoneDetailView,
    renderZonesList,
    renderStats,
    renderArticlesList,
    showModal,
    showConfirmDialog,
    showImageModal
    ,
    renderZoneCalendar,
    injectArticlePlans,
    showFullCalendar,
    escapeHTML
  };
})();
