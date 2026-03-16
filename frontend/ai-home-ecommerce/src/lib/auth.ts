import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { HttpsProxyAgent } from 'https-proxy-agent';

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const enableDevAuth = process.env.ENABLE_DEV_AUTH === 'true' || process.env.NODE_ENV !== 'production';
const oauthProxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY;

const oauthTimeoutMs = Number(process.env.OAUTH_HTTP_TIMEOUT_MS || 45000);
const oauthHttpOptions: { timeout: number; agent?: { https: HttpsProxyAgent<string> } } = {
  timeout: Number.isFinite(oauthTimeoutMs) && oauthTimeoutMs > 0 ? oauthTimeoutMs : 45000,
};

if (oauthProxyUrl) {
  oauthHttpOptions.agent = {
    https: new HttpsProxyAgent(oauthProxyUrl),
  };
}

function hasRealValue(value?: string): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return !trimmed.startsWith('replace_with_');
}

const googleOAuthEnabled = hasRealValue(googleClientId) && hasRealValue(googleClientSecret);

const providers: NextAuthOptions['providers'] = [];

if (enableDevAuth) {
  providers.push(
    CredentialsProvider({
      id: 'dev-login',
      name: 'Dev Login',
      credentials: {
        mode: { label: 'Mode', type: 'text' },
        email: { label: 'Email', type: 'email' },
      },
      async authorize(credentials) {
        const mode = String(credentials?.mode || 'guest').trim().toLowerCase();
        const rawEmail = String(credentials?.email || '').trim().toLowerCase();

        if (mode === 'email' && rawEmail.length > 0) {
          const safeEmail = rawEmail
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '');

          return {
            id: `dev_email_${safeEmail || 'user'}`,
            name: rawEmail,
            email: rawEmail,
          };
        }

        return {
          id: 'dev_guest',
          name: 'Guest User',
          email: 'guest@local.dev',
        };
      },
    })
  );
}

if (googleOAuthEnabled) {
  providers.push(
    {
      id: 'google',
      name: 'Google',
      type: 'oauth',
      clientId: googleClientId,
      clientSecret: googleClientSecret,
      issuer: 'https://accounts.google.com',
      authorization: {
        url: 'https://accounts.google.com/o/oauth2/v2/auth',
        params: {
          scope: 'openid email profile',
          prompt: 'select_account',
          access_type: 'offline',
          response_type: 'code',
        },
      },
      token: {
        url: 'https://oauth2.googleapis.com/token',
      },
      userinfo: {
        url: 'https://openidconnect.googleapis.com/v1/userinfo',
      },
      jwks_endpoint: 'https://www.googleapis.com/oauth2/v3/certs',
      idToken: true,
      checks: ['pkce', 'state'],
      // Extend outgoing OAuth requests timeout to reduce transient auth failures.
      httpOptions: oauthHttpOptions,
      profile(profile: { sub: string; name?: string; email?: string; picture?: string }) {
        return {
          id: profile.sub,
          name: profile.name,
          email: profile.email,
          image: profile.picture,
        };
      },
    } as never
  );
}

export const authOptions: NextAuthOptions = {
  providers,
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/auth/signin',
  },
  callbacks: {
    async jwt({ token, profile, account, user }) {
      if (user && 'id' in user && typeof user.id === 'string') {
        token.userId = user.id;
      }

      const providerSub = (profile as { sub?: string } | undefined)?.sub;
      if (providerSub) {
        token.userId = `google_${providerSub}`;
      }
      if (!token.userId && token.sub) {
        token.userId = `google_${token.sub}`;
      }
      if (!token.userId && token.email) {
        const safeEmail = String(token.email)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '');
        token.userId = `acct_${safeEmail || 'user'}`;
      }
      if (account?.id_token) {
        token.idToken = account.id_token;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.userId as string) || `google_${token.sub || 'guest'}`;
      }
      session.idToken = token.idToken as string | undefined;
      return session;
    },
  },
};
