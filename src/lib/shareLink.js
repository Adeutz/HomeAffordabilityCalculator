// Encode the calculator inputs into a URL hash so users can share their
// scenario by sending a link.
//
// We use base64url(JSON) and stick it in the URL hash (#) so it doesn't
// hit the server and still works with GitHub Pages.

function toBase64Url(str) {
  // btoa needs a binary-safe string. Encode through a TextEncoder first so
  // unicode (and big numbers as JSON) survive cleanly.
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(b64url) {
  const padded = b64url.replace(/-/g, '+').replace(/_/g, '/') +
    '='.repeat((4 - (b64url.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encodeInputs(inputs) {
  return toBase64Url(JSON.stringify(inputs));
}

export function decodeInputs(encoded) {
  try {
    return JSON.parse(fromBase64Url(encoded));
  } catch {
    return null;
  }
}

export function buildShareUrl(inputs) {
  const encoded = encodeInputs(inputs);
  const url = new URL(window.location.href);
  url.hash = `s=${encoded}`;
  return url.toString();
}

export function readSharedFromHash() {
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash.startsWith('s=')) return null;
  return decodeInputs(hash.slice(2));
}
