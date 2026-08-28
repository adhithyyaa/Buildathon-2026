import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { Icon } from '../components/icons';

/**
 * Login page for Recoup. This is the product's own demo sign-in — it does not authenticate against a
 * backend or transmit the credentials; submitting simply enters the dashboard.
 */
export function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    nav('/app');
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <aside className="relative hidden overflow-hidden bg-slate-900 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 -left-24 h-96 w-96 rounded-full bg-violet-600/30 blur-3xl" />
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
      <main className="flex items-center justify-center bg-white px-5 py-12">
        <div className="w-full max-w-sm">
          <Link to="/" className="mb-8 flex items-center gap-2.5 lg:hidden">
            <Logo className="h-9 w-9" />
            <span className="text-xl font-bold tracking-tight text-slate-900">Recoup</span>
          </Link>

          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Welcome back</h1>
          <p className="mt-1.5 text-sm text-slate-500">Sign in to your recovery workspace.</p>

          <div className="mt-7 grid grid-cols-2 gap-3">
            <button onClick={() => nav('/app')} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50">
              <GoogleMark /> Google
            </button>
            <button onClick={() => nav('/app')} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50">
              <Icon name="shield" className="h-4 w-4" /> SSO
            </button>
          </div>

          <div className="my-6 flex items-center gap-3 text-xs font-medium text-slate-400">
            <span className="h-px flex-1 bg-slate-200" /> or continue with email <span className="h-px flex-1 bg-slate-200" />
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-slate-700">Work email</label>
              <input
                id="email" type="email" autoComplete="email" required value={email}
                onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-200"
              />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-semibold text-slate-700">Password</label>
                <a href="#" className="text-xs font-semibold text-violet-600 hover:text-violet-700">Forgot?</a>
              </div>
              <input
                id="password" type="password" autoComplete="current-password" required value={password}
                onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-200"
              />
            </div>
            <button type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-violet-600/20 transition-transform hover:-translate-y-0.5">
              Sign in <Icon name="arrow" className="h-4 w-4" />
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            New to Recoup? <Link to="/login" className="font-semibold text-violet-600 hover:text-violet-700">Create an account</Link>
          </p>
          <p className="mt-8 text-center text-xs text-slate-400">
            <Link to="/" className="hover:text-slate-600">← Back to home</Link>
          </p>
        </div>
      </main>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1 2.6-2.1 3.4v2.8h3.4c2-1.8 3.1-4.5 3.1-7.7 0-.7-.06-1.4-.18-2.1H12z" />
      <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.4-2.8c-.9.6-2 1-3.2 1-2.5 0-4.6-1.7-5.3-3.9H3.2v2.9C4.8 19.9 8.1 22 12 22z" />
      <path fill="#FBBC05" d="M6.7 13.9c-.2-.6-.3-1.2-.3-1.9s.1-1.3.3-1.9V7.2H3.2C2.6 8.6 2.2 10.2 2.2 12s.4 3.4 1 4.8l3.5-2.9z" />
      <path fill="#4285F4" d="M12 6.2c1.5 0 2.8.5 3.8 1.5l2.9-2.9C16.9 3.2 14.7 2.2 12 2.2 8.1 2.2 4.8 4.3 3.2 7.2l3.5 2.9C7.4 7.9 9.5 6.2 12 6.2z" />
    </svg>
  );
}
