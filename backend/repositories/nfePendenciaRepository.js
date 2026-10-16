'use strict';

const STATUS_ATIVOS = ['processando', 'incerto'];

function normalizarId(id) {
  const parsed = Number(id);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function listarPendenciasFiscais(db) {
  return db.prepare(`
    SELECT *
    FROM (
      SELECT
        t.id AS id,
        'emissao' AS origem,
        'emissao' AS tipo,
        t.status AS status,
        t.ordemid AS ordemid,
        o.numero AS numero_os,
        COALESCE(c.name, o.clientenome) AS cliente,
        t.chave AS chave,
        t.numero AS numero_nfe,
        t.serie AS serie,
        NULL AS nseqevento,
        t.cstat AS cstat,
        t.motivo AS motivo,
        t.createdat AS createdat,
        t.updatedat AS updatedat
      FROM nfe_emissao_tentativas t
      LEFT JOIN ordens o ON o.id = t.ordemid
      LEFT JOIN clientes c ON c.id = o.clienteid
      WHERE t.status IN (?, ?)
        AND o.deletedat IS NULL

      UNION ALL

      SELECT
        t.id AS id,
        'evento' AS origem,
        t.tipo AS tipo,
        t.status AS status,
        t.ordemid AS ordemid,
        o.numero AS numero_os,
        COALESCE(c.name, o.clientenome) AS cliente,
        t.chave AS chave,
        NULL AS numero_nfe,
        NULL AS serie,
        t.nseqevento AS nseqevento,
        t.cstat AS cstat,
        t.motivo AS motivo,
        t.createdat AS createdat,
        t.updatedat AS updatedat
      FROM nfe_evento_tentativas t
      LEFT JOIN ordens o ON o.id = t.ordemid
      LEFT JOIN clientes c ON c.id = o.clienteid
      WHERE t.status IN (?, ?)
        AND o.deletedat IS NULL
    )
    ORDER BY updatedat DESC, id DESC
    LIMIT 50
  `).all(...STATUS_ATIVOS, ...STATUS_ATIVOS);
}

function buscarPendenciaEmissao(db, id) {
  let pendencia = db.prepare(`
    SELECT
      t.id AS id,
      'emissao' AS origem,
      'emissao' AS tipo,
      t.status AS status,
      t.ordemid AS ordemid,
      o.numero AS numero_os,
      COALESCE(c.name, o.clientenome) AS cliente,
      t.chave AS chave,
      t.numero AS numero_nfe,
      t.serie AS serie,
      NULL AS nseqevento,
      t.cstat AS cstat,
      t.motivo AS motivo,
      t.createdat AS createdat,
      t.updatedat AS updatedat
    FROM nfe_emissao_tentativas t
    LEFT JOIN ordens o ON o.id = t.ordemid
    LEFT JOIN clientes c ON c.id = o.clienteid
    WHERE t.id = ?
      AND t.status IN (?, ?)
      AND o.deletedat IS NULL
  `).get(id, ...STATUS_ATIVOS);

  if (!pendencia && hasTable(db, 'nfe_notas')) {
    const nota = db.prepare('SELECT ordemid FROM nfe_notas WHERE id = ?').get(id);
    const ordemIdBusca = nota?.ordemid || id;
    pendencia = db.prepare(`
      SELECT
        t.id AS id,
        'emissao' AS origem,
        'emissao' AS tipo,
        t.status AS status,
        t.ordemid AS ordemid,
        o.numero AS numero_os,
        COALESCE(c.name, o.clientenome) AS cliente,
        t.chave AS chave,
        t.numero AS numero_nfe,
        t.serie AS serie,
        NULL AS nseqevento,
        t.cstat AS cstat,
        t.motivo AS motivo,
        t.createdat AS createdat,
        t.updatedat AS updatedat
      FROM nfe_emissao_tentativas t
      LEFT JOIN ordens o ON o.id = t.ordemid
      LEFT JOIN clientes c ON c.id = o.clienteid
      WHERE t.ordemid = ?
        AND t.status IN (?, ?)
        AND o.deletedat IS NULL
      ORDER BY t.id DESC
      LIMIT 1
    `).get(ordemIdBusca, ...STATUS_ATIVOS);
  }

  if (!pendencia) return null;
  const transicoes = db.prepare(`
    SELECT id, status, estado_anterior, estado_novo, cstat, motivo, createdat
    FROM nfe_emissao_transicoes
    WHERE tentativaid = ?
    ORDER BY id ASC
  `).all(pendencia.id);

  return { pendencia, transicoes };
}

function buscarPendenciaEvento(db, id) {
  let pendencia = db.prepare(`
    SELECT
      t.id AS id,
      'evento' AS origem,
      t.tipo AS tipo,
      t.status AS status,
      t.ordemid AS ordemid,
      o.numero AS numero_os,
      COALESCE(c.name, o.clientenome) AS cliente,
      t.chave AS chave,
      NULL AS numero_nfe,
      NULL AS serie,
      t.nseqevento AS nseqevento,
      t.cstat AS cstat,
      t.motivo AS motivo,
      t.createdat AS createdat,
      t.updatedat AS updatedat
    FROM nfe_evento_tentativas t
    LEFT JOIN ordens o ON o.id = t.ordemid
    LEFT JOIN clientes c ON c.id = o.clienteid
    WHERE t.id = ?
      AND t.status IN (?, ?)
      AND o.deletedat IS NULL
  `).get(id, ...STATUS_ATIVOS);

  if (!pendencia && hasTable(db, 'nfe_notas')) {
    const nota = db.prepare('SELECT ordemid, chave FROM nfe_notas WHERE id = ?').get(id);
    const ordemIdBusca = nota?.ordemid || id;
    pendencia = db.prepare(`
      SELECT
        t.id AS id,
        'evento' AS origem,
        t.tipo AS tipo,
        t.status AS status,
        t.ordemid AS ordemid,
        o.numero AS numero_os,
        COALESCE(c.name, o.clientenome) AS cliente,
        t.chave AS chave,
        NULL AS numero_nfe,
        NULL AS serie,
        t.nseqevento AS nseqevento,
        t.cstat AS cstat,
        t.motivo AS motivo,
        t.createdat AS createdat,
        t.updatedat AS updatedat
      FROM nfe_evento_tentativas t
      LEFT JOIN ordens o ON o.id = t.ordemid
      LEFT JOIN clientes c ON c.id = o.clienteid
      WHERE (t.ordemid = ? OR (t.chave = ? AND ? IS NOT NULL))
        AND t.status IN (?, ?)
        AND o.deletedat IS NULL
      ORDER BY t.id DESC
      LIMIT 1
    `).get(ordemIdBusca, nota?.chave || null, nota?.chave || null, ...STATUS_ATIVOS);
  }

  if (!pendencia) return null;
  const transicoes = db.prepare(`
    SELECT id, status, estado_anterior, estado_novo, cstat, motivo, createdat
    FROM nfe_evento_transicoes
    WHERE tentativaid = ?
    ORDER BY id ASC
  `).all(pendencia.id);

  return { pendencia, transicoes };
}

function buscarPendenciaFiscalComTransicoes(db, input = {}) {
  const origem = String(input.origem || '').trim();
  const id = normalizarId(input.id);
  if (!id) return null;
  if (origem === 'emissao') return buscarPendenciaEmissao(db, id);
  if (origem === 'evento') return buscarPendenciaEvento(db, id);
  return null;
}

function hasTable(db, table) {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table));
}

