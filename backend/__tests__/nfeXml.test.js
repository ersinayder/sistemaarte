import { describe, expect, it } from 'vitest';
import nfeXml from '../utils/nfeXml.js';

const { extrairXmlFiscal, serializarXmlFiscal, filenameSeguro } = nfeXml;

describe('nfeXml helpers', () => {
  it('extracts raw XML strings', () => {
    expect(extrairXmlFiscal('  <nfeProc>ok</nfeProc>  ')).toBe('<nfeProc>ok</nfeProc>');
  });

  it('extracts XML from JSON strings and common fiscal wrappers', () => {
    const source = JSON.stringify({
      resposta: {
        xmlProc: '<nfeProc><protNFe /></nfeProc>',
      },
    });

    expect(extrairXmlFiscal(source)).toBe('<nfeProc><protNFe /></nfeProc>');
  });

  it('extracts XML from arrays and nfewizard response fields', () => {
    const source = [
      { ignored: true },
      { procNFe: '<nfeProc><NFe /></nfeProc>' },
    ];

    expect(extrairXmlFiscal(source)).toBe('<nfeProc><NFe /></nfeProc>');
  });

  it('returns null for non-XML values instead of storing JSON as fiscal XML', () => {
    expect(extrairXmlFiscal('plain text')).toBeNull();
    expect(extrairXmlFiscal({ semXml: 'valor' })).toBeNull();
    expect(extrairXmlFiscal(null)).toBeNull();
    expect(serializarXmlFiscal({ cStat: '100' })).toBeNull();
  });

  it('sanitizes fiscal filenames without losing useful identifiers', () => {
    expect(filenameSeguro('NF-e 29/1 chave: 3126')).toBe('NF-e_29_1_chave__3126');
    expect(filenameSeguro('')).toBe('nfe');
  });
});
