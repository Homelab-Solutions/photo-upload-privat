(function () {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');
  const previewGrid = document.getElementById('preview-grid');
  const submitBtn = document.getElementById('submit-btn');
  const form = document.getElementById('upload-form');
  const progressBar = document.getElementById('progress-bar');
  const progressFill = document.getElementById('progress-fill');

  if (!dropzone || !fileInput) return;

  const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp'];
  const VIDEO_EXT = ['.mp4', '.mov'];
  let currentFiles = [];

  function extOf(name) {
    const i = name.lastIndexOf('.');
    return i === -1 ? '' : name.slice(i).toLowerCase();
  }

  function renderPreviews() {
    previewGrid.innerHTML = '';
    currentFiles.forEach((file) => {
      const div = document.createElement('div');
      div.className = 'thumb';
      const ext = extOf(file.name);
      if (IMAGE_EXT.includes(ext)) {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        div.appendChild(img);
      } else {
        div.textContent = '🎬';
        div.style.display = 'flex';
        div.style.alignItems = 'center';
        div.style.justifyContent = 'center';
        div.style.fontSize = '28px';
      }
      previewGrid.appendChild(div);
    });
    submitBtn.disabled = currentFiles.length === 0;
  }

  function setFiles(fileList) {
    const files = Array.from(fileList);
    const valid = [];
    const rejected = [];
    for (const file of files) {
      const ext = extOf(file.name);
      const isImage = IMAGE_EXT.includes(ext);
      const isVideo = VIDEO_EXT.includes(ext);
      if (!isImage && !isVideo) {
        rejected.push(`${file.name}: nicht unterstuetztes Format.`);
        continue;
      }
      const maxBytes = (isImage ? window.MAX_IMAGE_MB : window.MAX_VIDEO_MB) * 1024 * 1024;
      if (file.size > maxBytes) {
        rejected.push(`${file.name}: zu gross.`);
        continue;
      }
      valid.push(file);
    }
    if (rejected.length) alert('Einige Dateien wurden nicht uebernommen:\n' + rejected.join('\n'));
    currentFiles = valid;
    renderPreviews();
  }

  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => setFiles(fileInput.files));

  ['dragenter', 'dragover'].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
  });
  ['dragleave', 'drop'].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    });
  });
  dropzone.addEventListener('drop', (e) => {
    if (e.dataTransfer?.files?.length) setFiles(e.dataTransfer.files);
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!currentFiles.length) return;

    const formData = new FormData();
    formData.append('_csrf', form.querySelector('[name="_csrf"]').value);
    currentFiles.forEach((file) => formData.append('photos', file));

    const xhr = new XMLHttpRequest();
    xhr.open('POST', form.action);
    xhr.upload.addEventListener('progress', (evt) => {
      if (evt.lengthComputable) {
        progressBar.style.display = 'block';
        progressFill.style.width = `${Math.round((evt.loaded / evt.total) * 100)}%`;
      }
    });
    xhr.onload = () => {
      document.open();
      document.write(xhr.responseText);
      document.close();
    };
    xhr.onerror = () => alert('Upload fehlgeschlagen. Bitte erneut versuchen.');
    xhr.send(formData);

    submitBtn.disabled = true;
    submitBtn.textContent = 'Wird hochgeladen...';
  });
})();
