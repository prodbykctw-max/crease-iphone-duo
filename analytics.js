(() => {
  const endpoint = window.CREASE_ANALYTICS_ENDPOINT;
  if (!endpoint || navigator.doNotTrack === '1' || navigator.globalPrivacyControl) return;
  try { if (new URL(endpoint).protocol !== 'https:') return; } catch (_) { return; }
  window.addEventListener('crease:metric', ({ detail }) => {
    if (!crypto.randomUUID) return;
    fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit',
      body: JSON.stringify({ id: crypto.randomUUID(), name: detail.name, props: detail.props }),
      keepalive: true,
    }).catch(() => {}); // Telemetry must never block a match. No offline queue or identifiers.
  });
})();

