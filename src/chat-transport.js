const nativeFetch = window.fetch.bind(window);

window.fetch = (input, init = {}) => {
  try {
    const url = typeof input === 'string' ? input : input?.url;
    const isChat = typeof url === 'string' && url.startsWith('/api/chat');
    const isPost = String(init?.method || 'GET').toUpperCase() === 'POST';

    if (isChat && isPost && !url.includes('mensaje=')) {
      let mission = '';
      if (typeof init.body === 'string') {
        mission = init.body;
        if ((init.headers?.['Content-Type'] || init.headers?.['content-type'] || '').includes('application/json')) {
          try {
            const parsed = JSON.parse(init.body);
            mission = parsed?.mensaje ?? parsed?.mission ?? parsed?.message ?? mission;
          } catch {
            // Keep raw body as fallback.
          }
        }
      }

      mission = String(mission || '').trim();
      if (mission) {
        const separator = url.includes('?') ? '&' : '?';
        const patchedUrl = `${url}${separator}mensaje=${encodeURIComponent(mission)}`;
        if (typeof input === 'string') return nativeFetch(patchedUrl, init);
        return nativeFetch(new Request(patchedUrl, input), init);
      }
    }
  } catch {
    // Never block the original request if the transport fallback cannot patch it.
  }

  return nativeFetch(input, init);
};
