// Real Google sign-in via Google Identity Services (GIS). We use the ID-token flow: the official
// Google button returns a signed JWT credential, which we decode client-side for the user's profile.
// Configuration is a public OAuth client ID (safe in the browser) — set VITE_GOOGLE_CLIENT_ID.

export const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '').trim();
export const googleConfigured = GOOGLE_CLIENT_ID.length > 0;

const GSI_SRC = 'https://accounts.google.com/gsi/client';
let loadPromise: Promise<void> | null = null;

/** Load the GIS script exactly once and resolve when window.google.accounts.id is ready. */
export function loadGoogleScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Google sign-in needs a browser'));
  if (window.google?.accounts?.id) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById('google-gsi') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Google sign-in')));
      if (window.google?.accounts?.id) resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = GSI_SRC;
    script.async = true;
    script.defer = true;
    script.id = 'google-gsi';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google sign-in'));
    document.head.appendChild(script);
  });
  return loadPromise;
}

export interface GoogleProfile {
  name: string;
  email: string;
  picture?: string;
}

/** Decode the payload of a Google-issued ID token (JWT). */
export function decodeGoogleCredential(credential: string): GoogleProfile | null {
  try {
    const payload = credential.split('.')[1];
    if (!payload) return null;
    const claims = JSON.parse(base64UrlDecode(payload)) as {
      name?: string;
      given_name?: string;
      email?: string;
      picture?: string;
      email_verified?: boolean;
    };
    if (!claims.email) return null;
    const name = claims.name || claims.given_name || claims.email.split('@')[0];
    return { name, email: claims.email, picture: claims.picture };
  } catch {
    return null;
  }
}

/** Base64url → UTF-8 string (handles names with non-ASCII characters). */
function base64UrlDecode(input: string): string {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
