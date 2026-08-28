import { useEffect, useRef, useState } from 'react';
import { GOOGLE_CLIENT_ID, googleConfigured, loadGoogleScript, decodeGoogleCredential } from '../lib/google';
import { useAuth } from '../lib/auth';

type ButtonText = 'signin_with' | 'signup_with' | 'continue_with';

/**
 * Real "Sign in with Google" using Google Identity Services. Renders Google's official button; on a
 * successful credential it decodes the ID token, stores the session, and calls onSuccess.
 * When VITE_GOOGLE_CLIENT_ID is unset it renders a setup hint instead of a dead button.
 */
export function GoogleSignInButton({
  onSuccess,
  onError,
  text = 'continue_with',
}: {
  onSuccess: () => void;
  onError: (message: string) => void;
  text?: ButtonText;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const { signIn } = useAuth();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  // Keep the latest callbacks in refs so the init effect can run exactly once (GIS init is not idempotent
  // in a way that likes re-runs, and inline parent callbacks would otherwise re-trigger it every render).
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  const signInRef = useRef(signIn);
  onSuccessRef.current = onSuccess;
  onErrorRef.current = onError;
  signInRef.current = signIn;

  useEffect(() => {
    if (!googleConfigured) {
      setStatus('error');
      return;
    }
    let cancelled = false;

    loadGoogleScript()
      .then(() => {
        if (cancelled || !holder.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          auto_select: false,
          cancel_on_tap_outside: true,
          callback: (response) => {
            const profile = decodeGoogleCredential(response.credential);
            if (!profile) {
              onErrorRef.current('We could not read your Google account. Please try again.');
              return;
            }
            signInRef.current({
              name: profile.name,
              email: profile.email,
              picture: profile.picture,
              provider: 'google',
            });
            onSuccessRef.current();
          },
        });
        holder.current.innerHTML = '';
        const width = Math.min(Math.max(holder.current.clientWidth || 320, 240), 400);
        window.google.accounts.id.renderButton(holder.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text,
          shape: 'rectangular',
          logo_alignment: 'left',
          width,
        });
        setStatus('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setStatus('error');
        onErrorRef.current('Google sign-in is unavailable right now. Please use email below.');
      });

    return () => {
      cancelled = true;
    };
  }, [text]);

  if (!googleConfigured) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-center text-xs leading-relaxed text-slate-500">
        Google sign-in isn’t configured yet. Add{' '}
        <code className="rounded bg-slate-200/70 px-1 py-0.5 font-mono text-[11px] text-slate-700">VITE_GOOGLE_CLIENT_ID</code>{' '}
        to <code className="rounded bg-slate-200/70 px-1 py-0.5 font-mono text-[11px] text-slate-700">web/.env.local</code>, then use email below.
      </div>
    );
  }

  return (
    <div className="min-h-[44px]">
      {/* GIS renders its button (in a light-scheme iframe) into this holder once ready. */}
      <div ref={holder} className={status === 'ready' ? 'flex justify-center [color-scheme:light]' : 'hidden'} />
      {status === 'loading' && <div className="h-11 w-full animate-pulse rounded-xl bg-slate-100" aria-hidden="true" />}
      {status === 'error' && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-center text-xs text-rose-600">
          Couldn’t load Google sign-in. Please use email below.
        </div>
      )}
    </div>
  );
}
