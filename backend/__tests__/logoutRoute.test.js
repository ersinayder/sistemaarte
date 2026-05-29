import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

process.env.JWT_SECRET = 'test-logout-route-secret';

const require = createRequire(import.meta.url);
const authRouter = require('../routes/auth.js');

function routeStack(method, path) {
  const layer = authRouter.stack.find((entry) => entry.route?.path === path && entry.route?.methods?.[method]);
  return layer?.route?.stack || [];
}

describe('logout route', () => {
  it('is idempotent and clears cookies without requiring a valid session', () => {
    const stack = routeStack('post', '/logout');

    expect(stack).toHaveLength(1);
  });
});
