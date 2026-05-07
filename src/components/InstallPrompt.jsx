import { useEffect, useState } from 'react';

// Browsers fire `beforeinstallprompt` when the PWA is installable.
// We capture it, show our own pretty banner, and call it when the user clicks.
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState(null);
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem('hac:install-dismissed') === '1'
  );

  useEffect(() => {
    const onPrompt = (e) => {
      e.preventDefault();
      setDeferred(e);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (!deferred || dismissed) return null;

  const install = async () => {
    deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  };

  const dismiss = () => {
    localStorage.setItem('hac:install-dismissed', '1');
    setDismissed(true);
  };

  return (
    <div className="install-banner" role="dialog">
      <span>Install this calculator for offline use?</span>
      <button onClick={install}>Install</button>
      <button onClick={dismiss} className="dismiss">Not now</button>
    </div>
  );
}
