import { useState } from 'react';
import { buildShareUrl } from '../lib/shareLink.js';

// Generates a share link for the current inputs, copies it to clipboard,
// and (if available) opens the native OS share sheet.
export default function ShareButton({ inputs }) {
  const [copied, setCopied] = useState(false);

  const onShare = async () => {
    const url = buildShareUrl(inputs);
    try {
      // Native share sheet on phones
      if (navigator.share) {
        await navigator.share({
          title: 'Home Affordability Scenario',
          text: 'Here\'s a home affordability scenario I put together.',
          url,
        });
        return;
      }
    } catch {
      /* user cancelled native share — fall through to copy */
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this link:', url);
    }
  };

  return (
    <button className="button secondary small" onClick={onShare}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
        <polyline points="16 6 12 2 8 6" />
        <line x1="12" y1="2" x2="12" y2="15" />
      </svg>
      {copied ? 'Link copied!' : 'Share'}
    </button>
  );
}
