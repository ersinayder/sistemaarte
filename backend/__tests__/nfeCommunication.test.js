import { describe, expect, it } from 'vitest';
import nfeUtils from '../utils/nfe.js';

describe('nfe communication errors', () => {
  it('identifica ECONNRESET da SEFAZ como falha temporaria de comunicacao', () => {
    const err = new Error('NFE_Autorizacao: read ECONNRESET');

    expect(nfeUtils.isSefazCommunicationError(err)).toBe(true);
    expect(nfeUtils.getSefazErrorInfo(err)).toMatchObject({
      cstat: 'comunicacao',
      tipo: 'comunicacao',
    });
  });

  it('nao trata erro fiscal de schema como falha de comunicacao', () => {
    const err = new Error('Rejeicao: CFOP invalido');

    expect(nfeUtils.isSefazCommunicationError(err)).toBe(false);
  });

  it('identifica HTTP 404 na autorizacao como erro de endpoint SOAP', () => {
    const err = new Error('NFE_Autorizacao: Request failed with status code 404');

    expect(nfeUtils.getSefazErrorInfo(err)).toMatchObject({
      cstat: 'http_404',
      tipo: 'endpoint',
    });
  });

  it('adiciona SOAPAction e action no content-type para autorizacao MG', () => {
    const headers = nfeUtils.normalizeSefazRequestHeaders(
      { 'Content-Type': 'application/soap+xml' },
      'https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeAutorizacao4'
    );

    expect(headers.SOAPAction).toBe('http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4/nfeAutorizacaoLote');
    expect(headers['Content-Type']).toContain('action="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4/nfeAutorizacaoLote"');
  });
});
