import { useRegisterSW } from 'virtual:pwa-register/react';

// When you publish a new version, the service worker fetches it in the
// background. This banner offers the user a one-click "reload to update".
export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl) {
      // eslint-disable-next-line no-console
      console.log('Service worker registered:', swUrl);
    },
  });

  if (!needRefresh) return null;

  return (
    <div className="install-banner" role="dialog">
      <span>A new version is available.</span>
      <button onClick={() => updateServiceWorker(true)}>Reload</button>
      <button onClick={() => setNeedRefresh(false)} className="dismiss">Later</button>
    </div>
  );
}
