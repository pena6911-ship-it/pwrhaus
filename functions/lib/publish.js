import { json } from './http.js';

export function makePublishHandler({ verifySession, isAdmin, triggerBuild }) {
  return async (req) => {
    const auth = req.headers.get('authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (!token) return json({ error: 'unauthorized' }, 401);

    const user = await verifySession(token).catch(() => null);
    if (!user || !isAdmin(user)) return json({ error: 'unauthorized' }, 401);

    await triggerBuild();
    return json({ status: 'building' }, 202);
  };
}
