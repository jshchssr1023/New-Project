import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const result = await login(email, password);

    if (result.success) {
      // Check for redirect after login
      const redirect = sessionStorage.getItem('redirectAfterLogin');
      const safePath = redirect && redirect.startsWith('/') && !redirect.includes('//') ? redirect : '/';
      sessionStorage.removeItem('redirectAfterLogin');
      navigate(safePath);
    } else {
      setError(result.error || 'Invalid email or password');
    }

    setIsLoading(false);
  };

  return (
    <div className="flex min-h-screen flex-col justify-center bg-gradient-to-br from-steel-800 to-steel-900 px-6 py-12 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <img
            src="/images/chronos-logo.png"
            alt="Chronos"
            className="h-32 w-auto"
          />
        </div>
        <p className="mt-4 text-center text-steel-400">Railcar Service Scheduler</p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="card">
          <h2 className="mb-6 text-center text-2xl font-semibold text-steel-900">
            Sign in to your account
          </h2>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="label">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                placeholder="you@company.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="label">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                placeholder="Enter your password"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full disabled:opacity-50"
            >
              {isLoading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          {/* SECURITY FIX: Removed hardcoded demo credentials from UI
              Demo credentials should be documented in README or internal docs only */}
        </div>
      </div>
    </div>
  );
}
