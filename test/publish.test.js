import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePublishHandler } from '../functions/lib/publish.js';

const reqWith = (auth) => new Request('https://x/api/publish', {
  method: 'POST', headers: auth ? { Authorization: auth } : {},
});

test('rejects a request with no bearer token and does not build', async () => {
  let built = 0;
  const handler = makePublishHandler({ verifySession: async () => null, triggerBuild: async () => { built++; } });
  const res = await handler(reqWith(null));
  assert.equal(res.status, 401);
  assert.equal(built, 0);
});

test('rejects an invalid session and does not build', async () => {
  let built = 0;
  const handler = makePublishHandler({ verifySession: async () => null, triggerBuild: async () => { built++; } });
  const res = await handler(reqWith('Bearer bad'));
  assert.equal(res.status, 401);
  assert.equal(built, 0);
});

test('triggers the build exactly once for a valid session', async () => {
  let built = 0; let sawToken = null;
  const handler = makePublishHandler({
    verifySession: async (t) => { sawToken = t; return { id: 'michelle' }; },
    triggerBuild: async () => { built++; },
  });
  const res = await handler(reqWith('Bearer good-jwt'));
  assert.equal(res.status, 202);
  assert.equal(built, 1);
  assert.equal(sawToken, 'good-jwt');
  const body = await res.text();
  assert.doesNotMatch(body, /http/, 'response must not leak the build-hook URL');
});
