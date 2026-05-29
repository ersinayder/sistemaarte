import { describe, expect, it } from 'vitest';
import fs from 'fs';

function readWorkflow(name) {
  return fs.readFileSync(new URL(`../../.github/workflows/${name}`, import.meta.url), 'utf8');
}

describe('GitHub workflow security contracts', () => {
  it('does not keep manual debug workflows that print logs or .env contents', () => {
    expect(fs.existsSync(new URL('../../.github/workflows/debug.yml', import.meta.url))).toBe(false);
  });

  it('runs pull request CI away from the production self-hosted runner and uses locked installs', () => {
    const source = readWorkflow('ci.yml');

    expect(source).toMatch(/permissions:\s*\n\s*contents:\s*read/);
    expect(source).toMatch(/pull_request:/);
    expect(source).toMatch(/runs-on:\s*ubuntu-latest/);
    expect(source).toMatch(/npm ci/);
    expect(source).not.toMatch(/runs-on:\s*self-hosted/);
    expect(source).not.toMatch(/npm install/);
  });

  it('keeps deploy from mirroring secrets and uses reproducible installs', () => {
    const source = readWorkflow('deploy.yml');

    expect(source).toMatch(/permissions:\s*\n\s*contents:\s*read/);
    expect(source).toMatch(/PM2-DeployRestart/);
    expect(source).toMatch(/Get-ScheduledTask/);
    expect(source).toMatch(/\/XD node_modules data certs/);
    expect(source).toMatch(/npm ci/);
    expect(source).toMatch(/npm audit --omit=dev/);
    expect(source).not.toMatch(/npm install/);
  });

  it('does not keep privileged one-shot PM2 setup workflows enabled', () => {
    expect(fs.existsSync(new URL('../../.github/workflows/setup-pm2-service.yml', import.meta.url))).toBe(false);
  });

  it('keeps manual deploy aligned with the production PM2 ecosystem app', () => {
    const source = fs.readFileSync(new URL('../../deploy.sh', import.meta.url), 'utf8');

    expect(source).toContain('sistemaarte-backend');
    expect(source).toContain('ecosystem.config.js');
    expect(source).toContain('--env production');
    expect(source).not.toMatch(/--name sistemaarte\b/);
  });
});
