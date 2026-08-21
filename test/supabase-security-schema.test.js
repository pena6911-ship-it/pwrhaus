import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync(new URL('../supabase/migrations/0011_security_hardening.sql', import.meta.url), 'utf8');

test('security hardening fixes the mutable search path on the order sequence function', () => {
  assert.match(sql, /create\s+or\s+replace\s+function\s+public\.next_event_order_seq\(\)[\s\S]*set\s+search_path\s*=\s*''/i);
  assert.match(sql, /nextval\(\s*'public\.event_order_seq'\s*\)/i);
});
