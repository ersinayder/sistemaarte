import React, { useState } from 'react';
import ReactDOM from 'react-dom';

const fmt = (v) =>
  'R$ ' +
  Number(v || 0)
    .toFixed(2)
    .replace('.', ',')
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');

export default function UsarCreditoModal({
  isOpen,
  clienteNome,
  saldoCredito,
  saldoOS,
  onConfirm,
  onClose,
  isSubmitting,
}) {
  const maxUtilizavel = Math.min(Number(saldoCredito || 0), Number(saldoOS || 0));
  const [valor, setValor] = useState(maxUtilizavel > 0 ? maxUtilizavel.toFixed(2) : '');
  const [erro, setErro] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e?.preventDefault();
    const v = Number(String(valor).replace(',', '.'));
    if (!v || v <= 0) {
      setErro('Informe um valor maior que zero.');
      return;
    }
    if (v > Number(saldoCredito || 0) + 0.001) {
      setErro(`Valor excede o crédito disponível (${fmt(saldoCredito)}).`);
      return;
    }
    if (v > Number(saldoOS || 0) + 0.001) {
      setErro(`Valor excede o saldo da OS (${fmt(saldoOS)}).`);
      return;
    }
    setErro('');
    onConfirm(v);
  };

  const content = (
    <div
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose && onClose()}
      style={{ zIndex: 9999 }}
    >
      <div className="modal modal-sm">
        <div className="modal-header">
          <span className="modal-title" style={{ color: 'var(--color-primary)' }}>
            Usar Crédito Loja
          </span>
          {onClose && (
            <button className="btn btn-icon btn-ghost" onClick={onClose} disabled={isSubmitting}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body modal-body-dense" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {clienteNome && (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                Cliente: <strong>{clienteNome}</strong>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
              <div style={{ padding: 'var(--space-2)', background: 'var(--color-surface-dynamic)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Crédito Disponível</div>
                <div className="tabnum" style={{ fontWeight: 700, color: 'var(--color-success)', fontSize: 'var(--text-sm)' }}>
                  {fmt(saldoCredito)}
                </div>
              </div>
              <div style={{ padding: 'var(--space-2)', background: 'var(--color-surface-dynamic)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Saldo da OS</div>
                <div className="tabnum" style={{ fontWeight: 700, color: 'var(--color-warning)', fontSize: 'var(--text-sm)' }}>
                  {fmt(saldoOS)}
                </div>
              </div>
            </div>

            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                Valor a abater (R$)
              </label>
              <input
                className="form-input tabnum"
                type="number"
                step="0.01"
                min="0.01"
                max={maxUtilizavel}
                value={valor}
                onChange={(e) => {
                  setValor(e.target.value);
                  setErro('');
                }}
                required
                autoFocus
                style={{ width: '100%', fontSize: 'var(--text-base)', fontWeight: 700 }}
              />
            </div>

            {erro && (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-error)' }}>
                {erro}
              </div>
            )}
          </div>
          <div className="modal-footer" style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
            {onClose && (
              <button type="button" className="btn btn-ghost" onClick={onClose} disabled={isSubmitting}>
                Cancelar
              </button>
            )}
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting || maxUtilizavel <= 0}
            >
              {isSubmitting ? 'Aplicando...' : 'Confirmar Uso'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? ReactDOM.createPortal(content, document.body) : content;
}