function liberarPendenciaFiscal(db, input = {}) {
  const origem = String(input.origem || '').trim();
  const id = normalizarId(input.id);
  const motivoInformado = String(input.motivo || '').trim();
  const usuarioId = input.usuarioId || null;

  if (!id || !['emissao', 'evento'].includes(origem)) {
    return { ok: false, status: 400, erro: 'Identificador ou origem de pendencia fiscal invalida.' };
  }

  const agora = new Date().toISOString();
  const motivoFinal = motivoInformado || 'Liberacao manual de pendencia fiscal apos auditoria do operador.';

  if (origem === 'emissao') {
    if (!hasTable(db, 'nfe_emissao_tentativas')) {
      return { ok: false, status: 404, erro: 'Tabela de tentativas de emissao nao encontrada.' };
    }

    let tentativa = db.prepare('SELECT * FROM nfe_emissao_tentativas WHERE id = ?').get(id);
    if (!tentativa && hasTable(db, 'nfe_notas')) {
      const nota = db.prepare('SELECT ordemid FROM nfe_notas WHERE id = ?').get(id);
      const ordemIdBusca = nota?.ordemid || id;
      tentativa = db.prepare(`
        SELECT * FROM nfe_emissao_tentativas
        WHERE ordemid = ? AND status IN ('incerto', 'processando')
        ORDER BY id DESC LIMIT 1
      `).get(ordemIdBusca);
    }
    if (!tentativa) {
      return { ok: false, status: 404, erro: 'Tentativa fiscal de emissao nao encontrada.' };
    }

    if (!['incerto', 'processando'].includes(tentativa.status)) {
      return {
        ok: false,
        status: 409,
        erro: `Esta tentativa ja foi concluida com status "${tentativa.status}" e nao esta pendente.`,
      };
    }

    const tentativaId = tentativa.id;
    const cstatFinal = tentativa.cstat || (motivoInformado.toLowerCase().includes('isento') ? '805' : 'rejeicao');
    const motivoTrans = tentativa.motivo
      ? `${tentativa.motivo} | Liberacao operacional: ${motivoFinal}`
      : motivoFinal;

    const run = db.transaction(() => {
      // 1. Atualiza tentativa
      db.prepare(`
        UPDATE nfe_emissao_tentativas
        SET status = 'rejeitado',
            motivo = ?,
            cstat = COALESCE(cstat, ?),
            updatedat = ?,
            concluido_em = COALESCE(concluido_em, ?)
        WHERE id = ?
      `).run(motivoTrans, cstatFinal, agora, agora, tentativaId);

      // 2. Registra transição de auditoria
      if (hasTable(db, 'nfe_emissao_transicoes')) {
        db.prepare(`
          INSERT INTO nfe_emissao_transicoes
            (tentativaid, ordemid, status, estado_anterior, estado_novo, cstat, motivo, createdat)
          VALUES (?, ?, 'rejeitado', ?, 'rejeitado', ?, ?, ?)
        `).run(tentativaId, tentativa.ordemid, tentativa.status, cstatFinal, motivoFinal, agora);
      }

      // 3. Atualiza nfe_notas vinculada à OS para liberá-la
      if (hasTable(db, 'nfe_notas')) {
        const numeroFormatado = tentativa.numero ? String(tentativa.numero).padStart(9, '0') : null;
        const numeroStr = tentativa.numero ? String(tentativa.numero) : null;
        db.prepare(`
          UPDATE nfe_notas
          SET status = 'rejeitado',
              rejeicao_cstat = COALESCE(rejeicao_cstat, ?),
              rejeicao_motivo = ?,
              updatedat = datetime('now','localtime')
          WHERE (origem = 'ordem' AND ordemid = ? AND status IN ('incerto', 'emitindo'))
             OR (? IS NOT NULL AND numero IN (?, ?) AND serie = ? AND status IN ('incerto', 'emitindo'))
        `).run(
          cstatFinal,
          motivoFinal,
          tentativa.ordemid,
          numeroStr,
          numeroStr,
          numeroFormatado,
          String(tentativa.serie || '1')
        );
      }

      // 4. Atualiza a ordem vinculada para status rejeitado, liberando o bloqueio de emissão
      if (hasTable(db, 'ordens') && tentativa.ordemid) {
        db.prepare(`
          UPDATE ordens
          SET nfe_status = 'rejeitado'
          WHERE id = ? AND deletedat IS NULL
        `).run(tentativa.ordemid);
      }

      // 5. Registra evento operacional
      if (hasTable(db, 'nfe_eventos') && tentativa.ordemid) {
        try {
          let nfeId = null;
          if (hasTable(db, 'nfe_notas')) {
            const nota = db.prepare('SELECT id FROM nfe_notas WHERE ordemid = ? ORDER BY id DESC LIMIT 1').get(tentativa.ordemid);
            nfeId = nota?.id || null;
          }
          const chaveEvento = String(tentativa.chave || '').trim() || `OS-${tentativa.ordemid}`;
          db.prepare(`
            INSERT INTO nfe_eventos
              (nfeid, ordemid, chave, tipo, nseqevento, cstat, motivo, texto, createdat)
            VALUES (?, ?, ?, 'rejeicao', 1, ?, ?, ?, ?)
          `).run(
            nfeId,
            tentativa.ordemid,
            chaveEvento,
            cstatFinal,
            motivoFinal,
            `Liberacao operacional de pendencia fiscal: ${motivoFinal}`,
            agora
          );
        } catch (evErr) {
          console.warn('[NF-e] Falha ao registrar evento operacional em nfe_eventos:', evErr.message);
        }
      }

      return db.prepare('SELECT * FROM nfe_emissao_tentativas WHERE id = ?').get(tentativaId);
    });

    const tentativaAtualizada = run();
    return {
      ok: true,
      status: 200,
      origem: 'emissao',
      tentativa: tentativaAtualizada,
      mensagem: 'Pendencia fiscal de emissao liberada com sucesso. A OS esta desbloqueada para nova emissao.',
    };
  }

  if (origem === 'evento') {
    if (!hasTable(db, 'nfe_evento_tentativas')) {
      return { ok: false, status: 404, erro: 'Tabela de tentativas de evento nao encontrada.' };
    }

    let tentativa = db.prepare('SELECT * FROM nfe_evento_tentativas WHERE id = ?').get(id);
    if (!tentativa && hasTable(db, 'nfe_notas')) {
      const nota = db.prepare('SELECT ordemid, chave FROM nfe_notas WHERE id = ?').get(id);
      const ordemIdBusca = nota?.ordemid || id;
      tentativa = db.prepare(`
        SELECT * FROM nfe_evento_tentativas
        WHERE (ordemid = ? OR (chave = ? AND ? IS NOT NULL))
          AND status IN ('incerto', 'processando')
        ORDER BY id DESC LIMIT 1
      `).get(ordemIdBusca, nota?.chave || null, nota?.chave || null);
    }
    if (!tentativa) {
      return { ok: false, status: 404, erro: 'Tentativa fiscal de evento nao encontrada.' };
    }

    if (!['incerto', 'processando'].includes(tentativa.status)) {
      return {
        ok: false,
        status: 409,
        erro: `Esta tentativa de evento ja foi concluida com status "${tentativa.status}" e nao esta pendente.`,
      };
    }

    const tentativaId = tentativa.id;
    const run = db.transaction(() => {
      db.prepare(`
        UPDATE nfe_evento_tentativas
        SET status = 'rejeitado',
            motivo = ?,
            updatedat = ?,
            concluido_em = COALESCE(concluido_em, ?)
        WHERE id = ?
      `).run(motivoFinal, agora, agora, tentativaId);

      if (hasTable(db, 'nfe_evento_transicoes')) {
        db.prepare(`
          INSERT INTO nfe_evento_transicoes
            (tentativaid, ordemid, chave, tipo, nseqevento, status, estado_anterior, estado_novo, cstat, motivo, createdat)
          VALUES (?, ?, ?, ?, ?, 'rejeitado', ?, 'rejeitado', ?, ?, ?)
        `).run(
          tentativaId,
          tentativa.ordemid,
          tentativa.chave,
          tentativa.tipo,
          tentativa.nseqevento,
          tentativa.status,
          tentativa.cstat || 'rejeicao',
          motivoFinal,
          agora
        );
      }

      return db.prepare('SELECT * FROM nfe_evento_tentativas WHERE id = ?').get(tentativaId);
    });

    const tentativaAtualizada = run();
    return {
      ok: true,
      status: 200,
      origem: 'evento',
      tentativa: tentativaAtualizada,
      mensagem: 'Pendencia fiscal de evento liberada com sucesso.',
    };
  }

  return { ok: false, status: 400, erro: 'Origem de pendencia fiscal nao suportada.' };
}

module.exports = {
  buscarPendenciaFiscalComTransicoes,
  liberarPendenciaFiscal,
  listarPendenciasFiscais,
};
