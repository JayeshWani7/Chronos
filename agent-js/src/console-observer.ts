export function initConsoleObserver(publish: (category: string, type: string, payload: any) => void) {
  const levels: ('log' | 'warn' | 'error' | 'info')[] = ['log', 'warn', 'error', 'info'];

  levels.forEach(level => {
    const original = (console as any)[level];
    if (!original) return;

    (console as any)[level] = function(...args: any[]) {
      // Call native console method first
      original.apply(console, args);

      try {
        const message = args.map(arg => {
          if (typeof arg === 'object') {
            try {
              return JSON.stringify(arg);
            } catch {
              return String(arg);
            }
          }
          return String(arg);
        }).join(' ');

        // Capture stack trace
        const err = new Error();
        const stack = err.stack ? err.stack.split('\n').slice(2).join('\n') : '';

        publish('console', level, {
          message,
          stack
        });
      } catch (e) {
        // Safe fallback
      }
    };
  });
}
