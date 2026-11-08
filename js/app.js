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
    currentSubView: 'articles',
    zoneVisibilityFilter: 'all',
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

    InventoryUI.elements.btnToggleActivity?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const isOpen = InventoryUI.toggleActivityDropdown();
      if (isOpen) {
        await refreshSidebarLogs();
      }
    });

    InventoryUI.elements.btnCloseActivity?.addEventListener('click', () => {
      InventoryUI.closeActivityDropdown();
    });

    InventoryUI.elements.activityDropdownBackdrop?.addEventListener('click', () => {
      InventoryUI.closeActivityDropdown();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && InventoryUI.isActivityDropdownOpen()) {
        InventoryUI.closeActivityDropdown();
      }
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
      const isAdmin = AppState.currentUser?.role === 'admin';
      InventoryUI.renderZonesList(zones, AppState.zoneSearchQuery, {
        onSelectZone: (zoneId) => openZoneDetail(zoneId),
        onDeleteZone: (zone)   => confirmDeleteZone(zone),
        onToggleZoneVisibility: (zone, hide) => handleToggleZoneVisibility(zone, hide)
      }, isAdmin, AppState.zoneVisibilityFilter);
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
      AppState.currentSubView = 'articles';
      AppState.articleSearchQuery = '';

      if (InventoryUI.elements.articleSearchInput) {
        InventoryUI.elements.articleSearchInput.value = '';
      }

      InventoryUI.elements.filterTabs?.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.filter === 'todos');
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

      // Renderizar lista de artículos agrupada por fechas (sin filtro de periodo, organizada por carpetas)
      InventoryUI.renderArticlesList(
        zone.articles,
        AppState.currentFilter,
        AppState.articleSearchQuery,
        {
          onToggleVerification:   (articleId, isVerified) => handleToggleVerification(articleId, isVerified),
          onUpdateFoundQty:       (articleId, foundQty)   => handleUpdateFoundQty(articleId, foundQty),
          onUnlockArticle:        (article)               => handleUnlockArticle(article),
          onOpenPlanModal:        (article)               => openActionPlanModal(article),
          onViewArticleHistory:   (article)               => openArticleHistoryModal(article),
          onEditArticle:          (article)               => openArticleModal(article),
          onDeleteArticle:        (article)               => confirmDeleteArticle(article)
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
              <div class="label-with-action">
                <label for="novelty-text" class="input-label">Descripción de la novedad o tarea *</label>
                <button type="button" class="btn-voice-dictate" id="btn-voice-novelty" title="Dictar con el micrófono">
                  <span class="material-symbols-outlined text-icon">mic</span> Dictar
                </button>
              </div>
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

      const btnVoiceNov = document.getElementById('btn-voice-novelty');
      const novTextarea = document.getElementById('novelty-text');
      if (btnVoiceNov && novTextarea) {
        btnVoiceNov.addEventListener('click', () => startVoiceDictation(novTextarea, btnVoiceNov));
      }
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

    // Pestañas de filtro de zonas para Admin (Todas / Activas / Ocultas)
    const adminFilterTabs = document.querySelectorAll('#zones-admin-filters .filter-tab');
    adminFilterTabs.forEach(tab => {
      tab.addEventListener('click', async () => {
        adminFilterTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        AppState.zoneVisibilityFilter = tab.dataset.zoneFilter || 'all';
        await refreshZonesView();
      });
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

  async function handleToggleZoneVisibility(zone, hide) {
    // Si va a ocultar: pedir confirmación
    if (hide) {
      InventoryUI.showConfirmDialog(
        'Ocultar Zona',
        `La zona "${zone.name}" quedará oculta para los auditores. Tú (admin) seguirás viéndola marcada como oculta. ¿Deseas continuar?`,
        async () => {
          try {
            await InventoryStorage.toggleZoneVisibility(zone.id, true);
            InventoryUI.showToast(`Zona "${zone.name}" ocultada.`, 'info');
            await refreshZonesView();
          } catch (err) {
            InventoryUI.showToast('Error al ocultar zona: ' + err.message, 'error');
          }
        },
        'Ocultar'
      );
    } else {
      // Mostrar: no necesita confirmación
      try {
        await InventoryStorage.toggleZoneVisibility(zone.id, false);
        InventoryUI.showToast(`Zona "${zone.name}" visible nuevamente.`, 'success');
        await refreshZonesView();
      } catch (err) {
        InventoryUI.showToast('Error al mostrar zona: ' + err.message, 'error');
      }
    }
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

    InventoryUI.elements.fabAddArticle?.addEventListener('click', () => openArticleModal());

    InventoryUI.elements.btnScanBarcode?.addEventListener('click', () => {
      if (!AppState.activeZoneId) return;
      openBarcodeScannerModal(async (scannedCode) => {
        const cleanCode = String(scannedCode || '').trim();
        if (!cleanCode) return;
        try {
          const zone = await InventoryStorage.getZoneById(AppState.activeZoneId);
          const existing = (zone?.articles || []).find(a => String(a.id).toLowerCase() === cleanCode.toLowerCase());
          if (existing) {
            AppState.articleSearchQuery = cleanCode;
            if (InventoryUI.elements.articleSearchInput) {
              InventoryUI.elements.articleSearchInput.value = cleanCode;
            }
            await refreshZoneDetailView();
            InventoryUI.showToast(`Artículo encontrado: ${existing.name}`, 'success');
          } else {
            InventoryUI.showToast(`Código ${cleanCode} no registrado. Creando artículo...`, 'info');
            openArticleModal(null, cleanCode);
          }
        } catch (err) {
          openArticleModal(null, cleanCode);
        }
      });
    });

    InventoryUI.elements.btnShareSummary?.addEventListener('click', () => handleShareZoneSummary());
    InventoryUI.elements.btnExportCsv?.addEventListener('click', () => handleExportZoneCSV());
  }

  // ─── Sidebar de Actividad en Vivo (Visible para todos los usuarios autenticados) ───
  async function refreshSidebarLogs() {
    if (!AppState.currentUser) return;
    try {
      const logs = await InventoryStorage.getActivityLogs();
      const isAdmin = AppState.currentUser?.role === 'admin';
      InventoryUI.renderActivitySidebarFeed(logs, isAdmin);
    } catch (e) {
      console.warn('[App] Error actualizando feed lateral:', e);
    }
  }

  // ─── Dictado por Voz Continuo (Web Speech API sin repetición ni interrupciones) ───
  let _activeVoiceSession = null;

  function startVoiceDictation(targetInput, btnEl) {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      InventoryUI.showToast('Tu navegador no soporta dictado por voz directo. Usa el micrófono del teclado.', 'warning');
      targetInput?.focus();
      return;
    }

    // Si ya está grabando en este botón, al tocarlo de nuevo se detiene
    if (_activeVoiceSession && _activeVoiceSession.btnEl === btnEl) {
      _activeVoiceSession.stop();
      return;
    }

    // Si había otra sesión abierta en otro campo, detenerla primero
    if (_activeVoiceSession) {
      _activeVoiceSession.stop();
    }

    let isStoppedByUser = false;
    let committedText = targetInput ? targetInput.value.trim() : '';
    let currentSessionTranscript = '';
    const defaultBtnHTML = '<span class="material-symbols-outlined text-icon">mic</span> Dictar';

    const rec = new SpeechRec();
    rec.lang = 'es-CO';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    const updateUIListening = (listening) => {
      if (!btnEl) return;
      if (listening) {
        btnEl.classList.add('is-recording');
        btnEl.innerHTML = '<span class="material-symbols-outlined text-icon">stop_circle</span> Detener';
      } else {
        btnEl.classList.remove('is-recording');
        btnEl.innerHTML = defaultBtnHTML;
      }
    };

    const stopSession = () => {
      isStoppedByUser = true;
      _activeVoiceSession = null;
      updateUIListening(false);
      try { rec.stop(); } catch (e) { /* ignore */ }
    };

    _activeVoiceSession = { btnEl, stop: stopSession };
    updateUIListening(true);

    // Detener el micrófono automáticamente si se cierra o guarda el modal
    document.querySelectorAll('#modal-close-btn, .modal-backdrop, #modal-footer-btns .btn').forEach(el => {
      el.addEventListener('click', () => {
        if (_activeVoiceSession) _activeVoiceSession.stop();
      }, { once: true });
    });

    rec.onresult = (event) => {
      if (!targetInput || isStoppedByUser) return;

      // Construir transcripción de la sesión actual deduplicando solapamientos de Android Chrome
      let sessionText = '';
      for (let i = 0; i < event.results.length; i++) {
        const piece = (event.results[i]?.[0]?.transcript || '').trim();
        if (!piece) continue;

        if (!sessionText) {
          sessionText = piece;
        } else {
          const lowerSession = sessionText.toLowerCase();
          const lowerPiece = piece.toLowerCase();

          if (lowerPiece.startsWith(lowerSession)) {
            // Android Chrome devuelve acumulado en cada resultado sucesivo
            sessionText = piece;
          } else if (lowerSession.endsWith(lowerPiece)) {
            // Evitar duplicado exacto al pasar de interim a final
          } else {
            // Verificar si hay solapamiento parcial al final de sessionText y el inicio de piece
            let merged = false;
            const wordsSession = sessionText.split(/\s+/);
            const wordsPiece = piece.split(/\s+/);
            const maxOverlap = Math.min(wordsSession.length, wordsPiece.length, 6);
            for (let k = maxOverlap; k >= 1; k--) {
              const tail = wordsSession.slice(-k).join(' ').toLowerCase();
              const head = wordsPiece.slice(0, k).join(' ').toLowerCase();
              if (tail === head) {
                const remainder = wordsPiece.slice(k).join(' ');
                if (remainder) sessionText = `${sessionText} ${remainder}`;
                merged = true;
                break;
              }
            }
            if (!merged) {
              sessionText = `${sessionText} ${piece}`;
            }
          }
        }
      }

      currentSessionTranscript = sessionText;
      if (currentSessionTranscript) {
        const sep = committedText && !/[.!?]$/.test(committedText) ? ' ' : (committedText ? ' ' : '');
        targetInput.value = committedText ? `${committedText}${sep}${currentSessionTranscript}` : currentSessionTranscript;
        targetInput.scrollTop = targetInput.scrollHeight;
      }
    };

    rec.onerror = (event) => {
      const errType = event?.error || '';
      if (errType === 'not-allowed' || errType === 'service-not-allowed') {
        InventoryUI.showToast('Permiso de micrófono denegado en el navegador.', 'warning');
        stopSession();
      } else if (errType !== 'no-speech' && errType !== 'aborted') {
        stopSession();
      }
    };

    rec.onend = () => {
      // Consolidar lo que se haya dictado hasta este momento como base fija
      if (targetInput) {
        committedText = targetInput.value.trim();
      }
      currentSessionTranscript = '';

      // Si el usuario no ha pulsado "Detener" y el campo sigue abierto en pantalla, mantener el micrófono activo
      if (!isStoppedByUser && targetInput && document.body.contains(targetInput)) {
        try {
          rec.start();
          return;
        } catch (e) { /* fallthrough to stop */ }
      }
      stopSession();
    };

    try {
      rec.start();
    } catch (e) {
      stopSession();
    }
  }

  // ─── Escáner de Código de Barras / QR con Cámara ──────────────────────────────
  function openBarcodeScannerModal(onCodeDetected) {
    let videoStream = null;
    let scanInterval = null;
    let isClosed = false;

    const stopScanner = () => {
      isClosed = true;
      if (scanInterval) clearInterval(scanInterval);
      if (videoStream) {
        videoStream.getTracks().forEach(t => t.stop());
        videoStream = null;
      }
    };

    const modal = InventoryUI.showModal({
      title: '📷 Escanear Código de Artículo',
      contentHTML: `
        <div class="scanner-modal-wrapper">
          <div class="scanner-viewport" id="scanner-viewport">
            <video id="scanner-video" autoplay playsinline muted></video>
            <div class="scanner-laser"></div>
          </div>
          <p class="scanner-status-msg" id="scanner-status-msg">Apunta la cámara al código de barras o QR del artículo...</p>
          <div class="scanner-manual-box">
            <label for="scanner-manual-input" class="input-label">¿No enfoca? Ingresa o pega el código manualmente:</label>
            <div class="input-with-btn-row">
              <input type="text" id="scanner-manual-input" class="input-field" inputmode="numeric" placeholder="Ej: 8541234">
              <button type="button" class="btn btn-primary btn-sm" id="btn-scanner-manual-ok">Usar</button>
            </div>
          </div>
        </div>
      `,
      buttons: [
        {
          text: 'Cancelar',
          class: 'btn-outlined',
          onClick: () => {
            stopScanner();
            modal.closeModal();
          }
        }
      ]
    });

    document.getElementById('modal-close-btn')?.addEventListener('click', stopScanner);
    document.querySelector('.modal-backdrop')?.addEventListener('click', stopScanner);

    const manualInput = document.getElementById('scanner-manual-input');
    const btnManualOk = document.getElementById('btn-scanner-manual-ok');
    const submitManual = () => {
      const val = manualInput?.value.trim();
      if (!val) return;
      stopScanner();
      modal.closeModal();
      if (onCodeDetected) onCodeDetected(val);
    };
    btnManualOk?.addEventListener('click', submitManual);
    manualInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitManual();
      }
    });

    const videoEl = document.getElementById('scanner-video');
    const statusMsg = document.getElementById('scanner-status-msg');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (statusMsg) statusMsg.textContent = 'Cámara no disponible en este navegador. Usa el campo manual de abajo.';
      manualInput?.focus();
      return;
    }

    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
    }).then(stream => {
      if (isClosed) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }
      videoStream = stream;
      if (videoEl) {
        videoEl.srcObject = stream;
        videoEl.play().catch(() => {});
      }

      if ('BarcodeDetector' in window) {
        const detector = new window.BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code', 'upc_a', 'upc_e', 'itf']
        });
        scanInterval = setInterval(async () => {
          if (isClosed || !videoEl || videoEl.readyState < 2) return;
          try {
            const barcodes = await detector.detect(videoEl);
            if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
              const code = barcodes[0].rawValue;
              stopScanner();
              modal.closeModal();
              if (navigator.vibrate) navigator.vibrate(100);
              if (onCodeDetected) onCodeDetected(code);
            }
          } catch (e) { /* ignore frame error */ }
        }, 250);
      } else {
        if (statusMsg) {
          statusMsg.textContent = 'Vista de cámara activa. Si tu navegador no detecta automáticamente, digita el código abajo.';
        }
        manualInput?.focus();
      }
    }).catch(() => {
      if (statusMsg) statusMsg.textContent = 'No se pudo acceder a la cámara. Ingresa el código manualmente abajo.';
      manualInput?.focus();
    });
  }

  // ─── Modal de Artículo ────────────────────────────────────────────────────────
  function openArticleModal(articleToEdit = null, prefilledCode = '') {
    if (!AppState.activeZoneId) return;
    const isEdit = Boolean(articleToEdit);
    let currentImageDataUrl = isEdit ? (articleToEdit.image || null) : null;
    const initialCode = isEdit ? articleToEdit.id : (prefilledCode || '');

    const contentHTML = `
      <form id="form-article" class="form-vertical">
        <div class="input-group">
          <label for="art-id" class="input-label">Código ID / Código de Barras</label>
          <div class="input-with-btn-row">
            <input
              type="text"
              id="art-id"
              class="input-field"
              placeholder="Ej: 8541234 (Vacío = auto)"
              value="${InventoryUI.escapeHTML(initialCode)}"
              ${isEdit ? 'readonly' : ''}
            />
            ${!isEdit ? `
              <button type="button" class="btn btn-outlined btn-sm" id="btn-scan-into-modal" title="Escanear código con cámara">
                <span class="material-symbols-outlined text-icon">qr_code_scanner</span>
              </button>
            ` : ''}
          </div>
        </div>

        <div class="input-group">
          <label for="art-name" class="input-label">Nombre del Artículo *</label>
          <input
            type="text"
            id="art-name"
            class="input-field"
            placeholder="Ej: Carpa Camping 2 Personas"
            value="${isEdit ? InventoryUI.escapeHTML(articleToEdit.name) : ''}"
            required
          />
        </div>

        <div class="form-row">
          <div class="input-group">
            <label for="art-expected" class="input-label">Cant. en Inventario *</label>
            <input
              type="number"
              inputmode="numeric"
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
              inputmode="numeric"
              id="art-found"
              class="input-field"
              min="0"
              value="${isEdit ? articleToEdit.foundQty : 0}"
              required
            />
          </div>
        </div>

        <div class="input-group">
          <div class="label-with-action">
            <label for="art-comment" class="input-label">Causa / Observaciones (Qué y por qué)</label>
            <button type="button" class="btn-voice-dictate" id="btn-voice-article" title="Dictar observación por voz">
              <span class="material-symbols-outlined text-icon">mic</span> Dictar
            </button>
          </div>
          <textarea
            id="art-comment"
            class="input-field textarea-field"
            rows="2"
            placeholder="Ej: Empaque abierto, ubicado en estante superior B3..."
          >${isEdit ? InventoryUI.escapeHTML(articleToEdit.comment || '') : ''}</textarea>
          <div class="quick-tags-row" id="article-quick-tags">
            <button type="button" class="quick-tag-chip" data-tag="📦 Mal ubicado en zona">📦 Mal ubicado</button>
            <button type="button" class="quick-tag-chip" data-tag="🏷️ Error de recepción/etiquetado">🏷️ Error recepción</button>
            <button type="button" class="quick-tag-chip" data-tag="💔 Merma / Producto dañado">💔 Dañado/Merma</button>
            <button type="button" class="quick-tag-chip" data-tag="🔄 Sin código / Sin etiquetar">🔄 Sin etiquetar</button>
            <button type="button" class="quick-tag-chip" data-tag="🛒 Posible hurto / Faltante físico">🛒 Posible hurto</button>
            <button type="button" class="quick-tag-chip" data-tag="✅ Conteo físico verificado OK">✅ Conteo OK</button>
          </div>
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

    // Botón de dictado por voz en modal de artículo
    const btnVoiceArt = document.getElementById('btn-voice-article');
    const commentArea = document.getElementById('art-comment');
    if (btnVoiceArt && commentArea) {
      btnVoiceArt.addEventListener('click', () => startVoiceDictation(commentArea, btnVoiceArt));
    }

    // Chips rápidos de causa (1 toque en móvil)
    document.querySelectorAll('#article-quick-tags .quick-tag-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        if (!commentArea) return;
        const tagText = chip.dataset.tag || '';
        const curr = commentArea.value.trim();
        if (!curr.includes(tagText)) {
          commentArea.value = curr ? `${curr} | ${tagText}` : tagText;
        }
        chip.classList.add('active');
      });
    });

    // Botón escanear dentro del modal de nuevo artículo
    const btnScanInto = document.getElementById('btn-scan-into-modal');
    if (btnScanInto) {
      btnScanInto.addEventListener('click', () => {
        modal.closeModal();
        openBarcodeScannerModal((scannedCode) => {
          openArticleModal(null, scannedCode);
        });
      });
    }
  }

  // ─── Modal de Planes de Acción por Artículo ───────────────────────────────────
  async function openActionPlanModal(article) {
    if (!AppState.activeZoneId || !article) return;

    let allPlans = [];
    try {
      allPlans = await InventoryStorage.getActionPlansForZone(AppState.activeZoneId);
    } catch (e) { /* ignore */ }
    const articlePlans = allPlans.filter(p => p.articleId === article.id);

    const todayStr = new Date().toISOString().slice(0, 10);
    const nextWeekDate = new Date();
    nextWeekDate.setDate(nextWeekDate.getDate() + 7);
    const nextWeekStr = nextWeekDate.toISOString().slice(0, 10);

    const diffLabel = article.difference > 0 ? `+${article.difference} (Sobrante)` : article.difference < 0 ? `${article.difference} (Faltante)` : '0 (Correcto)';

    const existingPlansHTML = articlePlans.length > 0 ? `
      <div class="existing-plans-section">
        <h4 class="section-Label-sm">Planes Registrados (${articlePlans.length})</h4>
        <div class="existing-plans-list">
          ${articlePlans.map(p => {
            const isDone = p.status === 'completado';
            return `
              <div class="existing-plan-row ${isDone ? 'is-done' : ''}" data-plan-id="${InventoryUI.escapeHTML(p.id)}">
                <div class="ep-info">
                  <span class="ap-status-badge ${isDone ? 'ap-status-done' : 'ap-status-pending'}">
                    ${isDone ? '✓ Resuelto' : '⏳ Pendiente'}
                  </span>
                  <p class="ep-desc">${InventoryUI.escapeHTML(p.description)}</p>
                  <span class="ep-dates">📅 ${InventoryUI.escapeHTML(p.startDate || '-')} ${p.endDate ? '→ ' + InventoryUI.escapeHTML(p.endDate) : ''}</span>
                </div>
                <div class="ep-actions">
                  <button type="button" class="btn btn-sm btn-outlined btn-ep-toggle" data-plan-id="${InventoryUI.escapeHTML(p.id)}">
                    ${isDone ? 'Reabrir' : '✓ Resolver'}
                  </button>
                  <button type="button" class="icon-btn btn-sm btn-ep-delete" data-plan-id="${InventoryUI.escapeHTML(p.id)}" title="Eliminar">
                    <span class="material-symbols-outlined">delete</span>
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    ` : '';

    const modal = InventoryUI.showModal({
      title: `📋 Plan de Acción — ${article.name}`,
      contentHTML: `
        <div class="plan-modal-summary">
          <div><strong>Código:</strong> ${InventoryUI.escapeHTML(article.id)}</div>
          <div><strong>Sistema:</strong> ${article.expectedQty} | <strong>Encontrado:</strong> ${article.foundQty} | <strong>Dif:</strong> ${diffLabel}</div>
          ${article.isRecurrent ? `<div class="recurrent-mini-tag">🔥 Artículo Reincidente (${article.discrepancyCount} conteos con diferencia)</div>` : ''}
        </div>

        ${existingPlansHTML}

        <form id="form-action-plan" class="form-vertical">
          <div class="input-group">
            <div class="label-with-action">
              <label for="plan-desc" class="input-label">Nuevo Plan de Acción para revertir el problema *</label>
              <button type="button" class="btn-voice-dictate" id="btn-voice-plan" title="Dictar plan por voz">
                <span class="material-symbols-outlined text-icon">mic</span> Dictar
              </button>
            </div>
            <textarea
              id="plan-desc"
              class="input-field textarea-field"
              rows="2"
              placeholder="Ej: Auditar recepción de bodega, unificar ubicación en góndola 3 y colocar piocha antihurto..."
              required
            ></textarea>
            <div class="quick-tags-row" id="plan-quick-tags">
              <button type="button" class="quick-tag-chip" data-tag="🔍 Buscar en altillo/bodega y unificar exhibición">🔍 Buscar y unificar</button>
              <button type="button" class="quick-tag-chip" data-tag="🏷️ Re-etiquetar referencias cruzadas">🏷️ Re-etiquetar</button>
              <button type="button" class="quick-tag-chip" data-tag="📊 Solicitar ajuste de stock en sistema tras doble conteo">📊 Ajustar stock</button>
              <button type="button" class="quick-tag-chip" data-tag="🛡️ Instalar alarma/protección antihurto">🛡️ Antihurto</button>
              <button type="button" class="quick-tag-chip" data-tag="🔄 Programar seguimiento semanal">🔄 Control semanal</button>
            </div>
          </div>

          <div class="form-row">
            <div class="input-group">
              <label for="plan-start" class="input-label">Fecha Inicio *</label>
              <input type="date" id="plan-start" class="input-field" value="${todayStr}" required />
            </div>
            <div class="input-group">
              <label for="plan-end" class="input-label">Fecha Compromiso *</label>
              <input type="date" id="plan-end" class="input-field" value="${nextWeekStr}" required />
            </div>
          </div>
        </form>
      `,
      buttons: [
        { text: 'Cerrar', class: 'btn-outlined', onClick: () => modal.closeModal() },
        {
          text: 'Guardar Plan de Acción',
          class: 'btn-primary',
          onClick: async () => {
            const descInput = document.getElementById('plan-desc');
            const startInput = document.getElementById('plan-start');
            const endInput = document.getElementById('plan-end');

            const description = descInput ? descInput.value.trim() : '';
            const startDate = startInput ? startInput.value : todayStr;
            const endDate = endInput ? endInput.value : nextWeekStr;

            if (!description) {
              InventoryUI.showToast('Describe la acción correctiva a realizar.', 'warning');
              descInput?.focus();
              return;
            }

            try {
              await InventoryStorage.saveActionPlan(AppState.activeZoneId, article.id, {
                description,
                startDate,
                endDate,
                status: 'pendiente'
              });
              InventoryUI.showToast('Plan de acción guardado con éxito 📋', 'success');
              modal.closeModal();
              await refreshZoneDetailView();
            } catch (err) {
              InventoryUI.showToast('Error al guardar plan: ' + err.message, 'error');
            }
          }
        }
      ]
    });

    const planDescArea = document.getElementById('plan-desc');
    const btnVoicePlan = document.getElementById('btn-voice-plan');
    if (btnVoicePlan && planDescArea) {
      btnVoicePlan.addEventListener('click', () => startVoiceDictation(planDescArea, btnVoicePlan));
    }

    document.querySelectorAll('#plan-quick-tags .quick-tag-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        if (!planDescArea) return;
        const tagText = chip.dataset.tag || '';
        const curr = planDescArea.value.trim();
        planDescArea.value = curr ? `${curr}. ${tagText}` : tagText;
        chip.classList.add('active');
      });
    });

    // Eventos para resolver o eliminar planes existentes dentro del modal
    document.querySelectorAll('.btn-ep-toggle').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pid = btn.dataset.planId;
        const targetPlan = articlePlans.find(p => p.id === pid);
        if (!targetPlan) return;
        try {
          await InventoryStorage.toggleActionPlanStatus(AppState.activeZoneId, targetPlan);
          InventoryUI.showToast('Estado del plan actualizado ✓', 'success');
          modal.closeModal();
          await refreshZoneDetailView();
        } catch (err) {
          InventoryUI.showToast('Error: ' + err.message, 'error');
        }
      });
    });

    document.querySelectorAll('.btn-ep-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pid = btn.dataset.planId;
        try {
          await InventoryStorage.deleteActionPlan(AppState.activeZoneId, article.id, pid);
          InventoryUI.showToast('Plan eliminado.', 'info');
          modal.closeModal();
          await refreshZoneDetailView();
        } catch (err) {
          InventoryUI.showToast('Error: ' + err.message, 'error');
        }
      });
    });
  }

  // ─── Modal de Historial por Artículo (Qué, Cuánto, Quién y Cuándo) ────────────
  async function openArticleHistoryModal(article) {
    if (!AppState.activeZoneId || !article) return;

    let historyLogs = [];
    try {
      historyLogs = await InventoryStorage.getArticleHistory(AppState.activeZoneId, article.id, article.name);
    } catch (e) { /* ignore */ }

    const rowsHTML = historyLogs.length > 0 ? historyLogs.map(log => {
      const isProblem = /\(faltante\)|\(sobrante\)/i.test(log.details || '');
      return `
        <div class="history-timeline-item ${isProblem ? 'history-item-alert' : ''}">
          <div class="ht-header">
            <span class="ht-user">👤 ${InventoryUI.escapeHTML(log.userEmail || '@admin')}</span>
            <span class="ht-date">🕒 ${InventoryData.formatDate(log.createdAt)} (${InventoryData.getRelativeTime(log.createdAt)})</span>
          </div>
          <div class="ht-body">
            ${InventoryUI.escapeHTML(log.details || log.action)}
          </div>
        </div>
      `;
    }).join('') : `
      <div class="empty-state small">
        <p>Aún no hay registros históricos adicionales para este artículo.</p>
      </div>
    `;

    const modal = InventoryUI.showModal({
      title: `🕒 Historial — ${article.name} (${article.id})`,
      contentHTML: `
        <div class="plan-modal-summary">
          <div><strong>Estado actual:</strong> Sistema: ${article.expectedQty} | Encontrado: ${article.foundQty} | Dif: ${article.difference > 0 ? '+' + article.difference : article.difference}</div>
          <div><strong>Conteos con diferencia:</strong> ${article.discrepancyCount || 0} ${article.isRecurrent ? '🔥 (Reincidente)' : ''}</div>
        </div>
        <div class="history-timeline-list">
          ${rowsHTML}
        </div>
      `,
      buttons: [
        { text: 'Cerrar', class: 'btn-outlined', onClick: () => modal.closeModal() },
        {
          text: '📋 + Crear Plan de Acción',
          class: 'btn-primary',
          onClick: () => {
            modal.closeModal();
            openActionPlanModal(article);
          }
        }
      ]
    });
  }

  // ─── Resumen Ejecutivo WhatsApp y Exportación CSV (Excel) ─────────────────────
  async function handleShareZoneSummary() {
    if (!AppState.activeZoneId) return;
    try {
      const zone = await InventoryStorage.getZoneById(AppState.activeZoneId);
      if (!zone) return;
      const stats = InventoryData.calculateZoneStats(zone.articles);
      const plans = await InventoryStorage.getActionPlansForZone(AppState.activeZoneId);
      const userTag = AppState.currentUser?.username ? `@${AppState.currentUser.username}` : '@admin';
      const nowStr = InventoryData.formatDate(new Date());

      const faltantesList = (zone.articles || []).filter(a => a.status === 'faltante');
      const sobrantesList = (zone.articles || []).filter(a => a.status === 'sobrante');
      const activePlans = (plans || []).filter(p => p.status !== 'completado');

      let lines = [
        `📊 *REPORTE DE REVERIFICACIÓN DE INVENTARIO*`,
        `📍 *Zona:* ${zone.name}`,
        `👤 *Responsable:* ${userTag}`,
        `🕒 *Fecha:* ${nowStr}`,
        `────────────────────`,
        `✅ *Avance:* ${stats.verified}/${stats.total} verificados (${stats.percentageVerified}%)`,
        `⚠️ *Faltantes:* ${stats.faltantes} | ➕ *Sobrantes:* ${stats.sobrantes} | 👌 *Correctos:* ${stats.correctos}`
      ];

      if (faltantesList.length > 0) {
        lines.push(`\n🔴 *DETALLE FALTANTES (${faltantesList.length}):*`);
        faltantesList.slice(0, 15).forEach(a => {
          lines.push(`• [${a.id}] ${a.name}: Sist ${a.expectedQty} vs Fís ${a.foundQty} (${a.difference})${a.comment ? ' — _' + a.comment + '_' : ''}`);
        });
      }

      if (sobrantesList.length > 0) {
        lines.push(`\n🟡 *DETALLE SOBRANTES (${sobrantesList.length}):*`);
        sobrantesList.slice(0, 15).forEach(a => {
          lines.push(`• [${a.id}] ${a.name}: Sist ${a.expectedQty} vs Fís ${a.foundQty} (+${a.difference})${a.comment ? ' — _' + a.comment + '_' : ''}`);
        });
      }

      if (activePlans.length > 0) {
        lines.push(`\n📋 *PLANES DE ACCIÓN ACTIVOS (${activePlans.length}):*`);
        activePlans.slice(0, 10).forEach(p => {
          lines.push(`• [${p.articleId}] ${p.description} (Límite: ${p.endDate || p.startDate})`);
        });
      }

      const summaryText = lines.join('\n');

      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(summaryText);
        InventoryUI.showToast('Resumen copiado al portapapeles 📋', 'success');
      }

      const waUrl = `https://wa.me/?text=${encodeURIComponent(summaryText)}`;
      const modal = InventoryUI.showModal({
        title: '📲 Resumen de Turno / WhatsApp',
        contentHTML: `
          <div class="form-vertical">
            <p class="input-label">El resumen ya fue copiado a tu portapapeles. Puedes pegarlo o enviarlo directo a WhatsApp:</p>
            <textarea class="input-field textarea-field" rows="10" readonly>${InventoryUI.escapeHTML(summaryText)}</textarea>
          </div>
        `,
        buttons: [
          { text: 'Cerrar', class: 'btn-outlined', onClick: () => modal.closeModal() },
          {
            text: 'Enviar por WhatsApp',
            class: 'btn-primary',
            onClick: () => {
              window.open(waUrl, '_blank', 'noopener,noreferrer');
              modal.closeModal();
            }
          }
        ]
      });
    } catch (err) {
      InventoryUI.showToast('Error generando resumen: ' + err.message, 'error');
    }
  }

  async function handleExportZoneCSV() {
    if (!AppState.activeZoneId) return;
    try {
      const zone = await InventoryStorage.getZoneById(AppState.activeZoneId);
      if (!zone) return;

      const escapeCSV = (val) => {
        const s = String(val == null ? '' : val).replace(/"/g, '""');
        return `"${s}"`;
      };

      const headers = [
        'Zona', 'Codigo_ID', 'Articulo', 'Cant_Sistema', 'Cant_Fisica',
        'Diferencia', 'Estado', 'Reincidente', 'Verificado', 'Fecha_Verificacion',
        'Creado_Por', 'Ultima_Modif_Por', 'Comentarios'
      ];

      const rows = (zone.articles || []).map(a => [
        escapeCSV(zone.name),
        escapeCSV(a.id),
        escapeCSV(a.name),
        a.expectedQty,
        a.foundQty,
        a.difference,
        escapeCSV(a.status),
        escapeCSV(a.isRecurrent ? `SI (${a.discrepancyCount})` : 'NO'),
        escapeCSV(a.verified ? 'SI' : 'NO'),
        escapeCSV(InventoryData.formatDate(a.verifiedAt)),
        escapeCSV(a.createdBy || '@admin'),
        escapeCSV(a.updatedBy || '@admin'),
        escapeCSV(a.comment || '')
      ].join(';'));

      const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
      const filename = `reporte_${zone.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${new Date().toISOString().slice(0,10)}.csv`;
      downloadFile(csvContent, filename, 'text/csv;charset=utf-8;');
      InventoryUI.showToast('Archivo CSV (Excel) descargado 📊', 'success');
    } catch (err) {
      InventoryUI.showToast('Error al exportar CSV: ' + err.message, 'error');
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

  window.addEventListener('actionPlan:toggleStatus', async (ev) => {
    const { plan } = ev.detail || {};
    if (!plan || !AppState.activeZoneId) return;
    try {
      await InventoryStorage.toggleActionPlanStatus(AppState.activeZoneId, plan);
      InventoryUI.showToast(plan.status === 'completado' ? 'Plan reabierto como pendiente' : 'Plan marcado como resuelto ✓', 'success');
      await refreshZoneDetailView();
    } catch (err) {
      InventoryUI.showToast('Error al actualizar plan: ' + err.message, 'error');
    }
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
