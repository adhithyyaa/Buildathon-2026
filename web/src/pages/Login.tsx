import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { Icon } from '../components/icons';
import { GoogleSignInButton } from '../components/GoogleSignInButton';
import { useAuth } from '../lib/auth';

type Mode = 'signin' | 'signup';

/**
 * Sign-in / create-account for Overwatch — the onboarding surface, matched to the marketing identity:
 * a deep-pine brand panel + warm-cream form, DM Serif display headings, a mossy signal, pill buttons.
 * Google uses real Google Identity Services; the email path establishes a local session so the console
 * is always reachable (there is no email backend).
 */
export function Login() {
  const nav = useNavigate();
  const location = useLocation();
  const { user, signIn } = useAuth();

  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? '/app';

  useEffect(() => {
    if (user) nav(from, { replace: true });
  }, [user, from, nav]);

  // Paint the warm cream ground while onboarding is mounted (drops the dashboard's slate gradient).
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-mkt', '');
    return () => root.removeAttribute('data-mkt');
  }, []);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setPassword('');
  };

  const validate = (): string | null => {
    if (mode === 'signup' && !name.trim()) return 'Please enter your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Please enter a valid email address.';
    if (password.length < 6) return 'Your password must be at least 6 characters.';
    return null;
  };

  const submitEmail = (e: FormEvent) => {
    e.preventDefault();
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setSubmitting(true);
    const display = mode === 'signup' ? name.trim() : email.trim().split('@')[0];
    window.setTimeout(() => {
      signIn({ name: display, email: email.trim(), provider: 'email' });
    }, 550);
  };

  const heading = mode === 'signin' ? 'Welcome back' : 'Create your account';
  const sub = mode === 'signin' ? 'Sign in to your recovery console.' : 'Start recovering revenue in minutes.';

  const field =
    'w-full rounded-xl border border-hair bg-white px-3.5 py-2.5 text-sm text-forest placeholder:text-fog transition-colors focus:border-fern focus:outline-none focus:ring-2 focus:ring-fern/25';

  return (
    <div className="grid min-h-screen bg-cream font-grotesk text-bark lg:grid-cols-2">
      {/* Brand panel */}
      <aside
        className="relative hidden overflow-hidden bg-pine text-cream lg:flex lg:flex-col lg:justify-between lg:p-12"
        style={{
          backgroundImage:
            'radial-gradient(560px 320px at 12% 0%, rgba(167,216,186,0.16), transparent 70%), radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)',
          backgroundSize: 'auto, 22px 22px',
        }}
      >
        <Link to="/" className="relative flex items-center gap-2.5">
          <Logo className="h-9 w-9" />
          <span className="text-xl font-bold tracking-tight text-cream">Overwatch</span>
        </Link>

        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full bg-cream/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-mint ring-1 ring-inset ring-cream/15">
            <span className="h-1.5 w-1.5 rounded-full bg-mint" /> Where nothing slips through
          </span>
          <h2 className="mt-6 font-display text-4xl font-semibold leading-[1.05] tracking-[-0.02em] text-cream">
            Recover the revenue<br />you already <span className="text-mint">earned.</span>
          </h2>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-cream/70">
            The revenue-integrity layer for Razorpay — calibrated decisions, bounded execution, and
            holdout-measured proof of every recovered rupee.
          </p>
          <div className="mt-8 max-w-sm rounded-2xl bg-cream/[0.06] p-5 ring-1 ring-inset ring-cream/12">
            <div className="font-mono text-[11px] uppercase tracking-wider text-mint">Incremental recovered · vs control · illustrative</div>
            <div className="mt-1.5 font-display text-3xl font-semibold tabular-nums text-cream">₹3,13,773</div>
            <div className="mt-1 font-mono text-[11px] text-cream/55">+40.2pp lift · 95% CI · significant</div>
          </div>
        </div>

        <div className="relative flex items-center gap-5 font-mono text-[11px] uppercase tracking-wider text-cream/60">
          <span className="flex items-center gap-1.5"><Icon name="shield" className="h-4 w-4 text-mint" /> Policy-as-code</span>
          <span className="flex items-center gap-1.5"><Icon name="link" className="h-4 w-4 text-mint" /> Exactly-once</span>
          <span className="flex items-center gap-1.5"><Icon name="audit" className="h-4 w-4 text-mint" /> Audited</span>
        </div>
      </aside>

      {/* Form panel */}
      <main className="flex flex-col bg-cream px-5 py-8 sm:px-8">
        <div className="mb-8">
          {mode === 'signup' ? (
            <button
              onClick={() => switchMode('signin')}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-fog transition-colors hover:bg-forest/5 hover:text-forest"
            >
              <Icon name="arrowLeft" className="h-4 w-4" /> Back to sign in
            </button>
          ) : (
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-fog transition-colors hover:bg-forest/5 hover:text-forest"
            >
              <Icon name="arrowLeft" className="h-4 w-4" /> Back to home
            </Link>
          )}
        </div>

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center">
          <Link to="/" className="mb-8 flex items-center gap-2.5 lg:hidden">
            <Logo className="h-9 w-9" />
            <span className="text-xl font-bold tracking-tight text-forest">Overwatch</span>
          </Link>

          <h1 className="font-display text-4xl font-semibold tracking-tight text-forest">{heading}</h1>
          <p className="mt-2 text-sm text-fog">{sub}</p>

          {error && (
            <div className="mt-5 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
              <Icon name="power" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="mt-6">
            <GoogleSignInButton
              text={mode === 'signup' ? 'signup_with' : 'continue_with'}
              onSuccess={() => setError(null)}
              onError={(m) => setError(m)}
            />
          </div>

          <div className="my-6 flex items-center gap-3 text-xs font-medium text-fog">
            <span className="h-px flex-1 bg-hair" /> or continue with email <span className="h-px flex-1 bg-hair" />
          </div>

          <form onSubmit={submitEmail} noValidate className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label htmlFor="name" className="mb-1.5 block text-sm font-semibold text-forest">Full name</label>
                <input id="name" type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Priya Sharma" className={field} />
              </div>
            )}
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-forest">Work email</label>
              <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className={field} />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-semibold text-forest">Password</label>
                {mode === 'signin' && <a href="#" className="text-xs font-semibold text-moss hover:text-forest">Forgot?</a>}
              </div>
              <input id="password" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className={field} />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-pine px-4 py-3 text-sm font-semibold text-cream shadow-sm shadow-pine/20 transition-colors hover:bg-pine-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-fern focus-visible:ring-offset-2 focus-visible:ring-offset-cream disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitting ? (
                <><Spinner /> Signing in…</>
              ) : (
                <>{mode === 'signin' ? 'Sign in' : 'Create account'} <Icon name="arrow" className="h-4 w-4" /></>
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-fog">
            {mode === 'signin' ? (
              <>New to Overwatch?{' '}
                <button onClick={() => switchMode('signup')} className="font-semibold text-moss hover:text-forest">Create an account</button>
              </>
            ) : (
              <>Already have an account?{' '}
                <button onClick={() => switchMode('signin')} className="font-semibold text-moss hover:text-forest">Sign in</button>
              </>
            )}
          </p>
        </div>
      </main>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}
