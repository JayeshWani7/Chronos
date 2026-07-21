export function initStorageObserver(publish: (category: string, type: string, payload: any) => void) {
  const methods: ('setItem' | 'removeItem' | 'clear')[] = ['setItem', 'removeItem', 'clear'];

  const patchStorage = (storageName: 'localStorage' | 'sessionStorage') => {
    const storageObj = window[storageName];
    if (!storageObj) return;

    methods.forEach(method => {
      const original = (Storage.prototype as any)[method];
      storageObj[method] = function(...args: any[]) {
        const result = original.apply(storageObj, args);

        try {
          if (method === 'setItem') {
            publish('storage', storageName, {
              op: 'set',
              key: args[0],
              value: args[1]
            });
          } else if (method === 'removeItem') {
            publish('storage', storageName, {
              op: 'remove',
              key: args[0]
            });
          } else if (method === 'clear') {
            publish('storage', storageName, {
              op: 'clear'
            });
          }
        } catch (e) {}

        return result;
      };
    });
  };

  try {
    patchStorage('localStorage');
    patchStorage('sessionStorage');
  } catch (e) {}

  // Monkeypatch document.cookie via descriptor property interception
  try {
    const proto = Document.prototype;
    const cookieDesc = Object.getOwnPropertyDescriptor(proto, 'cookie') || 
                       Object.getOwnPropertyDescriptor(HTMLDocument.prototype, 'cookie');

    if (cookieDesc && cookieDesc.set) {
      const originalSet = cookieDesc.set;
      const originalGet = cookieDesc.get;
      Object.defineProperty(document, 'cookie', {
        configurable: true,
        enumerable: true,
        get() {
          return originalGet ? originalGet.call(document) : '';
        },
        set(val: string) {
          originalSet.call(document, val);
          try {
            publish('storage', 'cookie', {
              op: 'set',
              value: val
            });
          } catch (e) {}
        }
      });
    }
  } catch (e) {
    // Poller fallback if descriptor patch is blocked
    let lastCookie = document.cookie;
    setInterval(() => {
      try {
        if (document.cookie !== lastCookie) {
          lastCookie = document.cookie;
          publish('storage', 'cookie', {
            op: 'poll_change',
            value: lastCookie
          });
        }
      } catch (err) {}
    }, 1000);
  }
}
