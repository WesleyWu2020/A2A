export interface AuthIdentity {
  userId: string;
  email?: string;
  name?: string;
  image?: string;
  idToken?: string;
}

let currentIdentity: AuthIdentity | null = null;

export function setAuthIdentity(identity: AuthIdentity | null): void {
  currentIdentity = identity;
}

export function getAuthIdentity(): AuthIdentity | null {
  return currentIdentity;
}

export function getCurrentUserId(): string {
  return currentIdentity?.userId || 'guest_user';
}

export function getAuthHeaders(): HeadersInit {
  if (!currentIdentity) {
    return {};
  }

  const headers: Record<string, string> = {
    'X-User-Id': currentIdentity.userId,
  };

  if (currentIdentity.email) {
    headers['X-User-Email'] = currentIdentity.email;
  }
  if (currentIdentity.name) {
    headers['X-User-Name'] = currentIdentity.name;
  }
  if (currentIdentity.idToken) {
    headers.Authorization = `Bearer ${currentIdentity.idToken}`;
  }

  return headers;
}

export function buildUserIdFromGoogle(sessionUser: {
  id?: string | null;
  email?: string | null;
}): string {
  if (sessionUser.id && sessionUser.id.trim().length > 0) {
    return sessionUser.id;
  }

  const safeEmail = (sessionUser.email || 'guest')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return `google_${safeEmail || 'guest'}`;
}
