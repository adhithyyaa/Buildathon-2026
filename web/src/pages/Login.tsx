import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { Icon } from '../components/icons';
import { GoogleSignInButton } from '../components/GoogleSignInButton';
import { useAuth } from '../lib/auth';

type Mode = 'signin' | 'signup';

/**
 * Sign-in / create-account for Recoup. Google uses real Google Identity Services; the email path
 * establishes a local session so the dashboard is always reachable (there is no email backend).
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

  // Redirect the moment a session exists — covers Google, email, and landing here already signed in.
  useEffect(() => {
    if (user) nav(from, { replace: true });
  }, [user, from, nav]);

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
    // Brief delay so the loading state reads as a real sign-in before we route into the app.
    window.setTimeout(() => {
      signIn({ name: display, email: email.trim(), provider: 'email' });
    }, 550);
  };

  const heading = mode === 'signin' ? 'Welcome back' : 'Create your account';
  const sub = mode === 'signin' ? 'Sign in to your recovery workspace.' : 'Start recovering revenue in minutes.';

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <aside className="relative hidden overflow-hidden bg-slate-900 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-violet-600/30 blur-3xl" />
          <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-indigo-600/20 blur-3xl" />
        </div>
        <Link to="/" className="relative flex items-center gap-2.5 text-white">
          <Logo className="h-9 w-9" />
          <span className="text-xl font-bold tracking-tight">Recoup</span>
        </Link>
        <div className="relative">
          <h2 className="text-3xl font-bold leading-tight text-white">
            Recover the revenue<br />you already earned.
          </h2>
          <p className="mt-4 max-w-md text-slate-300">
            The ML-first recovery layer for Razorpay — calibrated decisions, bounded execution, and
            holdout-measured proof of every incremental rupee.
          </p>
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <div className="text-xs font-medium text-violet-200">Incremental recovered (vs control)</div>
            <div className="mt-1 text-3xl font-extrabold text-white">₹2,27,080</div>
            <div className="mt-1 text-xs text-emerald-300">+31.7pp lift · 95% CI · significant</div>
          </div>
        </div>
        <div className="relative flex items-center gap-4 text-xs font-medium text-slate-400">
          <span className="flex items-center gap-1.5"><Icon name="shield" className="h-4 w-4 text-violet-400" /> Policy-as-code</span>
          <span className="flex items-center gap-1.5"><Icon name="link" className="h-4 w-4 text-violet-400" /> Exactly-once</span>
          <span className="flex items-center gap-1.5"><Icon name="audit" className="h-4 w-4 text-violet-400" /> Audited</span>
        </div>
      </aside>

      {/* Form panel */}
      <main className="flex flex-col bg-white px-5 py-8 sm:px-8">
        {/* Back control — home on sign-in, previous step on sign-up */}
        <div className="mb-8">
          {mode === 'signup' ? (
            <button
              onClick={() => switchMode('signin')}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              <Icon name="arrowLeft" className="h-4 w-4" /> Back to sign in
            </button>
          ) : (
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              <Icon name="arrowLeft" className="h-4 w-4" /> Back to home
            </Link>
          )}
        </div>

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center">
          <Link to="/" className="mb-8 flex items-center gap-2.5 lg:hidden">
            <Logo className="h-9 w-9" />
            <span className="text-xl font-bold tracking-tight text-slate-900">Recoup</span>
          </Link>

          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{heading}</h1>
          <p className="mt-1.5 text-sm text-slate-500">{sub}</p>

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

          <div className="my-6 flex items-center gap-3 text-xs font-medium text-slate-400">
            <span className="h-px flex-1 bg-slate-200" /> or continue with email <span className="h-px flex-1 bg-slate-200" />
          </div>

          <form onSubmit={submitEmail} noValidate className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label htmlFor="name" className="mb-1.5 block text-sm font-semibold text-slate-700">Full name</label>
                <input
                  id="name" type="text" autoComplete="name" value={name}
                  onChange={(e) => setName(e.target.value)} placeholder="Priya Sharma"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-200"
                />
              </div>
            )}
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-slate-700">Work email</label>
              <input
                id="email" type="email" autoComplete="email" value={email}
                onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-200"
              />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-semibold text-slate-700">Password</label>
                {mode === 'signin' && <a href="#" className="text-xs font-semibold text-violet-600 hover:text-violet-700">Forgot?</a>}
              </div>
              <input
                id="password" type="password"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password}
                onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-200"
              />
            </div>
            <button
              type="submit" disabled={submitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-violet-600/20 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
            >
              {submitting ? (
                <><Spinner /> Signing in…</>
              ) : (
                <>{mode === 'signin' ? 'Sign in' : 'Create account'} <Icon name="arrow" className="h-4 w-4" /></>
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            {mode === 'signin' ? (
              <>New to Recoup?{' '}
                <button onClick={() => switchMode('signup')} className="font-semibold text-violet-600 hover:text-violet-700">Create an account</button>
              </>
            ) : (
              <>Already have an account?{' '}
                <button onClick={() => switchMode('signin')} className="font-semibold text-violet-600 hover:text-violet-700">Sign in</button>
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
