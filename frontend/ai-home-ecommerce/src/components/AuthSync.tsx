'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { buildUserIdFromGoogle, setAuthIdentity } from '@/lib/user-identity';

export function AuthSync() {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status !== 'authenticated' || !session?.user) {
      setAuthIdentity(null);
      return;
    }

    setAuthIdentity({
      userId: buildUserIdFromGoogle({ id: session.user.id, email: session.user.email }),
      email: session.user.email || undefined,
      name: session.user.name || undefined,
      image: session.user.image || undefined,
      idToken: session.idToken,
    });
  }, [session, status]);

  return null;
}
