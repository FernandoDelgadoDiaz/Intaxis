const nativeFetch = window.fetch.bind(window);

window.fetch = (input, init = {}) => {
  try {
    const url = typeof input === 'string' ? input : input?.url;
    const isChat = typeof url === 'string' && url.startsWith('/api/chat');
    const isPost = String(init?.method || 'GET').toUpperCase() === 'POST';

    if (isChat && isPost) {
      let mission = '';

      if (typeof init.body === 'string') {
        mission = init.body;
        const headersForRead = new Headers(init.headers || {});
        if ((headersForRead.get('content-type') || '').includes('application/json')) {
          try {
            const parsed = JSON.parse(init.body);
            mission = parsed?.mensaje ?? parsed?.mission ?? parsed?.message ?? mission;
          } catch {
            // Keep the raw body as fallback.
          }
        }
      }

      mission = String(mission || '').trim();
      if (mission) {
        const headers = new Headers(init.headers || {});
        headers.set('X-Agentic-Mission', encodeURIComponent(mission));

        const separator = url.includes('?') ? '&' : '?';
        const patchedUrl = url.includes('mensaje=')
          ? url
          : `${url}${separator}mensaje=${encodeURIComponent(mission)}`;

        const patchedInit = { ...init, headers };

        if (typeof input === 'string') {
          return nativeFetch(patchedUrl, patchedInit);
        }

        return nativeFetch(new Request(patchedUrl, input), patchedInit);
      }
    }
  } catch {
    // Never block the original request if the transport fallback cannot patch it.
  }

  return nativeFetch(input, init);
};
