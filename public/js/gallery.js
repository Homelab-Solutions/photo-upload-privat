(function () {
  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
  const eventId = window.EVENT_ID;
  const selected = new Set();

  const grid = document.getElementById('gallery-grid');
  const downloadBtn = document.getElementById('download-selected');
  const clearBtn = document.getElementById('clear-selection');
  const countEl = document.getElementById('selected-count');
  const lightbox = document.getElementById('lightbox');
  const lightboxContent = document.getElementById('lightbox-content');
  const lightboxClose = document.getElementById('lightbox-close');

  function updateSelectionUI() {
    countEl.textContent = selected.size;
    downloadBtn.disabled = selected.size === 0;
  }

  if (grid) {
    grid.querySelectorAll('img').forEach((img) => {
      img.addEventListener('load', () => img.closest('.photo-tile')?.classList.remove('skeleton'));
      if (img.complete) img.closest('.photo-tile')?.classList.remove('skeleton');
    });
    grid.querySelectorAll('video').forEach((v) => {
      v.addEventListener('loadedmetadata', () => v.closest('.photo-tile')?.classList.remove('skeleton'));
    });

    grid.querySelectorAll('.select-check').forEach((cb) => {
      cb.addEventListener('change', () => {
        if (cb.checked) selected.add(cb.dataset.id);
        else selected.delete(cb.dataset.id);
        updateSelectionUI();
      });
      cb.addEventListener('click', (e) => e.stopPropagation());
    });

    grid.querySelectorAll('.like-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        btn.disabled = true;
        try {
          const res = await fetch(`/e/${eventId}/photos/${btn.dataset.id}/like`, {
            method: 'POST',
            headers: { 'X-CSRF-Token': csrfToken },
          });
          if (res.ok) {
            const data = await res.json();
            btn.querySelector('.like-count').textContent = data.likes;
          }
        } finally {
          btn.disabled = false;
        }
      });
    });

    grid.querySelectorAll('.photo-tile').forEach((tile) => {
      tile.addEventListener('click', () => openLightbox(tile.dataset.id, tile.dataset.type));
    });
  }

  function openLightbox(id, type) {
    lightboxContent.innerHTML = '';
    let el;
    if (type === 'video') {
      el = document.createElement('video');
      el.src = `/e/${eventId}/media/${id}/original`;
      el.controls = true;
      el.autoplay = true;
    } else {
      el = document.createElement('img');
      el.src = `/e/${eventId}/media/${id}/original`;
    }
    lightboxContent.appendChild(el);
    lightbox.classList.add('open');
  }

  lightboxClose?.addEventListener('click', () => {
    lightbox.classList.remove('open');
    lightboxContent.innerHTML = '';
  });
  lightbox?.addEventListener('click', (e) => {
    if (e.target === lightbox) {
      lightbox.classList.remove('open');
      lightboxContent.innerHTML = '';
    }
  });

  clearBtn?.addEventListener('click', () => {
    selected.clear();
    grid.querySelectorAll('.select-check').forEach((cb) => { cb.checked = false; });
    updateSelectionUI();
  });

  downloadBtn?.addEventListener('click', async () => {
    if (!selected.size) return;
    downloadBtn.disabled = true;
    downloadBtn.textContent = 'Erstelle ZIP...';
    try {
      const res = await fetch(`/e/${eventId}/download-zip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ photoIds: Array.from(selected) }),
      });
      if (!res.ok) throw new Error('ZIP konnte nicht erstellt werden.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'fotos.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message);
    } finally {
      updateSelectionUI();
      downloadBtn.textContent = `Ausgewaehlte herunterladen (${selected.size})`;
    }
  });
})();
