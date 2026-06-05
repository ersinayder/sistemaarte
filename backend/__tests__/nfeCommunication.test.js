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

  it('traduz NCM inexistente com item apontado pela SEFAZ', () => {
    const info = nfeUtils.formatarRejeicaoSefaz({
      cStat: '778',
      xMotivo: 'Rejeicao: Informado NCM inexistente [nItem:1]',
    });

    expect(info.cstat).toBe('778');
    expect(info.campo).toBe('NCM');
    expect(info.item).toBe('1');
    expect(info.mensagem).toContain('NCM do item 1 invalido ou inexistente');
    expect(info.mensagem).toContain('corrija o NCM no item da emissao');
    expect(info.motivoOriginal).toContain('Informado NCM inexistente');
  });

  it('traduz rejeicoes fiscais frequentes por codigo e palavra-chave', () => {
    expect(nfeUtils.formatarRejeicaoSefaz({
      cStat: '386',
      xMotivo: 'Rejeicao: CFOP nao permitido para o CSOSN informado [nItem:2]',
    })).toMatchObject({
      campo: 'CFOP/CSOSN',
      item: '2',
    });

    expect(nfeUtils.formatarRejeicaoSefaz({
      cStat: '999',
      xMotivo: 'Rejeicao: CPF do destinatario invalido',
    })).toMatchObject({
      campo: 'CPF/CNPJ do cliente',
      origem: 'palavra-chave',
    });
  });
});
