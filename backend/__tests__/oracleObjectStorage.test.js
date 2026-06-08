import crypto from 'crypto';
import { describe, expect, it } from 'vitest';

const {
  buildObjectUrl,
  buildOracleS3Config,
  putObject,
  sanitizeOracleError,
} = await import('../utils/oracleObjectStorage.js');

describe('oracleObjectStorage', () => {
  it('builds Oracle S3-compatible config without exposing the secret key in JSON', () => {
    const config = buildOracleS3Config({
      namespace: 'minhanamespace',
      region: 'sa-saopaulo-1',
      bucket: 'sistemaarte-backups',
      accessKey: 'ACCESS_TESTE',
      secretKey: 'secret-teste-nao-vazar',
    });

    expect(config.host).toBe('minhanamespace.compat.objectstorage.sa-saopaulo-1.oraclecloud.com');
    expect(config.bucket).toBe('sistemaarte-backups');
    expect(config.accessKey).toBe('ACCESS_TESTE');
    expect(JSON.stringify(config)).not.toContain('secret-teste-nao-vazar');
    expect(JSON.stringify(config).toLowerCase()).not.toContain('secret');
  });

  it('builds a path-style object URL with a safely encoded key by segment', () => {
    const url = buildObjectUrl({
      host: 'host',
      bucket: 'bucket',
      key: 'daily/sistemaarte 2026.zip.enc',
    });

    expect(url).toBe('https://host/bucket/daily/sistemaarte%202026.zip.enc');
  });

  it('uploads an object with AWS Signature V4 headers and returns safe metadata', async () => {
    const body = Buffer.from('backup criptografado');
    const expectedHash = crypto.createHash('sha256').update(body).digest('hex');
    let requestOptions;
    let requestBody;

    const request = (options, payload) => {
      requestOptions = options;
      requestBody = payload;
      return Promise.resolve({
        statusCode: 200,
        headers: {
          ETag: '"etag-teste"',
        },
        body: '',
      });
    };

    const result = await putObject({
      config: buildOracleS3Config({
        namespace: 'minhanamespace',
        region: 'sa-saopaulo-1',
        bucket: 'sistemaarte-backups',
        accessKey: 'ACCESS_TESTE',
        secretKey: 'secret-teste-nao-vazar',
      }),
      key: 'daily/sistemaarte 2026.zip.enc',
      body,
      contentType: 'application/octet-stream',
      request,
      now: new Date('2026-06-08T12:34:56Z'),
    });

    expect(requestOptions.method).toBe('PUT');
    expect(requestOptions.path).toBe('/sistemaarte-backups/daily/sistemaarte%202026.zip.enc');
    expect(requestOptions.headers.Authorization).toContain('AWS4-HMAC-SHA256');
    expect(requestOptions.headers.Authorization).toContain(
      'Credential=ACCESS_TESTE/20260608/sa-saopaulo-1/s3/aws4_request'
    );
    expect(requestOptions.headers.Authorization).toContain(
      'SignedHeaders=content-length;content-type;host;x-amz-content-sha256;x-amz-date'
    );
    expect(requestOptions.headers.Authorization).toContain(
      'Signature=1e31970f55d4149717bd3eb6f8a464e9b4aaa08a6aaac4a65ff0c61c5e221adc'
    );
    expect(requestOptions.headers['x-amz-content-sha256']).toBe(expectedHash);
    expect(requestBody).toBe(body);
    expect(result).toEqual({
      ok: true,
      etag: '"etag-teste"',
      bucket: 'sistemaarte-backups',
      key: 'daily/sistemaarte 2026.zip.enc',
      url: 'https://minhanamespace.compat.objectstorage.sa-saopaulo-1.oraclecloud.com/sistemaarte-backups/daily/sistemaarte%202026.zip.enc',
    });
    expect(JSON.stringify(result)).not.toContain('secret-teste-nao-vazar');
  });

  it('sanitizes transport errors raised by the injected request function', async () => {
    let message = '';
    try {
      await putObject({
        config: buildOracleS3Config({
          namespace: 'minhanamespace',
          region: 'sa-saopaulo-1',
          bucket: 'sistemaarte-backups',
          accessKey: 'ACCESS_TESTE',
          secretKey: 'secret-teste-nao-vazar',
        }),
        key: 'daily/sistemaarte 2026.zip.enc',
        body: Buffer.from('backup criptografado'),
        request: () => Promise.reject(
          new Error('Falha com ORACLE_OBJECT_STORAGE_SECRET_KEY=abc123 em C:\\sistemaarte\\.env')
        ),
        now: new Date('2026-06-08T12:34:56Z'),
      });
    } catch (err) {
      message = err.message;
    }

    expect(message).toContain('[segredo ocultado]');
    expect(message).not.toMatch(/abc123|C:\\sistemaarte|SECRET_KEY/);
  });

  it('sanitizes Oracle errors without leaking secrets or filesystem paths', () => {
    const clean = sanitizeOracleError(new Error('403 secret C:\\sistemaarte\\.env'));

    expect(clean).not.toContain('secret');
    expect(clean).not.toContain('C:\\sistemaarte');
  });

  it('sanitizes Oracle credential assignment formats', () => {
    const clean = sanitizeOracleError(
      new Error('ORACLE_OBJECT_STORAGE_SECRET_KEY=abc123 token: "qwerty"')
    );

    expect(clean).not.toContain('abc123');
    expect(clean).not.toContain('qwerty');
    expect(clean).not.toContain('SECRET_KEY');
  });
});
