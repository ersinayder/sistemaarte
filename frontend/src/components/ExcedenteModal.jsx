import React from 'react';
import ReactDOM from 'react-dom';

const fmt = (v) =>
  'R$ ' +
  Number(v || 0)
    .toFixed(2)
    .replace('.', ',')
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');

export default function ExcedenteModal({ isOpen, excedente, onResolve, onClose, isSubmitting }) {
  if (!isOpen) return null;

  const content = (
    <div
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose && onClose()}
      style={{ zIndex: 9999 }}
    >
      <div className="modal modal-sm">
        <div className="modal-header">
          <span className="modal-title" style={{ color: 'var(--color-primary)' }}>
            Resolução de Excedente
          </span>
          {onClose && (
            <button className="btn btn-icon btn-ghost" onClick={onClose} disabled={isSubmitting}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <div className="modal-body modal-body-dense" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)', margin: 0 }}>
            Esta OS possui pagamentos já registrados que superam o novo valor total ou a ação solicitada.
          </p>
          <div
            style={{
              padding: 'var(--space-3)',
              background: 'var(--color-warning-hl)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid color-mix(in oklab, var(--color-warning) 30%, transparent)',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
              Valor Excedente
            </div>
            <div className="tabnum" style={{ fontSize: 'var(--text-xl)', fontWeight: 800, color: 'var(--color-warning)', marginTop: 4 }}>
              {fmt(excedente)}
            </div>
          </div>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', margin: 0 }}>
            Escolha como deseja destinar o excedente pago pelo cliente:
          </p>
        </div>
        <div className="modal-footer" style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {onClose && (
            <button className="btn btn-ghost" onClick={onClose} disabled={isSubmitting}>
              Cancelar
            </button>
          )}
          <button
            className="btn btn-secondary"
            onClick={() => onResolve('devolver')}
            disabled={isSubmitting}
            title="Devolver o valor em dinheiro ao cliente"
          >
            Devolver Valor
          </button>
          <button
            className="btn btn-primary"
            onClick={() => onResolve('credito')}
            disabled={isSubmitting}
            title="Transformar em Crédito Loja para o cliente usar em novos pedidos"
          >
            Gerar Crédito Loja
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? ReactDOM.createPortal(content, document.body) : content;
}
