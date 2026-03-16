import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    idToken?: string;
    user: DefaultSession['user'] & {
      id: string;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string;
    idToken?: string;
  }
}
