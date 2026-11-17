(function () {
  const form = document.getElementById('bulk-form');
  if (!form) return;
  const selCount = document.getElementById('sel-count');

  function updateCount() {
    selCount.textContent = form.querySelectorAll('.photo-checkbox:checked').length;
  }

  form.querySelectorAll('.photo-checkbox').forEach((cb) => cb.addEventListener('change', updateCount));

  form.querySelectorAll('.select-all-guest').forEach((master) => {
    master.addEventListener('change', () => {
      const group = master.closest('.guest-group');
      group.querySelectorAll('.photo-checkbox').forEach((cb) => { cb.checked = master.checked; });
      updateCount();
    });
  });

  form.addEventListener('submit', (e) => {
    const checked = form.querySelectorAll('.photo-checkbox:checked').length;
    if (checked === 0) {
      e.preventDefault();
      alert('Bitte zuerst mindestens ein Foto auswaehlen.');
    }
  });
})();
