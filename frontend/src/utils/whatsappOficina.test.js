import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  buildWhatsappDesktopUrl,
  buildWhatsappWebUrl,
  openWhatsappConversation,
  getWhatsappClientMode,
  setWhatsappClientMode,
} from './whatsappOficina'

describe('whatsappOficina', () => {
  let openSpy

  beforeEach(() => {
    localStorage.clear()
    openSpy = vi.spyOn(window, 'open').mockImplementation(() => ({}))
  })

  afterEach(() => {
    openSpy.mockRestore()
  })

  describe('DDI 55 formatting', () => {
    it('prepends 55 for 10-digit phone numbers', () => {
      const desktopUrl = buildWhatsappDesktopUrl({ phone: '1133334444', text: 'Olá' })
      expect(desktopUrl).toBe('whatsapp://send?phone=551133334444&text=Ol%C3%A1')

      const webUrl = buildWhatsappWebUrl({ phone: '1133334444', text: 'Olá' })
      expect(webUrl).toBe('https://web.whatsapp.com/send?phone=551133334444&text=Ol%C3%A1')
    })

    it('prepends 55 for 11-digit phone numbers', () => {
      const desktopUrl = buildWhatsappDesktopUrl({ phone: '11999998888', text: 'Teste' })
      expect(desktopUrl).toBe('whatsapp://send?phone=5511999998888&text=Teste')

      const webUrl = buildWhatsappWebUrl({ phone: '11999998888', text: 'Teste' })
      expect(webUrl).toBe('https://web.whatsapp.com/send?phone=5511999998888&text=Teste')
    })

    it('handles formatted numbers with punctuation', () => {
      const webUrl = buildWhatsappWebUrl({ phone: '(11) 98888-7777', text: 'Oi' })
      expect(webUrl).toBe('https://web.whatsapp.com/send?phone=5511988887777&text=Oi')
    })

    it('leaves already prefixed 55 numbers intact', () => {
      const desktopUrl = buildWhatsappDesktopUrl({ phone: '5511999998888', text: 'Oi' })
      expect(desktopUrl).toBe('whatsapp://send?phone=5511999998888&text=Oi')

      const webUrl = buildWhatsappWebUrl({ phone: '+55 (11) 99999-8888', text: 'Oi' })
      expect(webUrl).toBe('https://web.whatsapp.com/send?phone=5511999998888&text=Oi')
    })

    it('returns null when phone is empty or contains no digits', () => {
      expect(buildWhatsappDesktopUrl({ phone: '', text: 'Oi' })).toBeNull()
      expect(buildWhatsappWebUrl({ phone: '---', text: 'Oi' })).toBeNull()
      expect(buildWhatsappDesktopUrl({})).toBeNull()
    })
  })

  describe('openWhatsappConversation in web mode', () => {
    it('opens WhatsApp Web in a new tab with noopener,noreferrer', () => {
      setWhatsappClientMode('web')
      const success = openWhatsappConversation(
        { phone: '11988887777', text: 'Sua moldura está pronta!' },
        null,
        { mode: 'web' }
      )

      expect(success).toBe(true)
      expect(openSpy).toHaveBeenCalledWith(
        'https://web.whatsapp.com/send?phone=5511988887777&text=Sua%20moldura%20est%C3%A1%20pronta!',
        '_blank',
        'noopener,noreferrer'
      )
    })

    it('returns false when phone is missing', () => {
      const success = openWhatsappConversation({ phone: '' }, null, { mode: 'web' })
      expect(success).toBe(false)
      expect(openSpy).not.toHaveBeenCalled()
    })
  })
})
