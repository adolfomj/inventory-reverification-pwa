/**
 * app.js
 * Controlador principal de la aplicación. Inicializa eventos, gestiona el estado
 * y coordina la comunicación entre InventoryStorage, InventoryData e InventoryUI.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Estado global de la aplicación
  const AppState = {
    activeZoneId: null,
    currentFilter: 'todos',
    zoneSearchQuery: '',
    articleSearchQuery: '',
    theme: localStorage.getItem('theme_preference') || 'system'
  };

  /**
   * Inicializa la aplicación.
   */
  function init() {
    initTheme();
    bindHeaderEvents();
    bindZoneViewEvents();
    bindZoneDetailEvents();
    bindImportExportEvents();
    
    // Cargar vista inicial de Zonas
    refreshZonesView();

    // Registrar Service Worker para PWA
    registerServiceWorker();
  }

  /**
   * Configura el tema de la aplicación (Claro/Oscuro/Sistema).
   */
  function initTheme() {
    applyTheme(AppState.theme);

    InventoryUI.elements.themeToggleBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const nextTheme = current === 'dark' ? 'light' : 'dark';
      AppState.theme = nextTheme;
      localStorage.setItem('theme_preference', nextTheme);
      applyTheme(nextTheme);
    });

    // Detectar cambios en la preferencia del sistema operativo
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (AppState.theme === 'system') {
        applyTheme('system');
      }
    });
  }

  function applyTheme(theme) {
    let effectiveTheme = theme;
    if (theme === 'system') {
      effectiveTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', effectiveTheme);
    
    // Actualizar icono del botón
    const iconSpan = InventoryUI.elements.themeToggleBtn.querySelector('.material-symbols-outlined');
    if (iconSpan) {
      iconSpan.textContent = effectiveTheme === 'dark' ? 'light_mode' : 'dark_mode';
    }
  }

  /**
   * Eventos del Encabezado
   */
  function bindHeaderEvents() {
    InventoryUI.elements.btnBack.addEventListener('click', () => {
      AppState.activeZoneId = null;
      AppState.articleSearchQuery = '';
      if (InventoryUI.elements.articleSearchInput) {
        InventoryUI.elements.articleSearchInput.value = '';
      }
      InventoryUI.showZonesView();
      refreshZonesView();
    });

    InventoryUI.elements.btnSave?.addEventListener('click', () => {
      try {
        InventoryStorage.saveCurrentState();
        InventoryUI.showToast('Cambios guardados.', 'success');
        if (AppState.activeZoneId) {
          refreshZoneDetailView();
        } else {
          refreshZonesView();
        }
      } catch (err) {
        InventoryUI.showToast(err.message || 'No se pudo guardar.', 'error');
      }
    });
  }

  /**
   * Refresca y vuelve a renderizar la lista de Zonas.
   */
  function refreshZonesView() {
    const zones = InventoryStorage.getAllZones();
    InventoryUI.renderZonesList(zones, AppState.zoneSearchQuery, {
      onSelectZone: (zoneId) => openZoneDetail(zoneId),
      onDeleteZone: (zone) => confirmDeleteZone(zone)
    });
  }

  /**
   * Abre la vista de detalle para una Zona dada.
   * @param {string} zoneId 
   */
  function openZoneDetail(zoneId) {
    const zone = InventoryStorage.getZoneById(zoneId);
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

    // Resetear pestañas de filtro activas
    InventoryUI.elements.filterTabs.forEach(tab => {
      tab.classList.toggle('active', tab.dataset.filter === 'todos');
    });

    InventoryUI.showZoneDetailView(zone);
    refreshZoneDetailView();
  }

  /**
   * Refresca las estadísticas y la lista de artículos de la zona activa.
   */
  function refreshZoneDetailView() {
    if (!AppState.activeZoneId) return;

    const zone = InventoryStorage.getZoneById(AppState.activeZoneId);
    if (!zone) {
      InventoryUI.showZonesView();
      refreshZonesView();
      return;
    }

    const stats = InventoryData.calculateZoneStats(zone.articles);
    InventoryUI.renderStats(stats);

    InventoryUI.renderArticlesList(
      zone.articles,
      AppState.currentFilter,
      AppState.articleSearchQuery,
      {
        onToggleVerification: (articleId, isVerified) => handleToggleVerification(articleId, isVerified),
        onUpdateFoundQty: (articleId, foundQty) => handleUpdateFoundQty(articleId, foundQty),
        onUnlockArticle: (article) => handleUnlockArticle(article),
        onEditArticle: (article) => openArticleModal(article),
        onDeleteArticle: (article) => confirmDeleteArticle(article)
      }
    );
  }

  /**
   * Eventos de la vista principal de Zonas
   */
  function bindZoneViewEvents() {
    // Buscador de Zonas
    InventoryUI.elements.zoneSearchInput.addEventListener('input', (e) => {
      AppState.zoneSearchQuery = e.target.value;
      refreshZonesView();
    });

    // FAB para Agregar Nueva Zona
    InventoryUI.elements.fabAddZone.addEventListener('click', () => openZoneModal());
  }

  /**
   * Modal para Crear/Editar Zona.
   * @param {Object} zoneToEdit - Opcional para edición.
   */
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
          onClick: () => {
            const form = document.getElementById('form-zone');
            const nameInput = document.getElementById('zone-name');
            const name = nameInput.value.trim();

            if (!name) {
              InventoryUI.showToast('Por favor ingrese el nombre de la zona.', 'warning');
              nameInput.focus();
              return;
            }

            if (isEdit) {
              zoneToEdit.name = name;
              InventoryStorage.saveZone(zoneToEdit);
              InventoryUI.showToast('Zona actualizada con éxito.', 'success');
            } else {
              const newZone = InventoryData.createZone(name);
              InventoryStorage.saveZone(newZone);
              InventoryUI.showToast('Zona creada con éxito.', 'success');
            }

            modal.closeModal();
            refreshZonesView();
          }
        }
      ]
    });
  }

  /**
   * Confirmación para eliminar zona.
   * @param {Object} zone 
   */
  function confirmDeleteZone(zone) {
    InventoryUI.showConfirmDialog(
      'Eliminar Zona',
      `¿Está seguro de que desea eliminar la zona "${zone.name}" con sus ${zone.articles.length} artículos? Esta acción no se puede deshacer.`,
      () => {
        InventoryStorage.deleteZone(zone.id);
        InventoryUI.showToast(`Zona "${zone.name}" eliminada.`, 'info');
        refreshZonesView();
      },
      'Eliminar'
    );
  }

  /**
   * Eventos de la vista de Detalle de Zona (Artículos)
   */
  function bindZoneDetailEvents() {
    // Buscador de Artículos
    InventoryUI.elements.articleSearchInput.addEventListener('input', (e) => {
      AppState.articleSearchQuery = e.target.value;
      refreshZoneDetailView();
    });

    // Pestañas de Filtro
    InventoryUI.elements.filterTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        InventoryUI.elements.filterTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        AppState.currentFilter = tab.dataset.filter;
        refreshZoneDetailView();
      });
    });

    // FAB para Agregar Artículo
    InventoryUI.elements.fabAddArticle.addEventListener('click', () => openArticleModal());
  }

  /**
   * Modal para Crear o Editar Artículo.
   * @param {Object} articleToEdit 
   */
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

        <!-- Campo de Comentario / Observaciones -->
        <div class="input-group">
          <label for="art-comment" class="input-label">Comentarios / Observaciones</label>
          <textarea 
            id="art-comment" 
            class="input-field textarea-field" 
            rows="2" 
            placeholder="Ej: Empaque abierto, ubicado en estante superior B3..."
          >${isEdit ? InventoryUI.escapeHTML(articleToEdit.comment || '') : ''}</textarea>
        </div>

        <!-- Sección de Imagen de Artículo -->
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
          onClick: () => {
            const nameInput = document.getElementById('art-name');
            const idInput = document.getElementById('art-id');
            const expectedInput = document.getElementById('art-expected');
            const foundInput = document.getElementById('art-found');
            const commentInput = document.getElementById('art-comment');
            const verifiedChk = document.getElementById('art-verified');

            const name = nameInput.value.trim();
            const expectedQty = parseInt(expectedInput.value, 10) || 0;
            const foundQty = parseInt(foundInput.value, 10) || 0;
            const comment = commentInput ? commentInput.value.trim() : '';
            const id = idInput ? idInput.value.trim() : null;

            if (!name) {
              InventoryUI.showToast('Debe ingresar el nombre del artículo.', 'warning');
              nameInput.focus();
              return;
            }

            const articleData = {
              id: isEdit ? articleToEdit.id : (id || undefined),
              name,
              expectedQty,
              foundQty,
              comment,
              verified: isEdit ? (verifiedChk ? verifiedChk.checked : articleToEdit.verified) : false,
              verifiedAt: isEdit ? articleToEdit.verifiedAt : null,
              locked: isEdit ? articleToEdit.locked : false,
              image: currentImageDataUrl
            };

            InventoryStorage.saveArticle(AppState.activeZoneId, articleData);
            InventoryUI.showToast(isEdit ? 'Artículo actualizado.' : 'Artículo agregado a la zona.', 'success');

            modal.closeModal();
            refreshZoneDetailView();
          }
        }
      ]
    });

    // Enlazar eventos de la imagen dentro del modal abierto
    const fileInput = document.getElementById('art-image-input');
    const previewBox = document.getElementById('art-image-preview');
    const previewImg = document.getElementById('art-preview-img');
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
  }

  /**
   * Cambia el estado de verificación cuando el usuario marca o desmarca el checkbox.
   */
  function handleToggleVerification(articleId, isVerified) {
    if (!AppState.activeZoneId) return;

    InventoryStorage.toggleArticleVerification(AppState.activeZoneId, articleId, isVerified);
    InventoryUI.showToast(
      isVerified ? 'Artículo verificado y bloqueado para edición.' : 'Artículo marcado como pendiente.',
      isVerified ? 'success' : 'info'
    );

    refreshZoneDetailView();
  }

  /**
   * Actualiza la cantidad encontrada directamente en la tarjeta de artículo.
   */
  function handleUpdateFoundQty(articleId, foundQty) {
    if (!AppState.activeZoneId) return;

    const zone = InventoryStorage.getZoneById(AppState.activeZoneId);
    if (!zone) return;

    const article = zone.articles.find(a => a.id === articleId);
    if (!article) return;

    if (article.locked) {
      InventoryUI.showToast('El artículo está bloqueado. Debe desbloquearlo primero.', 'warning');
      refreshZoneDetailView();
      return;
    }

    article.foundQty = foundQty;
    InventoryStorage.saveArticle(AppState.activeZoneId, article);
    refreshZoneDetailView();
  }

  /**
   * Manejo de desbloqueo con confirmación explícita (Requisito de Seguridad #9).
   */
  function handleUnlockArticle(article) {
    InventoryUI.showConfirmDialog(
      'Desbloquear edición',
      `¿Desea desbloquear la edición del artículo "${article.name}" (${article.id})? Esto le permitirá realizar cambios a las cantidades.`,
      () => {
        InventoryStorage.unlockArticle(AppState.activeZoneId, article.id);
        InventoryUI.showToast('Edición desbloqueada. Ya puede modificar las cantidades.', 'info');
        refreshZoneDetailView();
      },
      'Desbloquear'
    );
  }

  /**
   * Confirmación para eliminar artículo.
   */
  function confirmDeleteArticle(article) {
    InventoryUI.showConfirmDialog(
      'Eliminar Artículo',
      `¿Está seguro de eliminar el artículo "${article.name}"?`,
      () => {
        InventoryStorage.deleteArticle(AppState.activeZoneId, article.id);
        InventoryUI.showToast('Artículo eliminado.', 'info');
        refreshZoneDetailView();
      },
      'Eliminar'
    );
  }

  /**
   * Gestión de Importación y Exportación JSON
   */
  function bindImportExportEvents() {
    const triggerImport = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';

      input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const result = InventoryStorage.importFromJSON(event.target.result);
            InventoryUI.showToast(
              `Importación exitosa: ${result.zonesCount} zonas y ${result.articlesCount} artículos procesados.`,
              'success'
            );
            if (AppState.activeZoneId) {
              refreshZoneDetailView();
            } else {
              refreshZonesView();
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
    InventoryUI.elements.btnExportZone.addEventListener('click', () => {
      if (!AppState.activeZoneId) return;
      const zone = InventoryStorage.getZoneById(AppState.activeZoneId);
      if (!zone) return;

      const jsonStr = InventoryStorage.exportZoneToJSON(AppState.activeZoneId);
      const filename = `zona_${zone.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}.json`;
      downloadFile(jsonStr, filename, 'application/json');
      InventoryUI.showToast('Zona exportada correctamente.', 'success');
    });

    // Exportar Todo
    const exportAll = () => {
      const jsonStr = InventoryStorage.exportAllToJSON();
      const filename = `inventario_completo_${Date.now()}.json`;
      downloadFile(jsonStr, filename, 'application/json');
      InventoryUI.showToast('Respaldo completo exportado a JSON.', 'success');
    };

    InventoryUI.elements.btnGlobalExport.addEventListener('click', exportAll);
    InventoryUI.elements.btnBackupExport?.addEventListener('click', exportAll);
    InventoryUI.elements.btnFileSave?.addEventListener('click', exportAll);

    // Importar JSON
    InventoryUI.elements.btnGlobalImport.addEventListener('click', triggerImport);
    InventoryUI.elements.btnBackupImport?.addEventListener('click', triggerImport);
  }

  /**
   * Helper para descargar cadenas de texto como archivos en el navegador.
   */
  function downloadFile(content, fileName, contentType) {
    const a = document.createElement('a');
    const file = new Blob([content], { type: contentType });
    a.href = URL.createObjectURL(file);
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /**
   * Registro del Service Worker para PWA (offline)
   */
  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then((reg) => {
            console.log('Service Worker registrado con éxito:', reg.scope);
            if (reg.waiting) {
              reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            }
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

  // Arrancar aplicación
  init();
});
