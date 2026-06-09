const fs = require('fs');
const os = require('os');
const path = require('path');
const dotenv = require('dotenv');

describe('dotenv precedence', () => {
  it('allows .env to override PM2 ecosystem defaults', () => {
    const previous = process.env.WHATSAPP_SERVICE_INSTANCE;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whatsapp-env-'));
    const envPath = path.join(dir, '.env');
    fs.writeFileSync(envPath, 'WHATSAPP_SERVICE_INSTANCE=ArteeMolduras\n');
    process.env.WHATSAPP_SERVICE_INSTANCE = 'loja';

    dotenv.config({ path: envPath, override: true });

    expect(process.env.WHATSAPP_SERVICE_INSTANCE).toBe('ArteeMolduras');

    if (previous === undefined) {
      delete process.env.WHATSAPP_SERVICE_INSTANCE;
    } else {
      process.env.WHATSAPP_SERVICE_INSTANCE = previous;
    }
  });
});
