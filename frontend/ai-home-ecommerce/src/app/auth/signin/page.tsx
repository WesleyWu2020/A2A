'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getProviders, signIn, useSession } from 'next-auth/react';
import { Sparkles } from 'lucide-react';

const REDIRECT_CACHE_KEY = 'post_login_callback_url';

function normalizeCallbackUrl(raw: string | null): string {
  if (!raw) return '/chat';
  if (!raw.startsWith('/')) return '/chat';
  if (raw.startsWith('//')) return '/chat';
  return raw;
}

function getOAuthErrorMessage(code: string): string {
  const map: Record<string, string> = {
    OAuthSignin: 'Google sign-in initialization failed. Please retry.',
    OAuthCallback: 'Google callback timed out or failed. Verify redirect URI and ensure your proxy/network can access Google endpoints.',
    OAuthCreateAccount: 'Google account creation failed. Please retry.',
    AccessDenied: 'Google login was denied. Please allow access and try again.',
    Configuration: 'OAuth is not configured correctly on server side.',
  };
  return map[code] || 'Google authorization failed. Please try again.';
}

function SignInContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { status } = useSession();
  const [googleReady, setGoogleReady] = useState<boolean | null>(null);
  const [devReady, setDevReady] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [effectiveCallbackUrl, setEffectiveCallbackUrl] = useState('/chat');

  const callbackUrl = useMemo(() => normalizeCallbackUrl(params.get('callbackUrl')), [params]);
  const authReason = useMemo(() => params.get('reason') || '', [params]);
  const oauthError = useMemo(() => params.get('error') || '', [params]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (callbackUrl !== '/chat') {
      window.sessionStorage.setItem(REDIRECT_CACHE_KEY, callbackUrl);
      setEffectiveCallbackUrl(callbackUrl);
      return;
    }

    const cached = normalizeCallbackUrl(window.sessionStorage.getItem(REDIRECT_CACHE_KEY));
    setEffectiveCallbackUrl(cached);
  }, [callbackUrl]);

  useEffect(() => {
    if (status === 'authenticated') {
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(REDIRECT_CACHE_KEY);
      }
      router.replace(effectiveCallbackUrl);
    }
  }, [status, effectiveCallbackUrl, router]);

  useEffect(() => {
    let cancelled = false;

    const loadProviders = async () => {
      try {
        const providers = await getProviders();
        if (!cancelled) {
          setGoogleReady(Boolean(providers?.google));
          setDevReady(Boolean(providers?.['dev-login']));
        }
      } catch {
        if (!cancelled) {
          setGoogleReady(false);
          setDevReady(false);
        }
      }
    };

    loadProviders();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleGoogleSignIn = async () => {
    setAuthError(null);

    if (googleReady === false) {
      setAuthError('Google sign-in is not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await signIn('google', { callbackUrl: effectiveCallbackUrl, redirect: false });
      if (result?.error) {
        setAuthError('Google sign-in failed. Please try again.');
        return;
      }
      if (result?.url) {
        router.push(result.url);
        return;
      }
      setAuthError('Unable to continue with Google at the moment.');
    } catch {
      setAuthError('Unable to continue with Google at the moment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDevGuestSignIn = async () => {
    setAuthError(null);
    setIsSubmitting(true);
    try {
      const result = await signIn('dev-login', {
        callbackUrl: effectiveCallbackUrl,
        redirect: false,
        mode: 'guest',
      });

      if (result?.error) {
        setAuthError('Dev guest sign-in failed.');
        return;
      }
      if (result?.url) {
        router.push(result.url);
        return;
      }
      setAuthError('Unable to complete dev guest sign-in.');
    } catch {
      setAuthError('Unable to complete dev guest sign-in.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 via-white to-blue-100 px-6">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white/90 p-8 shadow-xl backdrop-blur">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Continue after sign in</h1>
            <p className="text-sm text-slate-500">Use your Google account to sync conversations and preferences automatically.</p>
          </div>
        </div>

        <button
          onClick={handleGoogleSignIn}
          disabled={isSubmitting || googleReady !== true}
          className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white text-sm">G</span>
          {isSubmitting ? 'Redirecting...' : 'Continue with Google'}
        </button>

        {authReason === 'auth_required' && (
          <p className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
            Please sign in first. You will be redirected back to {effectiveCallbackUrl} after successful login.
          </p>
        )}

        {devReady && (
          <div className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-medium text-slate-600">Development Fallback Login</p>
            <button
              onClick={handleDevGuestSignIn}
              disabled={isSubmitting}
              className="w-full rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
            >
              Continue as Guest (Dev)
            </button>
          </div>
        )}

        {authError && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {authError}
          </p>
        )}

        {!authError && oauthError && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {getOAuthErrorMessage(oauthError)}
          </p>
        )}

        <p className="mt-4 text-xs text-slate-500">
          Your first sign-in automatically creates and binds your own account data, isolated from demo data.
        </p>
      </div>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-blue-100" />}>
      <SignInContent />
    </Suspense>
  );
}
