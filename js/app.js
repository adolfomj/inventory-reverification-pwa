/**
 * app.js
 * Controlador principal de la aplicación. Inicializa eventos, gestiona el estado
 * y coordina la comunicación entre InventoryStorage, InventoryData e InventoryUI.
 *
 * NOTA: InventoryStorage ahora usa Supabase (async). Todas las llamadas
 * a métodos de storage son await dentro de funciones async.
 */

document.addEventListener('DOMContentLoaded', () => {

  // ─── Estado global ───────────────────────────────────────────────────────────
  const AppState = {
    activeZoneId: null,
    currentFilter: 'todos',
    zoneSearchQuery: '',
    articleSearchQuery: '',
    theme: localStorage.getItem('theme_preference') || 'system'
  };

  // ─── Init ────────────────────────────────────────────────────────────────────
  async function init() {
    initTheme();
    bindHeaderEvents();
    bindZoneViewEvents();
    bindZoneDetailEvents();
    bindImportExportEvents();
    await refreshZonesView();
    registerServiceWorker();
  }

  // ─── Tema ────────────────────────────────────────────────────────────────────
  function initTheme() {
    applyTheme(AppState.theme);

    InventoryUI.elements.themeToggleBtn.addEventListener('click', () => {
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
    const iconSpan = InventoryUI.elements.themeToggleBtn.querySelector('.material-symbols-outlined');
    if (iconSpan) iconSpan.textContent = effectiveTheme === 'dark' ? 'light_mode' : 'dark_mode';
  }

  // ─── Header ──────────────────────────────────────────────────────────────────
  function bindHeaderEvents() {
    InventoryUI.elements.btnBack.addEventListener('click', async () => {
      AppState.activeZoneId = null;
      AppState.articleSearchQuery = '';
      if (InventoryUI.elements.articleSearchInput) {
        InventoryUI.elements.articleSearchInput.value = '';
      }
      InventoryUI.showZonesView();
      await refreshZonesView();
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
      AppState.articleSearchQuery = '';

      if (InventoryUI.elements.articleSearchInput) {
        InventoryUI.elements.articleSearchInput.value = '';
      }

      InventoryUI.elements.filterTabs.forEach(tab => {
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

      // Renderizar calendario de la zona (planes de acción)
      try {
        let zonePlans = await InventoryStorage.getActionPlansForZone(AppState.activeZoneId);
        // enriquecer con nombre de artículo si está disponible
        zonePlans = zonePlans.map(p => {
          const art = (zone.articles || []).find(a => a.id === p.articleId);
          return Object.assign({}, p, { articleName: art ? art.name : null });
        });
        InventoryUI.renderZoneCalendar(zonePlans);
      } catch (e) {
        console.warn('No se pudieron cargar planes de acción de la zona:', e);
      }

      InventoryUI.renderArticlesList(
        zone.articles,
        AppState.currentFilter,
        AppState.articleSearchQuery,
        {
          onToggleVerification: (articleId, isVerified) => handleToggleVerification(articleId, isVerified),
          onUpdateFoundQty:     (articleId, foundQty)   => handleUpdateFoundQty(articleId, foundQty),
          onUnlockArticle:      (article)                => handleUnlockArticle(article),
          onEditArticle:        (article)                => openArticleModal(article),
          onDeleteArticle:      (article)                => confirmDeleteArticle(article)
        }
      );
      // Inyectar planes en tarjetas de artículo
      try {
        let zonePlans = await InventoryStorage.getActionPlansForZone(AppState.activeZoneId);
        zonePlans = zonePlans.map(p => {
          const art = (zone.articles || []).find(a => a.id === p.articleId);
          return Object.assign({}, p, { articleName: art ? art.name : null });
        });
        InventoryUI.injectArticlePlans(zonePlans);
      } catch (e) {
        // ignore
      }
    } catch (err) {
      console.error('[App] Error refrescando detalle de zona:', err);
      InventoryUI.showToast('Error al cargar artículos: ' + err.message, 'error');
    }
  }

  // ─── Eventos Vista de Zonas ───────────────────────────────────────────────────
  function bindZoneViewEvents() {
    InventoryUI.elements.zoneSearchInput.addEventListener('input', async (e) => {
      AppState.zoneSearchQuery = e.target.value;
      await refreshZonesView();
    });

    InventoryUI.elements.fabAddZone.addEventListener('click', () => openZoneModal());
  }

  // ─── Modal de Zona ────────────────────────────────────────────────────────────
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
        {
          text: 'Cancelar',
          class: 'btn-outlined',
          onClick: () => modal.closeModal()
        },
        {
          text: isEdit ? 'Guardar Cambios' : 'Crear Zona',
          class: 'btn-primary',
          onClick: async () => {
            const nameInput = document.getElementById('zone-name');
            const name = nameInput.value.trim();
            if (!name) {
              InventoryUI.showToast('Por favor ingrese el nombre de la zona.', 'warning');
              nameInput.focus();
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
    InventoryUI.elements.articleSearchInput.addEventListener('input', async (e) => {
      AppState.articleSearchQuery = e.target.value;
      await refreshZoneDetailView();
    });

    InventoryUI.elements.filterTabs.forEach(tab => {
      tab.addEventListener('click', async () => {
        InventoryUI.elements.filterTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        AppState.currentFilter = tab.dataset.filter;
        await refreshZoneDetailView();
      });
    });

    InventoryUI.elements.fabAddArticle.addEventListener('click', () => openArticleModal());
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
        {
          text: 'Cancelar',
          class: 'btn-outlined',
          onClick: () => modal.closeModal()
        },
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

            const name        = nameInput.value.trim();
            const expectedQty = parseInt(expectedInput.value, 10) || 0;
            const foundQty    = parseInt(foundInput.value, 10)    || 0;
            const comment     = commentInput ? commentInput.value.trim() : '';
            const id          = idInput ? idInput.value.trim() : null;

            if (!name) {
              InventoryUI.showToast('Debe ingresar el nombre del artículo.', 'warning');
              nameInput.focus();
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
              image:      currentImageDataUrl
            };

            try {
              const saved = await InventoryStorage.saveArticle(AppState.activeZoneId, articleData);

              // Persistir planes de acción asociados (modalPlans)
              if (window._modalActionPlans && Array.isArray(window._modalActionPlans)) {
                console.log('[App] Guardando modalActionPlans count=', window._modalActionPlans.length);
                for (const p of window._modalActionPlans) {
                  console.log('[App] plan ->', p);
                  if (p.id) {
                    // existente -> actualizar
                    await InventoryStorage.updateActionPlan(AppState.activeZoneId, saved.id, p);
                  } else {
                    // nuevo -> guardar
                    const savedPlan = await InventoryStorage.saveActionPlan(AppState.activeZoneId, saved.id, {
                      description: p.description,
                      startDate: p.startDate,
                      endDate: p.endDate
                    });
                    console.log('[App] savedPlan', savedPlan);
                  }
                }
              } else {
                console.log('[App] No hay modalActionPlans para guardar');
              }

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

    // Imagen
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
          previewImg.src = compressedDataUrl;
          previewBox.classList.remove('hidden');
          InventoryUI.showToast('Fotografía cargada correctamente.', 'success');
        } catch (err) {
          InventoryUI.showToast(err.message || 'Error al procesar la imagen.', 'error');
        }
      });
    }

    if (btnRemoveImg) {
      btnRemoveImg.addEventListener('click', () => {
        currentImageDataUrl = null;
        previewImg.src = '';
        previewBox.classList.add('hidden');
        if (fileInput) fileInput.value = '';
        InventoryUI.showToast('Fotografía removida.', 'info');
      });
    }

    // --- Planes de Acción: UI mínima dentro del modal ---
    (function setupActionPlans() {
      // Crear área debajo del formulario
      const modalBody = document.querySelector('#modal-container .modal-body');
      if (!modalBody) return;

      const apSection = document.createElement('div');
      apSection.className = 'ap-section';
      apSection.innerHTML = `
        <h4>Planes de Acción</h4>
        <div class="ap-inputs">
          <input type="text" id="ap-desc" placeholder="Descripción del plan" class="input-field" />
          <input type="date" id="ap-start" class="input-field" />
          <input type="date" id="ap-end" class="input-field" />
          <button id="btn-add-action-plan" class="btn btn-sm btn-primary">Añadir Plan</button>
        </div>
        <div id="ap-list" class="ap-list"></div>
      `;
      modalBody.appendChild(apSection);

      // Modal-scoped plans storage
      window._modalActionPlans = [];

      const apDesc = document.getElementById('ap-desc');
      const apStart = document.getElementById('ap-start');
      const apEnd = document.getElementById('ap-end');
      const btnAdd = document.getElementById('btn-add-action-plan');
      const apList = document.getElementById('ap-list');

      function renderApList() {
        apList.innerHTML = '';
        console.log('[App] renderApList count=', window._modalActionPlans ? window._modalActionPlans.length : 0, window._modalActionPlans);
        window._modalActionPlans.forEach((p, idx) => {
          const item = document.createElement('div');
          item.className = 'ap-item';

          const descInput = document.createElement('textarea');
          descInput.className = 'input-field ap-desc-input';
          descInput.rows = 2;
          descInput.value = p.description || '';
          descInput.addEventListener('input', (e) => { window._modalActionPlans[idx].description = e.target.value; });

          const startInput = document.createElement('input');
          startInput.type = 'date';
          startInput.className = 'input-field ap-date-input';
          startInput.value = p.startDate || '';
          startInput.addEventListener('change', (e) => { window._modalActionPlans[idx].startDate = e.target.value; });

          const endInput = document.createElement('input');
          endInput.type = 'date';
          endInput.className = 'input-field ap-date-input';
          endInput.value = p.endDate || '';
          endInput.addEventListener('change', (e) => { window._modalActionPlans[idx].endDate = e.target.value; });

          const meta = document.createElement('div');
          meta.className = 'ap-item-meta';
          meta.innerHTML = `<div class="ap-item-id">${p.id ? 'ID: ' + escapeHTML(p.id) : 'Nuevo'}</div>`;

          const actions = document.createElement('div');
          actions.className = 'ap-item-actions';
          const delBtn = document.createElement('button');
          delBtn.className = 'btn btn-sm btn-outlined btn-ap-delete';
          delBtn.textContent = 'Eliminar';
          delBtn.dataset.idx = idx;
          actions.appendChild(delBtn);

          item.appendChild(meta);
          item.appendChild(descInput);
          const datesRow = document.createElement('div');
          datesRow.className = 'ap-dates-row';
          datesRow.appendChild(startInput);
          datesRow.appendChild(endInput);
          item.appendChild(datesRow);
          item.appendChild(actions);

          apList.appendChild(item);
        });
      }

      // Si estamos editando, cargar existentes (ahora que renderApList está definido)
      (async () => {
        if (isEdit && articleToEdit && articleToEdit.id) {
          try {
            console.log('[App] cargando AP para artículo', articleToEdit.id, 'zona', AppState.activeZoneId);
            const existing = await InventoryStorage.getActionPlansForArticle(AppState.activeZoneId, articleToEdit.id);
            console.log('[App] getActionPlansForArticle ->', existing);
            if (existing && existing.length) {
              window._modalActionPlans = existing.map(p => Object.assign({}, p));
              console.log('[App] window._modalActionPlans set ->', window._modalActionPlans);
              renderApList();
            } else {
              console.log('[App] no hay AP para este artículo');
            }
          } catch (e) { console.warn('No se pudieron cargar AP del artículo:', e); }
        }
      })();

      btnAdd.addEventListener('click', () => {
        const desc = apDesc.value.trim();
        const s = apStart.value;
        const e = apEnd.value;
        if (!desc || !s || !e) {
          InventoryUI.showToast('Complete descripción, fecha inicio y fin.', 'warning');
          return;
        }
        const newPlan = { description: desc, startDate: s, endDate: e };
        window._modalActionPlans.push(newPlan);
        apDesc.value = '';
        apStart.value = '';
        apEnd.value = '';
        renderApList();
      });

      apList.addEventListener('click', async (e) => {
        const del = e.target.closest('.btn-ap-delete');
        if (!del) return;
        const idx = parseInt(del.dataset.idx, 10);
        const plan = window._modalActionPlans[idx];
        if (!plan) return;
        // Si plan tiene id -> borrar persistente
        if (plan.id) {
          try {
            await InventoryStorage.deleteActionPlan(AppState.activeZoneId, articleToEdit.id, plan.id);
            InventoryUI.showToast('Plan eliminado.', 'info');
          } catch (err) {
            InventoryUI.showToast('Error al eliminar plan: ' + err.message, 'error');
            return;
          }
        }
        window._modalActionPlans.splice(idx, 1);
        renderApList();
      });
    })();
  }

  // ─── Verificación ─────────────────────────────────────────────────────────────
  async function handleToggleVerification(articleId, isVerified) {
    if (!AppState.activeZoneId) return;
    try {
      await InventoryStorage.toggleArticleVerification(AppState.activeZoneId, articleId, isVerified);
      InventoryUI.showToast(
        isVerified ? 'Artículo verificado y bloqueado para edición.' : 'Artículo marcado como pendiente.',
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
      `¿Desea desbloquear la edición del artículo "${article.name}" (${article.id})? Esto le permitirá realizar cambios a las cantidades.`,
      async () => {
        try {
          await InventoryStorage.unlockArticle(AppState.activeZoneId, article.id);
          InventoryUI.showToast('Edición desbloqueada. Ya puede modificar las cantidades.', 'info');
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

    // Exportar Zona Activa
    InventoryUI.elements.btnExportZone.addEventListener('click', async () => {
      if (!AppState.activeZoneId) return;
      try {
        const zone    = await InventoryStorage.getZoneById(AppState.activeZoneId);
        if (!zone) return;
        const jsonStr  = await InventoryStorage.exportZoneToJSON(AppState.activeZoneId);
        const filename = `zona_${zone.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}.json`;
        downloadFile(jsonStr, filename, 'application/json');
        InventoryUI.showToast('Zona exportada correctamente.', 'success');
      } catch (err) {
        InventoryUI.showToast('Error al exportar zona: ' + err.message, 'error');
      }
    });

    // Exportar Todo
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

    // Importar JSON
    InventoryUI.elements.btnGlobalImport?.addEventListener('click', triggerImport);
    InventoryUI.elements.btnBackupImport?.addEventListener('click', triggerImport);
  }

  // ─── Helper descarga ──────────────────────────────────────────────────────────
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
            console.log('Service Worker registrado con éxito:', reg.scope);
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
          .catch((err) => console.error('Error al registrar Service Worker:', err));
      });
    }
  }

  // ─── Arranque ────────────────────────────────────────────────────────────────
  // Handlers para eventos provenientes del calendario completo / zona
  window.addEventListener('fullCalendar:openArticle', async (ev) => {
    const { articleId } = ev.detail || {};
    if (!articleId || !AppState.activeZoneId) return;
    try {
      const zone = await InventoryStorage.getZoneById(AppState.activeZoneId);
      if (!zone) return;
      const article = zone.articles.find(a => a.id === articleId);
      if (!article) {
        InventoryUI.showToast('No se encontró el artículo asociado al plan.', 'warning');
        return;
      }
      openArticleModal(article);
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

  // Also handle small zone list clicks
  window.addEventListener('zoneCalendar:openArticle', async (ev) => {
    const { articleId } = ev.detail || {};
    if (!articleId || !AppState.activeZoneId) return;
    try {
      const zone = await InventoryStorage.getZoneById(AppState.activeZoneId);
      const article = zone.articles.find(a => a.id === articleId);
      if (article) openArticleModal(article);
    } catch (err) { console.error(err); }
  });

  init();
});
