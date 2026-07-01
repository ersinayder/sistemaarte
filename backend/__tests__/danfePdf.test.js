import { beforeEach, describe, expect, it, vi } from 'vitest';

const pdfMock = vi.fn(async () => Buffer.from('%PDF-test'));
const setContentMock = vi.fn(async () => undefined);
const emulateMediaTypeMock = vi.fn(async () => undefined);
const closePageMock = vi.fn(async () => undefined);
const newPageMock = vi.fn(async () => ({
  setContent: setContentMock,
  emulateMediaType: emulateMediaTypeMock,
  pdf: pdfMock,
  close: closePageMock,
}));
const browserCloseMock = vi.fn(async () => undefined);
const launchMock = vi.fn(async () => ({
  newPage: newPageMock,
  close: browserCloseMock,
}));

describe('danfePdf renderer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DANFE_PDF_CHROME_PATH = 'C:\\Chrome\\chrome.exe';
    delete process.env.PUPPETEER_EXECUTABLE_PATH;
  });

  it('renders HTML as an A4 PDF buffer', async () => {
    const { createDanfePdfRenderer } = await import('../utils/pdf/danfePdf.js');
    const renderer = createDanfePdfRenderer({ launch: launchMock });

    const buffer = await renderer.render('<html><body>DANFE</body></html>');
    await renderer.close();

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.toString()).toBe('%PDF-test');
    expect(launchMock).toHaveBeenCalledWith(expect.objectContaining({
      headless: true,
      args: expect.arrayContaining(['--no-sandbox', '--disable-setuid-sandbox']),
    }));
    expect(setContentMock).toHaveBeenCalledWith(
      '<html><body>DANFE</body></html>',
      { waitUntil: ['load', 'networkidle0'] }
    );
    expect(emulateMediaTypeMock).toHaveBeenCalledWith('print');
    expect(pdfMock).toHaveBeenCalledWith(expect.objectContaining({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
    }));
    expect(closePageMock).toHaveBeenCalledTimes(1);
  });

  it('reuses the browser between render calls and can close it explicitly', async () => {
    const { createDanfePdfRenderer } = await import('../utils/pdf/danfePdf.js');
    const renderer = createDanfePdfRenderer({ launch: launchMock });

    await renderer.render('<html><body>1</body></html>');
    await renderer.render('<html><body>2</body></html>');
    await renderer.close();

    expect(launchMock).toHaveBeenCalledTimes(1);
    expect(newPageMock).toHaveBeenCalledTimes(2);
    expect(browserCloseMock).toHaveBeenCalledTimes(1);
  });

  it('uses an explicit Chrome executable path when configured', async () => {
    process.env.DANFE_PDF_CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const { createDanfePdfRenderer } = await import('../utils/pdf/danfePdf.js');
    const renderer = createDanfePdfRenderer({ launch: launchMock });

    await renderer.render('<html><body>DANFE</body></html>');
    await renderer.close();

    expect(launchMock).toHaveBeenCalledWith(expect.objectContaining({
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    }));
  });
});
