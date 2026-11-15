export function getTheme() {
  return localStorage.getItem('pos_theme') || 'light';
}

export function applyTheme(mode) {
  document.documentElement.dataset.theme = mode;
  localStorage.setItem('pos_theme', mode);
  window.dispatchEvent(new CustomEvent('pos-theme', { detail: mode }));
}

export function initTheme() {
  applyTheme(getTheme());
}

export function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  return next;
}
