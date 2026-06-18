import { describe, expect, it, vi } from 'vitest';
import { transmitirInutilizacaoNFe } from '../utils/nfeInutilizacao.js';

function createFakeWizard({ retorno, erro }) {
  const handlers = [];
  const eject = vi.fn();
  const originalAssinar = vi.fn((xml) => `<inutNFeAssinado>${xml}</inutNFeAssinado>`);
  const wizard = {
    nfeWizardService: {
      xmlBuilder: { assinarXML: originalAssinar },
      axios: {
        interceptors: {
          response: {
            use: vi.fn((success, failure) => {
              handlers.push({ success, failure });
              return 9;
            }),
            eject,
          },
        },
      },
    },
    NFE_Inutilizacao: vi.fn(async () => {
      wizard.nfeWizardService.xmlBuilder.assinarXML('<inutNFe />', 'infInut');
      const response = {
        data: '<soap><retInutNFe /></soap>',
        config: { data: '<soap><inutNFe /></soap>' },
      };
      if (erro) {
        await handlers[0].failure({ ...erro, response, config: response.config }).catch(() => {});
        throw erro;
      }
      await handlers[0].success(response);
      return retorno;
    }),
  };
  return { wizard, originalAssinar, eject };
}

describe('nfe inutilizacao adapter', () => {
  it('captura XML assinado, XML SOAP bruto e normaliza o retorno', async () => {
    const { wizard, originalAssinar, eject } = createFakeWizard({
      retorno: {
        cStat: '102',
        xMotivo: 'Inutilizacao homologada',
        nProt: '131260000000001',
        dhRecbto: '2026-06-18T12:00:00-03:00',
      },
    });

    const result = await transmitirInutilizacaoNFe(
      { cUF: 31, CNPJ: '07500718000196', ano: '26', mod: '55', serie: '1', nNFIni: '280', nNFFin: '280', xJust: 'Justificativa fiscal valida' },
      { criarWizard: async () => wizard }
    );

    expect(result).toMatchObject({
      cStat: '102',
      nProt: '131260000000001',
      xmlEnvio: '<inutNFeAssinado><inutNFe /></inutNFeAssinado>',
      xmlRetorno: '<soap><retInutNFe /></soap>',
    });
    expect(wizard.NFE_Inutilizacao).toHaveBeenCalledOnce();
    expect(wizard.nfeWizardService.xmlBuilder.assinarXML).toBe(originalAssinar);
    expect(eject).toHaveBeenCalledWith(9);
  });

  it('anexa os XMLs capturados ao erro para auditoria de rejeicao', async () => {
    const erro = new Error('NFE_Inutilizacao: Rejeicao: numero ja utilizado');
    const { wizard } = createFakeWizard({ erro });

    await expect(transmitirInutilizacaoNFe(
      { cUF: 31, CNPJ: '07500718000196', ano: '26', mod: '55', serie: '1', nNFIni: '280', nNFFin: '280', xJust: 'Justificativa fiscal valida' },
      { criarWizard: async () => wizard }
    )).rejects.toMatchObject({
      xmlEnvio: '<inutNFeAssinado><inutNFe /></inutNFeAssinado>',
      xmlRetorno: '<soap><retInutNFe /></soap>',
    });
  });

  it('transmite mesmo quando a instancia da lib nao expoe interceptors do axios', async () => {
    const originalAssinar = vi.fn((xml) => `<assinado>${xml}</assinado>`);
    const wizard = {
      nfeWizardService: {
        xmlBuilder: { assinarXML: originalAssinar },
        axios: {},
      },
      NFE_Inutilizacao: vi.fn(async () => {
        wizard.nfeWizardService.xmlBuilder.assinarXML('<inutNFe />', 'infInut');
        return {
          cStat: '102',
          xMotivo: 'Inutilizacao homologada',
          nProt: '131260000000002',
          xml: '<retInutNFe />',
        };
      }),
    };

    const result = await transmitirInutilizacaoNFe(
      { cUF: 31, CNPJ: '07500718000196', ano: '26', mod: '55', serie: '1', nNFIni: '280', nNFFin: '280', xJust: 'Justificativa fiscal valida' },
      { criarWizard: async () => wizard }
    );

    expect(wizard.NFE_Inutilizacao).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      cStat: '102',
      nProt: '131260000000002',
      xmlEnvio: '<assinado><inutNFe /></assinado>',
      xmlRetorno: '<retInutNFe />',
    });
    expect(wizard.nfeWizardService.xmlBuilder.assinarXML).toBe(originalAssinar);
  });

  it('classifica ausencia do metodo fiscal como falha local antes da transmissao', async () => {
    await expect(transmitirInutilizacaoNFe(
      { cUF: 31, CNPJ: '07500718000196', ano: '26', mod: '55', serie: '1', nNFIni: '280', nNFFin: '280', xJust: 'Justificativa fiscal valida' },
      { criarWizard: async () => ({ nfeWizardService: {} }) }
    )).rejects.toMatchObject({
      code: 'falha_local_pre_transmissao',
    });
  });
});
