import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

describe('nfewizard-io package contract', () => {
  it('loads with schema validation support used for homologation checks', () => {
    const nfewizard = require('nfewizard-io');
    const NFeWizard = nfewizard.NFeWizard || nfewizard.default?.NFeWizard || nfewizard.default;

    expect(typeof NFeWizard).toBe('function');

    const wizard = new NFeWizard();
    expect(typeof wizard.NFE_Autorizacao).toBe('function');
    expect(typeof wizard.NFE_SchemaValidate).toBe('function');
    expect(typeof require('@nfewizard/shared').NFE_SchemaValidate).toBe('function');
  });
});
