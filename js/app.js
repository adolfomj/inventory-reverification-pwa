/**
 * app.js
 * Controlador principal de la aplicación con autenticación Supabase,
 * registro de auditoría (logs) y separación por fechas.
 */

document.addEventListener('DOMContentLoaded', () => {

  // ─── Estado global ───────────────────────────────────────────────────────────
  const AppState = {
    currentUser: null,
    isRegisterMode: false,
    activeZoneId: null,
    currentFilter: 'todos',
    currentDateFilter: 'all',
    currentSubView: 'articles',
    zoneSearchQuery: '',
    articleSearchQuery: '',
    theme: localStorage.getItem('theme_preference') || 'system'
  };

  // ─── Inicio del flujo de autenticación ───────────────────────────────────────
  async function checkAuthAndStart() {
    initTheme();

    try {
      const user = await InventoryStorage.getCurrentUser();
      if (user) {
        AppState.currentUser = user;
        InventoryUI.showAppShell(user);
        await initApp();
      } else {
        InventoryUI.showAuthView();
      }
    } catch (e) {
      console.warn('Error comprobando sesión inicial:', e);
      InventoryUI.showAuthView();
    }

    bindAuthEvents();
  }

  // ─── Eventos de Autenticación ───────────────────────────────────────────────
  function bindAuthEvents() {
    const {
      loginForm, loginUsername, loginPassword, loginError,
      loginSubmit, loginSubmitText, btnLogout
    } = InventoryUI.elements;

    // Envío del formulario de Login con Usuario y Contraseña
    loginForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      loginError?.classList.add('hidden');

      const username = loginUsername?.value.trim();
      const password = loginPassword?.value;

      if (!username || !password) {
        showAuthError('Por favor ingresa tu usuario y contraseña.');
        return;
      }

      if (loginSubmit) loginSubmit.disabled = true;
      if (loginSubmitText) loginSubmitText.textContent = 'Iniciando sesión...';

      try {
        const user = await InventoryStorage.signIn(username, password);
        AppState.currentUser = user;
        InventoryUI.showAppShell(user);
        InventoryUI.showToast(`Bienvenido @${user.username}`, 'success');
        loginForm.reset();

        try {
          await initApp();
        } catch (initErr) {
          console.warn('[App] Advertencia cargando datos:', initErr);
        }
      } catch (err) {
        showAuthError(err.message || 'Error al iniciar sesión.');
      } finally {
        if (loginSubmit) loginSubmit.disabled = false;
        if (loginSubmitText) loginSubmitText.textContent = 'Iniciar Sesión';
      }
    });

    // Logout
    btnLogout?.addEventListener('click', async () => {
      try {
        await InventoryStorage.signOut();
        AppState.currentUser = null;
        InventoryUI.showToast('Sesión cerrada.', 'info');
        InventoryUI.showAuthView();
      } catch (err) {
        InventoryUI.showToast('Error al cerrar sesión: ' + err.message, 'error');
      }
    });
  }

  function showAuthError(msg) {
    const { loginError } = InventoryUI.elements;
    if (loginError) {
      loginError.textContent = msg;
      loginError.classList.remove('hidden');
    }
  }

  // ─── Inicialización de la Aplicación (Autenticada) ───────────────────────────
  let _appInitialized = false;
  async function initApp() {
    if (_appInitialized) {
      await refreshZonesView();
      await refreshSidebarLogs();
      return;
    }
    _appInitialized = true;

    bindHeaderEvents();
    bindZoneViewEvents();
    bindZoneDetailEvents();
    bindSubViewToggleEvents();
    bindNoveltyEvents();
    bindImportExportEvents();
    await refreshZonesView();
    await refreshSidebarLogs();
    registerServiceWorker();
  }

  // ─── Tema ────────────────────────────────────────────────────────────────────
  function initTheme() {
    applyTheme(AppState.theme);

    InventoryUI.elements.themeToggleBtn?.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const nextTheme = current === 'dark' ? 'light' : 'dark';
      AppState.theme = nextTheme;
      localStorage.setItem('theme_preference', nextTheme);
      applyTheme(nextTheme);
    });

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (AppState.theme === 'system') applyTheme('system');
    });
  }

  function applyTheme(theme) {
    let effectiveTheme = theme;
    if (theme === 'system') {
      effectiveTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', effectiveTheme);
    const iconSpan = InventoryUI.elements.themeToggleBtn?.querySelector('.material-symbols-outlined');
    if (iconSpan) iconSpan.textContent = effectiveTheme === 'dark' ? 'light_mode' : 'dark_mode';
  }

  // ─── Header ──────────────────────────────────────────────────────────────────
  function bindHeaderEvents() {
    InventoryUI.elements.btnBack?.addEventListener('click', async () => {
      AppState.activeZoneId = null;
      AppState.articleSearchQuery = '';
      if (InventoryUI.elements.articleSearchInput) {
        InventoryUI.elements.articleSearchInput.value = '';
      }
      InventoryUI.showZonesView();
      await refreshZonesView();
    });

    InventoryUI.elements.btnRefreshSidebar?.addEventListener('click', async () => {
      await refreshSidebarLogs();
      InventoryUI.showToast('Actividad en vivo actualizada.', 'info');
    });

    InventoryUI.elements.btnToggleActivity?.addEventListener('click', () => {
      InventoryUI.elements.activitySidebar?.classList.toggle('show-drawer');
    });
  }

  // ─── Sub-Vistas (Artículos vs Novedades vs Logs) ──────────────────────────────
  function bindSubViewToggleEvents() {
    const { btnToggleArticles, btnToggleNovelties, btnToggleLogs } = InventoryUI.elements;

    btnToggleArticles?.addEventListener('click', async () => {
      AppState.currentSubView = 'articles';
      InventoryUI.switchSubView('articles');
      await refreshZoneDetailView();
    });

    btnToggleNovelties?.addEventListener('click', async () => {
      AppState.currentSubView = 'novelties';
      InventoryUI.switchSubView('novelties');
      await refreshNoveltiesView();
    });

    btnToggleLogs?.addEventListener('click', async () => {
      AppState.currentSubView = 'logs';
      InventoryUI.switchSubView('logs');
      await refreshLogsView();
    });
  }

  // ─── Vista de Zonas ───────────────────────────────────────────────────────────
  async function refreshZonesView() {
    try {
      const zones = await InventoryStorage.getAllZones();
      InventoryUI.renderZonesList(zones, AppState.zoneSearchQuery, {
        onSelectZone: (zoneId) => openZoneDetail(zoneId),
        onDeleteZone: (zone)   => confirmDeleteZone(zone)
      });
      await refreshSidebarLogs();
    } catch (err) {
      console.error('[App] Error cargando zonas:', err);
      InventoryUI.showToast('Error al cargar zonas desde Supabase: ' + err.message, 'error');
    }
  }

  async function openZoneDetail(zoneId) {
    try {
      const zone = await InventoryStorage.getZoneById(zoneId);
      if (!zone) {
        InventoryUI.showToast('No se encontró la zona seleccionada', 'error');
        return;
      }

      AppState.activeZoneId = zoneId;
      AppState.currentFilter = 'todos';
      AppState.currentDateFilter = 'all';
      AppState.currentSubView = 'articles';
      AppState.articleSearchQuery = '';

      if (InventoryUI.elements.articleSearchInput) {
        InventoryUI.elements.articleSearchInput.value = '';
      }

      InventoryUI.elements.filterTabs?.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.filter === 'todos');
      });

      InventoryUI.elements.dateFilterTabs?.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.dateFilter === 'all');
      });

      InventoryUI.showZoneDetailView(zone);
      await refreshZoneDetailView();
    } catch (err) {
      InventoryUI.showToast('Error al abrir zona: ' + err.message, 'error');
    }
  }

  async function refreshZoneDetailView() {
    if (!AppState.activeZoneId) return;
    try {
      const zone = await InventoryStorage.getZoneById(AppState.activeZoneId);
      if (!zone) {
        InventoryUI.showZonesView();
        await refreshZonesView();
        return;
      }

      const stats = InventoryData.calculateZoneStats(zone.articles);
      InventoryUI.renderStats(stats);

      // Renderizar calendario de la zona
      try {
        let zonePlans = await InventoryStorage.getActionPlansForZone(AppState.activeZoneId);
        zonePlans = zonePlans.map(p => {
          const art = (zone.articles || []).find(a => a.id === p.articleId);
          return Object.assign({}, p, { articleName: art ? art.name : null });
        });
        InventoryUI.renderZoneCalendar(zonePlans);
      } catch (e) {
        console.warn('No se pudieron cargar planes de acción:', e);
      }

      // Renderizar lista de artículos agrupada por fechas con periodo
      InventoryUI.renderArticlesList(
        zone.articles,
        AppState.currentFilter,
        AppState.currentDateFilter,
        AppState.articleSearchQuery,
        {
          onToggleVerification: (articleId, isVerified) => handleToggleVerification(articleId, isVerified),
          onUpdateFoundQty:     (articleId, foundQty)   => handleUpdateFoundQty(articleId, foundQty),
          onUnlockArticle:      (article)                => handleUnlockArticle(article),
          onEditArticle:        (article)                => openArticleModal(article),
          onDeleteArticle:      (article)                => confirmDeleteArticle(article)
        }
      );

      // Inyectar snippets de planes en tarjetas
      try {
        let zonePlans = await InventoryStorage.getActionPlansForZone(AppState.activeZoneId);
        InventoryUI.injectArticlePlans(zonePlans);
      } catch (e) { /* ignore */ }

      await refreshSidebarLogs();

    } catch (err) {
      console.error('[App] Error refrescando detalle de zona:', err);
      InventoryUI.showToast('Error al cargar artículos: ' + err.message, 'error');
    }
  }

  // ─── Novedades View ──────────────────────────────────────────────────────────
  async function refreshNoveltiesView() {
    if (!AppState.activeZoneId) return;
    try {
      const novelties = await InventoryStorage.getNoveltiesForZone(AppState.activeZoneId);
      InventoryUI.renderNoveltiesList(novelties, {
        onToggleNovelty: async (novId, isConfirmed) => {
          try {
            await InventoryStorage.toggleNoveltyConfirmation(AppState.activeZoneId, novId, isConfirmed);
            InventoryUI.showToast(isConfirmed ? 'Novedad resuelta ✓' : 'Novedad marcada pendiente', 'info');
            await refreshNoveltiesView();
          } catch (e) {
            InventoryUI.showToast('Error: ' + e.message, 'error');
          }
        },
        onDeleteNovelty: async (novId) => {
          InventoryUI.showConfirmDialog('Eliminar Novedad', '¿Deseas eliminar esta novedad?', async () => {
            try {
              await InventoryStorage.deleteNovelty(AppState.activeZoneId, novId);
              InventoryUI.showToast('Novedad eliminada.', 'info');
              await refreshNoveltiesView();
            } catch (e) {
              InventoryUI.showToast('Error: ' + e.message, 'error');
            }
          }, 'Eliminar');
        }
      });
    } catch (e) {
      console.error('[App] Error cargando novedades:', e);
    }
  }

  function bindNoveltyEvents() {
    InventoryUI.elements.fabAddNovelty?.addEventListener('click', () => {
      if (!AppState.activeZoneId) return;
      const modal = InventoryUI.showModal({
        title: 'Nueva Novedad / Tarea',
        contentHTML: `
          <form id="form-novelty" class="form-vertical">
            <div class="input-group">
              <label for="novelty-text" class="input-label">Descripción de la novedad o tarea *</label>
              <textarea id="novelty-text" class="input-field textarea-field" rows="3" placeholder="Ej: Mercancía pendiente de etiquetar en estante 4..." required autofocus></textarea>
            </div>
          </form>
        `,
        buttons: [
          { text: 'Cancelar', class: 'btn-outlined', onClick: () => modal.closeModal() },
          {
            text: 'Guardar Novedad',
            class: 'btn-primary',
            onClick: async () => {
              const textInput = document.getElementById('novelty-text');
              const text = textInput ? textInput.value.trim() : '';
              if (!text) {
                InventoryUI.showToast('Ingresa la descripción de la novedad.', 'warning');
                return;
              }
              try {
                await InventoryStorage.saveNovelty(AppState.activeZoneId, { text });
                InventoryUI.showToast('Novedad guardada correctamente.', 'success');
                modal.closeModal();
                await refreshNoveltiesView();
              } catch (e) {
                InventoryUI.showToast('Error al guardar novedad: ' + e.message, 'error');
              }
            }
          }
        ]
      });
    });
  }

  // ─── Logs / Historial View ───────────────────────────────────────────────────
  async function refreshLogsView() {
    if (!AppState.activeZoneId || AppState.currentUser?.role !== 'admin') return;
    try {
      const logs = await InventoryStorage.getActivityLogs(AppState.activeZoneId);
      InventoryUI.renderActivityLogs(logs);
    } catch (e) {
      console.error('[App] Error cargando logs:', e);
    }
  }

  // ─── Eventos Vista de Zonas ───────────────────────────────────────────────────
  function bindZoneViewEvents() {
    InventoryUI.elements.zoneSearchInput?.addEventListener('input', async (e) => {
      AppState.zoneSearchQuery = e.target.value;
      await refreshZonesView();
    });

    InventoryUI.elements.fabAddZone?.addEventListener('click', () => openZoneModal());
  }

  function openZoneModal(zoneToEdit = null) {
    const isEdit = Boolean(zoneToEdit);
    const contentHTML = `
      <form id="form-zone" class="form-vertical">
        <div class="input-group">
          <label for="zone-name" class="input-label">Nombre de la Zona *</label>
          <input
            type="text"
            id="zone-name"
            class="input-field"
            placeholder="Ej: Zona A - Almacén Central"
            value="${zoneToEdit ? InventoryUI.escapeHTML(zoneToEdit.name) : ''}"
            required
            autofocus
          />
        </div>
      </form>
    `;

    const modal = InventoryUI.showModal({
      title: isEdit ? 'Editar Zona' : 'Nueva Zona de Responsabilidad',
      contentHTML,
      buttons: [
        { text: 'Cancelar', class: 'btn-outlined', onClick: () => modal.closeModal() },
        {
          text: isEdit ? 'Guardar Cambios' : 'Crear Zona',
          class: 'btn-primary',
          onClick: async () => {
            const nameInput = document.getElementById('zone-name');
            const name = nameInput ? nameInput.value.trim() : '';
            if (!name) {
              InventoryUI.showToast('Por favor ingrese el nombre de la zona.', 'warning');
              nameInput?.focus();
              return;
            }
            try {
              if (isEdit) {
                zoneToEdit.name = name;
                await InventoryStorage.saveZone(zoneToEdit);
                InventoryUI.showToast('Zona actualizada con éxito.', 'success');
              } else {
                await InventoryStorage.saveZone({ name });
                InventoryUI.showToast('Zona creada con éxito.', 'success');
              }
              modal.closeModal();
              await refreshZonesView();
            } catch (err) {
              InventoryUI.showToast('Error al guardar zona: ' + err.message, 'error');
            }
          }
        }
      ]
    });
  }

  function confirmDeleteZone(zone) {
    InventoryUI.showConfirmDialog(
      'Eliminar Zona',
      `¿Está seguro de que desea eliminar la zona "${zone.name}" con sus ${zone.articles.length} artículos? Esta acción no se puede deshacer.`,
      async () => {
        try {
          await InventoryStorage.deleteZone(zone.id);
          InventoryUI.showToast(`Zona "${zone.name}" eliminada.`, 'info');
          await refreshZonesView();
        } catch (err) {
          InventoryUI.showToast('Error al eliminar zona: ' + err.message, 'error');
        }
      },
      'Eliminar'
    );
  }

  // ─── Eventos Vista de Detalle ─────────────────────────────────────────────────
  function bindZoneDetailEvents() {
    InventoryUI.elements.articleSearchInput?.addEventListener('input', async (e) => {
      AppState.articleSearchQuery = e.target.value;
      await refreshZoneDetailView();
    });

    InventoryUI.elements.filterTabs?.forEach(tab => {
      tab.addEventListener('click', async () => {
        InventoryUI.elements.filterTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        AppState.currentFilter = tab.dataset.filter;
        await refreshZoneDetailView();
      });
    });

    InventoryUI.elements.dateFilterTabs?.forEach(tab => {
      tab.addEventListener('click', async () => {
        InventoryUI.elements.dateFilterTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        AppState.currentDateFilter = tab.dataset.dateFilter;
        await refreshZoneDetailView();
      });
    });

    InventoryUI.elements.fabAddArticle?.addEventListener('click', () => openArticleModal());
  }

  // ─── Sidebar de Actividad en Vivo ───────────────────────────────────────────
  async function refreshSidebarLogs() {
    if (AppState.currentUser?.role !== 'admin') return;
    try {
      const logs = await InventoryStorage.getActivityLogs();
      InventoryUI.renderActivitySidebarFeed(logs);
    } catch (e) {
      console.warn('[App] Error actualizando feed lateral:', e);
    }
  }

  // ─── Modal de Artículo ────────────────────────────────────────────────────────
  function openArticleModal(articleToEdit = null) {
    if (!AppState.activeZoneId) return;
    const isEdit = Boolean(articleToEdit);
    let currentImageDataUrl = isEdit ? (articleToEdit.image || null) : null;

    const contentHTML = `
      <form id="form-article" class="form-vertical">
        <div class="input-group">
          <label for="art-id" class="input-label">Código ID</label>
          <input
            type="text"
            id="art-id"
            class="input-field"
            placeholder="Ej: 8541234 (Dejar en blanco para auto-generar)"
            value="${isEdit ? articleToEdit.id : ''}"
            ${isEdit ? 'readonly' : ''}
          />
        </div>

        <div class="input-group">
          <label for="art-name" class="input-label">Nombre del Artículo *</label>
          <input
            type="text"
            id="art-name"
            class="input-field"
            placeholder="Ej: Monitor LED 24 Pulgadas"
            value="${isEdit ? InventoryUI.escapeHTML(articleToEdit.name) : ''}"
            required
          />
        </div>

        <div class="form-row">
          <div class="input-group">
            <label for="art-expected" class="input-label">Cant. en Inventario *</label>
            <input
              type="number"
              id="art-expected"
              class="input-field"
              min="0"
              value="${isEdit ? articleToEdit.expectedQty : 0}"
              required
            />
          </div>
          <div class="input-group">
            <label for="art-found" class="input-label">Cant. Inventariada *</label>
            <input
              type="number"
              id="art-found"
              class="input-field"
              min="0"
              value="${isEdit ? articleToEdit.foundQty : 0}"
              required
            />
          </div>
        </div>

        <div class="input-group">
          <label for="art-comment" class="input-label">Comentarios / Observaciones</label>
          <textarea
            id="art-comment"
            class="input-field textarea-field"
            rows="2"
            placeholder="Ej: Empaque abierto, ubicado en estante superior B3..."
          >${isEdit ? InventoryUI.escapeHTML(articleToEdit.comment || '') : ''}</textarea>
        </div>

        <div class="input-group">
          <label class="input-label">Fotografía del Artículo</label>
          <div class="image-picker-container">
            <div id="art-image-preview" class="image-preview-box ${currentImageDataUrl ? '' : 'hidden'}">
              <img id="art-preview-img" src="${currentImageDataUrl || ''}" alt="Vista previa">
              <button type="button" id="btn-remove-image" class="btn-remove-img" title="Quitar fotografía">
                <span class="material-symbols-outlined">delete</span>
              </button>
            </div>
            <div class="image-picker-actions">
              <label for="art-image-input" class="btn btn-outlined btn-sm btn-upload-image">
                <span class="material-symbols-outlined text-icon">photo_camera</span>
                ${currentImageDataUrl ? 'Cambiar Foto' : 'Tomar / Adjuntar Foto'}
              </label>
              <input type="file" id="art-image-input" accept="image/*" capture="environment" class="hidden">
            </div>
          </div>
        </div>

        ${isEdit ? `
          <div class="input-group checkbox-group">
            <label class="checkbox-container">
              <input type="checkbox" id="art-verified" ${articleToEdit.verified ? 'checked' : ''}>
              <span class="checkmark"></span>
              Marcar como Verificado
            </label>
          </div>
        ` : ''}
      </form>
    `;

    const modal = InventoryUI.showModal({
      title: isEdit ? 'Editar Artículo' : 'Nuevo Artículo en Zona',
      contentHTML,
      buttons: [
        { text: 'Cancelar', class: 'btn-outlined', onClick: () => modal.closeModal() },
        {
          text: isEdit ? 'Guardar Cambios' : 'Agregar Artículo',
          class: 'btn-primary',
          onClick: async () => {
            const nameInput     = document.getElementById('art-name');
            const idInput       = document.getElementById('art-id');
            const expectedInput = document.getElementById('art-expected');
            const foundInput    = document.getElementById('art-found');
            const commentInput  = document.getElementById('art-comment');
            const verifiedChk   = document.getElementById('art-verified');

            const name        = nameInput?.value.trim();
            const expectedQty = parseInt(expectedInput?.value, 10) || 0;
            const foundQty    = parseInt(foundInput?.value, 10)    || 0;
            const comment     = commentInput ? commentInput.value.trim() : '';
            const id          = idInput ? idInput.value.trim() : null;

            if (!name) {
              InventoryUI.showToast('Debe ingresar el nombre del artículo.', 'warning');
              nameInput?.focus();
              return;
            }

            const articleData = {
              id:         isEdit ? articleToEdit.id : (id || undefined),
              _dbId:      isEdit ? articleToEdit._dbId : undefined,
              name,
              expectedQty,
              foundQty,
              comment,
              verified:   isEdit ? (verifiedChk ? verifiedChk.checked : articleToEdit.verified) : false,
              verifiedAt: isEdit ? articleToEdit.verifiedAt : null,
              locked:     isEdit ? articleToEdit.locked : false,
              image:      currentImageDataUrl,
              createdAt:  isEdit ? articleToEdit.createdAt : new Date().toISOString()
            };

            try {
              await InventoryStorage.saveArticle(AppState.activeZoneId, articleData);
              InventoryUI.showToast(isEdit ? 'Artículo actualizado.' : 'Artículo agregado a la zona.', 'success');
              modal.closeModal();
              await refreshZoneDetailView();
            } catch (err) {
              InventoryUI.showToast('Error al guardar artículo: ' + err.message, 'error');
            }
          }
        }
      ]
    });

    const fileInput   = document.getElementById('art-image-input');
    const previewBox  = document.getElementById('art-image-preview');
    const previewImg  = document.getElementById('art-preview-img');
    const btnRemoveImg = document.getElementById('btn-remove-image');

    if (fileInput) {
      fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          InventoryUI.showToast('Procesando imagen...', 'info');
          const compressedDataUrl = await InventoryData.compressImage(file);
          currentImageDataUrl = compressedDataUrl;
          if (previewImg) previewImg.src = compressedDataUrl;
          previewBox?.classList.remove('hidden');
          InventoryUI.showToast('Fotografía cargada correctamente.', 'success');
        } catch (err) {
          InventoryUI.showToast(err.message || 'Error al procesar la imagen.', 'error');
        }
      });
    }

    if (btnRemoveImg) {
      btnRemoveImg.addEventListener('click', () => {
        currentImageDataUrl = null;
        if (previewImg) previewImg.src = '';
        previewBox?.classList.add('hidden');
        if (fileInput) fileInput.value = '';
        InventoryUI.showToast('Fotografía removida.', 'info');
      });
    }
  }

  // ─── Verificación de Artículos ───────────────────────────────────────────────
  async function handleToggleVerification(articleId, isVerified) {
    if (!AppState.activeZoneId) return;
    try {
      await InventoryStorage.toggleArticleVerification(AppState.activeZoneId, articleId, isVerified);
      InventoryUI.showToast(
        isVerified ? 'Artículo verificado ✓' : 'Artículo marcado como pendiente',
        isVerified ? 'success' : 'info'
      );
      await refreshZoneDetailView();
    } catch (err) {
      InventoryUI.showToast('Error al cambiar verificación: ' + err.message, 'error');
    }
  }

  async function handleUpdateFoundQty(articleId, foundQty) {
    if (!AppState.activeZoneId) return;
    try {
      const zone = await InventoryStorage.getZoneById(AppState.activeZoneId);
      if (!zone) return;
      const article = zone.articles.find(a => a.id === articleId);
      if (!article) return;

      if (article.locked) {
        InventoryUI.showToast('El artículo está bloqueado. Debe desbloquearlo primero.', 'warning');
        await refreshZoneDetailView();
        return;
      }

      article.foundQty = foundQty;
      await InventoryStorage.saveArticle(AppState.activeZoneId, article);
      await refreshZoneDetailView();
    } catch (err) {
      InventoryUI.showToast('Error al actualizar cantidad: ' + err.message, 'error');
    }
  }

  function handleUnlockArticle(article) {
    InventoryUI.showConfirmDialog(
      'Desbloquear edición',
      `¿Desea desbloquear la edición del artículo "${article.name}" (${article.id})?`,
      async () => {
        try {
          await InventoryStorage.unlockArticle(AppState.activeZoneId, article.id);
          InventoryUI.showToast('Edición desbloqueada.', 'info');
          await refreshZoneDetailView();
        } catch (err) {
          InventoryUI.showToast('Error al desbloquear: ' + err.message, 'error');
        }
      },
      'Desbloquear'
    );
  }

  function confirmDeleteArticle(article) {
    InventoryUI.showConfirmDialog(
      'Eliminar Artículo',
      `¿Está seguro de eliminar el artículo "${article.name}"?`,
      async () => {
        try {
          await InventoryStorage.deleteArticle(AppState.activeZoneId, article.id);
          InventoryUI.showToast('Artículo eliminado.', 'info');
          await refreshZoneDetailView();
        } catch (err) {
          InventoryUI.showToast('Error al eliminar artículo: ' + err.message, 'error');
        }
      },
      'Eliminar'
    );
  }

  // ─── Importar / Exportar ──────────────────────────────────────────────────────
  function bindImportExportEvents() {
    const triggerImport = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
          try {
            const result = await InventoryStorage.importFromJSON(event.target.result);
            InventoryUI.showToast(
              `Importación exitosa: ${result.zonesCount} zonas y ${result.articlesCount} artículos procesados.`,
              'success'
            );
            if (AppState.activeZoneId) {
              await refreshZoneDetailView();
            } else {
              await refreshZonesView();
            }
          } catch (err) {
            InventoryUI.showToast(err.message, 'error');
          }
        };
        reader.readAsText(file);
      };
      input.click();
    };

    InventoryUI.elements.btnExportZone?.addEventListener('click', async () => {
      if (!AppState.activeZoneId) return;
      try {
        const zone = await InventoryStorage.getZoneById(AppState.activeZoneId);
        if (!zone) return;
        const jsonStr  = await InventoryStorage.exportZoneToJSON(AppState.activeZoneId);
        const filename = `zona_${zone.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}.json`;
        downloadFile(jsonStr, filename, 'application/json');
        InventoryUI.showToast('Zona exportada correctamente.', 'success');
      } catch (err) {
        InventoryUI.showToast('Error al exportar zona: ' + err.message, 'error');
      }
    });

    const exportAll = async () => {
      try {
        const jsonStr  = await InventoryStorage.exportAllToJSON();
        const filename = `inventario_completo_${Date.now()}.json`;
        downloadFile(jsonStr, filename, 'application/json');
        InventoryUI.showToast('Respaldo completo exportado a JSON.', 'success');
      } catch (err) {
        InventoryUI.showToast('Error al exportar: ' + err.message, 'error');
      }
    };

    InventoryUI.elements.btnGlobalExport?.addEventListener('click', exportAll);
    InventoryUI.elements.btnBackupExport?.addEventListener('click', exportAll);
    InventoryUI.elements.btnGlobalImport?.addEventListener('click', triggerImport);
    InventoryUI.elements.btnBackupImport?.addEventListener('click', triggerImport);
  }

  function downloadFile(content, fileName, contentType) {
    const a    = document.createElement('a');
    const file = new Blob([content], { type: contentType });
    a.href     = URL.createObjectURL(file);
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ─── Service Worker ───────────────────────────────────────────────────────────
  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then((reg) => {
            if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            reg.addEventListener('updatefound', () => {
              const newWorker = reg.installing;
              if (newWorker) {
                newWorker.addEventListener('statechange', () => {
                  if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    window.location.reload();
                  }
                });
              }
            });
          })
          .catch((err) => console.error('Error Service Worker:', err));
      });
    }
  }

  // ─── Calendario Custom Events ─────────────────────────────────────────────────
  window.addEventListener('fullCalendar:openArticle', async (ev) => {
    const { articleId } = ev.detail || {};
    if (!articleId || !AppState.activeZoneId) return;
    try {
      const zone = await InventoryStorage.getZoneById(AppState.activeZoneId);
      if (!zone) return;
      const article = zone.articles.find(a => a.id === articleId);
      if (article) openArticleModal(article);
    } catch (err) {
      console.error('[App] fullCalendar:openArticle error', err);
    }
  });

  window.addEventListener('fullCalendar:deletePlan', async (ev) => {
    const { articleId, planId } = ev.detail || {};
    if (!articleId || !planId || !AppState.activeZoneId) return;
    InventoryUI.showConfirmDialog('Eliminar Plan', '¿Eliminar este plan de acción?', async () => {
      try {
        await InventoryStorage.deleteActionPlan(AppState.activeZoneId, articleId, planId);
        InventoryUI.showToast('Plan eliminado.', 'info');
        await refreshZoneDetailView();
      } catch (err) {
        InventoryUI.showToast('Error al eliminar plan: ' + err.message, 'error');
      }
    }, 'Eliminar');
  });

  window.addEventListener('zoneCalendar:openArticle', async (ev) => {
    const { articleId } = ev.detail || {};
    if (!articleId || !AppState.activeZoneId) return;
    try {
      const zone = await InventoryStorage.getZoneById(AppState.activeZoneId);
      const article = zone?.articles.find(a => a.id === articleId);
      if (article) openArticleModal(article);
    } catch (err) { console.error(err); }
  });

  // ─── Arrancar Autenticación ──────────────────────────────────────────────────
  checkAuthAndStart();
});
