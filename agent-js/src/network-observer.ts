export function initNetworkObserver(publish: (category: string, type: string, payload: any) => void) {
  // 1. Monkeypatch window.fetch
  if (typeof window.fetch === 'function') {
    const originalFetch = window.fetch;
    window.fetch = async function(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const tsStart = performance.now();
      let url = '';
      let method = 'GET';

      if (typeof input === 'string') {
        url = input;
      } else if (input instanceof URL) {
        url = input.toString();
      } else if (input instanceof Request) {
        url = input.url;
        method = input.method;
      }

      if (init && init.method) {
        method = init.method;
      }

      try {
        const response = await originalFetch(input, init);
        const tsEnd = performance.now();
        const status = response.status;

        let bodyPreview = '';
        try {
          const cloned = response.clone();
          const bodyText = await cloned.text();
          bodyPreview = bodyText.slice(0, 1000);
        } catch (e) {}

        publish('network', 'fetch', {
          url,
          method,
          status,
          duration_ms: Math.round(tsEnd - tsStart),
          body_preview: bodyPreview
        });

        return response;
      } catch (err: any) {
        const tsEnd = performance.now();
        publish('network', 'fetch_error', {
          url,
          method,
          status: 0,
          duration_ms: Math.round(tsEnd - tsStart),
          error: err.message || String(err)
        });
        throw err;
      }
    };
  }

  // 2. Monkeypatch XMLHttpRequest
  const proto = XMLHttpRequest.prototype;
  const originalOpen = proto.open;
  const originalSend = proto.send;

  proto.open = function(method: string, url: string | URL, ...args: any[]): void {
    (this as any).__chronos_req = {
      method,
      url: String(url),
      tsStart: performance.now()
    };
    return originalOpen.apply(this, [method, url, ...args] as any);
  };

  proto.send = function(body?: Document | XMLHttpRequestBodyInit | null): void {
    const req = (this as any).__chronos_req;
    if (req) {
      this.addEventListener('loadend', () => {
        const tsEnd = performance.now();
        const status = this.status;
        let responseText = '';
        try {
          responseText = this.responseText;
        } catch (e) {}

        publish('network', 'xhr', {
          url: req.url,
          method: req.method,
          status,
          duration_ms: Math.round(tsEnd - req.tsStart),
          body_preview: responseText.slice(0, 1000)
        });
      });
    }
    return originalSend.apply(this, arguments as any);
  };
}
