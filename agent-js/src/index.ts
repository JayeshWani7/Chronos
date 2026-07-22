import { initDomObserver } from './dom-observer';
import { initConsoleObserver } from './console-observer';
import { initNetworkObserver } from './network-observer';
import { initStorageObserver } from './storage-observer';
import { initInputObserver } from './input-observer';

function publish(category: string, type: string, payload: any) {
  const event = {
    ts_ms: Date.now(),
    category,
    type,
    payload
  };

  const anyWin = window as any;
  if (typeof anyWin.chronosPublish === 'function') {
    anyWin.chronosPublish(JSON.stringify(event));
  } else {
    if (!anyWin.__chronos_queue) {
      anyWin.__chronos_queue = [];
    }
    anyWin.__chronos_queue.push(event);
  }
}

function init() {
  const anyWin = window as any;
  if (anyWin.__chronos_initialized) return;
  anyWin.__chronos_initialized = true;

  try {
    initDomObserver(publish);
    initConsoleObserver(publish);
    initNetworkObserver(publish);
    initStorageObserver(publish);
    initInputObserver(publish);

    console.log("[Chronos] Browser instrumentation agent successfully loaded.");

    // Flush backlog if the binding became ready after queueing
    if (typeof anyWin.chronosPublish === 'function' && anyWin.__chronos_queue) {
      const backlog = anyWin.__chronos_queue;
      anyWin.__chronos_queue = [];
      backlog.forEach((ev: any) => anyWin.chronosPublish(JSON.stringify(ev)));
    }
  } catch (err) {
    console.error("[Chronos] Error starting observers:", err);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
