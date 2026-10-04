export async function prepareOffline() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
    const notify = () => window.dispatchEvent(new Event('offline-ready'));
    if (registration.active) notify();
    registration.addEventListener('updatefound', () => registration.installing?.addEventListener('statechange', () => {
      if (registration.installing?.state === 'activated') notify();
      if (registration.installing?.state === 'installed' && navigator.serviceWorker.controller) window.dispatchEvent(new Event('offline-update'));
    }));
    navigator.serviceWorker.addEventListener('controllerchange', notify);
  } catch (error) { console.warn('Offline cache unavailable', error); }
}
