const root = document.querySelector('#app');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

try {
  await import('./auth-callback.js');
  await import('./chat-transport.js');
  await import('./web.js');
  await import('./agent-run-client.js');
  await import('./discovery-integrated.js');
  await import('./offer-media-ui.js');
} catch (error) {
  console.error(error);
  if (root) {
    root.innerHTML = `<div class="auth-shell"><div class="auth-panel"><div class="login-card"><div class="brand"><div class="logo">AP</div><div class="brand-copy"><h1>Agentic Pymes</h1><p>Acceso seguro</p></div></div><div class="notice danger">${escapeHtml(error?.message || 'No se pudo completar el acceso.')}</div></div></div></div>`;
  }
}
