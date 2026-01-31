export type GoogleUserInfo = {
  email: string | null;
  sub: string | null;
};

const withTimeout = async (ms: number, controller: AbortController) => {
  const t = setTimeout(() => controller.abort(), ms);
  return () => clearTimeout(t);
};

export const fetchGoogleUserInfo = async (accessToken: string): Promise<GoogleUserInfo> => {
  if (!accessToken) return { email: null, sub: null };

  const controller = new AbortController();
  const clear = await withTimeout(10000, controller);

  try {
    const resp = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      method: 'GET',
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      signal: controller.signal,
    });

    if (!resp.ok) {
      return { email: null, sub: null };
    }

    const raw = await resp.text();
    const data = raw ? JSON.parse(raw) : {};
    const email = typeof data?.email === 'string' ? data.email : null;
    const sub = typeof data?.sub === 'string' ? data.sub : null;
    return { email, sub };
  } catch {
    return { email: null, sub: null };
  } finally {
    clear();
  }
};

export const getGoogleEmailStorageKey = (userId: string) => `gretel:googleEmail:${userId}`;

