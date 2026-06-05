export function normalizePrintCopies(copies) {
  const value = Number(copies)
  if (![1, 2].includes(value)) {
    throw new Error('Escolha 1 ou 2 vias para imprimir.')
  }
  return value
}

export function printUrlInPage(url) {
  if (typeof document === 'undefined') {
    throw new Error('Impressao no navegador indisponivel neste ambiente.')
  }

  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    iframe.style.opacity = '0'
    iframe.setAttribute('aria-hidden', 'true')

    const cleanup = () => {
      window.setTimeout(() => iframe.remove(), 1000)
    }

    iframe.onload = () => {
      try {
        const printWindow = iframe.contentWindow
        if (!printWindow) throw new Error('Janela de impressao indisponivel.')
        printWindow.focus()
        printWindow.print()
        cleanup()
        resolve()
      } catch (error) {
        cleanup()
        reject(error)
      }
    }
    iframe.onerror = () => {
      cleanup()
      reject(new Error('Nao foi possivel carregar a OS para impressao.'))
    }

    iframe.src = url
    document.body.appendChild(iframe)
  })
}

export async function printOrdem(api, ordemId, copies, options = {}) {
  const normalizedCopies = normalizePrintCopies(copies)
  if (!ordemId) throw new Error('OS nao informada para impressao.')

  const response = await api.post(`/ordens/${ordemId}/print`, { copies: normalizedCopies }, { skipGlobalErrorToast: true })
  const data = response?.data || {}
  if (data.mode === 'browser' && data.printUrl) {
    const browserPrint = options.browserPrint || printUrlInPage
    await browserPrint(data.printUrl, { copies: normalizedCopies })
  }
  return response
}
