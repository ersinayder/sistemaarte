import { describe, it, expect, vi } from 'vitest';
import { createSemaphore, createDanfePdfRenderer, MAX_CONCURRENT_RENDERS, resolverCaminhoChrome, buildLaunchOptions } from '../utils/pdf/danfePdf.js';

describe('DANFE PDF Renderer & Concurrency Semaphore (SEC-03)', () => {
  it('has default max concurrent renders configured as 3 or env value', () => {
    expect(MAX_CONCURRENT_RENDERS).toBeGreaterThanOrEqual(1);
  });

  describe('createSemaphore', () => {
    it('limits concurrent executions to max capacity', async () => {
      const sem = createSemaphore(2);
      let activeCount = 0;
      let maxSeen = 0;

      const runTask = async (durationMs) => {
        const release = await sem();
        activeCount++;
        maxSeen = Math.max(maxSeen, activeCount);
        await new Promise((resolve) => setTimeout(resolve, durationMs));
        activeCount--;
        release();
      };

      await Promise.all([
        runTask(50),
        runTask(50),
        runTask(50),
        runTask(50),
      ]);

      expect(maxSeen).toBe(2);
      expect(activeCount).toBe(0);
    });

    it('drains the queue properly in FIFO order', async () => {
      const sem = createSemaphore(1);
      const executionOrder = [];

      const runTask = async (id) => {
        const release = await sem();
        executionOrder.push(`start-${id}`);
        await new Promise((resolve) => setTimeout(resolve, 10));
        executionOrder.push(`end-${id}`);
        release();
      };

      await Promise.all([
        runTask(1),
        runTask(2),
        runTask(3),
      ]);

      expect(executionOrder).toEqual([
        'start-1', 'end-1',
        'start-2', 'end-2',
        'start-3', 'end-3',
      ]);
    });
  });

  describe('createDanfePdfRenderer', () => {
    it('rejects empty or non-string HTML with 422 status', async () => {
      const renderer = createDanfePdfRenderer();
      await expect(renderer.render(null)).rejects.toMatchObject({
        statusCode: 422,
        message: expect.stringContaining('HTML do DANFE indisponivel'),
      });

      await expect(renderer.render('')).rejects.toMatchObject({
        statusCode: 422,
      });

      await expect(renderer.render(123)).rejects.toMatchObject({
        statusCode: 422,
      });
    });

    it('renders PDF buffer with mock puppeteer and releases semaphore even on error', async () => {
      const mockPage = {
        setContent: vi.fn().mockResolvedValue(undefined),
        emulateMediaType: vi.fn().mockResolvedValue(undefined),
        pdf: vi.fn().mockResolvedValue(Buffer.from('%PDF-1.4 mock')),
        close: vi.fn().mockResolvedValue(undefined),
      };

      const mockBrowser = {
        newPage: vi.fn().mockResolvedValue(mockPage),
        close: vi.fn().mockResolvedValue(undefined),
      };

      const mockPuppeteer = {
        launch: vi.fn().mockResolvedValue(mockBrowser),
      };

      const renderer = createDanfePdfRenderer(mockPuppeteer);
      const pdf = await renderer.render('<html><body>DANFE</body></html>');

      expect(Buffer.isBuffer(pdf)).toBe(true);
      expect(pdf.toString()).toContain('%PDF-1.4 mock');
      expect(mockPage.close).toHaveBeenCalled();

      // Test error scenario to verify semaphore release
      mockPage.setContent.mockRejectedValueOnce(new Error('Render error'));
      await expect(renderer.render('<html><body>FAIL</body></html>')).rejects.toThrow('Render error');
      expect(mockPage.close).toHaveBeenCalled();

      // A subsequent call should still work (semaphore released)
      mockPage.setContent.mockResolvedValueOnce(undefined);
      const pdf2 = await renderer.render('<html><body>RECOVERED</body></html>');
      expect(Buffer.isBuffer(pdf2)).toBe(true);

      await renderer.close();
      expect(mockBrowser.close).toHaveBeenCalled();
    });

    it('attaches disconnected listener to browser and recovers on next render', async () => {
      const mockPage = {
        setContent: vi.fn().mockResolvedValue(undefined),
        emulateMediaType: vi.fn().mockResolvedValue(undefined),
        pdf: vi.fn().mockResolvedValue(Buffer.from('%PDF-1.4 mock')),
        close: vi.fn().mockResolvedValue(undefined),
      };

      let disconnectedHandler = null;
      const createMockBrowser = () => ({
        newPage: vi.fn().mockResolvedValue(mockPage),
        close: vi.fn().mockResolvedValue(undefined),
        on: vi.fn((event, handler) => {
          if (event === 'disconnected') {
            disconnectedHandler = handler;
          }
        }),
      });

      const mockPuppeteer = {
        launch: vi.fn().mockImplementation(() => Promise.resolve(createMockBrowser())),
      };

      const renderer = createDanfePdfRenderer(mockPuppeteer);
      await renderer.render('<html><body>FIRST</body></html>');

      expect(mockPuppeteer.launch).toHaveBeenCalledTimes(1);
      expect(disconnectedHandler).toBeTypeOf('function');

      // Trigger disconnected event
      disconnectedHandler();

      // Next render should relaunch browser
      await renderer.render('<html><body>SECOND</body></html>');
      expect(mockPuppeteer.launch).toHaveBeenCalledTimes(2);

      await renderer.close();
    });
  });

  describe('buildLaunchOptions', () => {
    it('includes Linux stability flags in launch args', () => {
      const prev = process.env.DANFE_PDF_CHROME_PATH;
      process.env.DANFE_PDF_CHROME_PATH = 'C:\\mock\\chrome.exe';
      try {
        const options = buildLaunchOptions();
        expect(options.args).toContain('--disable-dev-shm-usage');
        expect(options.args).toContain('--disable-gpu');
      } finally {
        if (prev) process.env.DANFE_PDF_CHROME_PATH = prev;
        else delete process.env.DANFE_PDF_CHROME_PATH;
      }
    });
  });

  describe('resolverCaminhoChrome', () => {
    it('prioritizes explicit environment variable if set', () => {
      const explicit = 'D:\\Custom\\chrome.exe';
      expect(resolverCaminhoChrome({ env: { DANFE_PDF_CHROME_PATH: explicit } })).toBe(explicit);
      expect(resolverCaminhoChrome({ env: { PUPPETEER_EXECUTABLE_PATH: explicit } })).toBe(explicit);
      expect(resolverCaminhoChrome({ env: { CHROME_BIN: explicit } })).toBe(explicit);
      expect(resolverCaminhoChrome({ env: { CHROME_PATH: explicit } })).toBe(explicit);
    });

    it('returns null on win32 when no candidate exists', () => {
      const result = resolverCaminhoChrome({
        env: { ProgramFiles: 'C:\\Program Files' },
        existsSync: () => false,
        platform: 'win32',
      });
      expect(result).toBeNull();
    });

    it('finds Chrome or Edge when candidate file exists', () => {
      const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
      const result = resolverCaminhoChrome({
        env: { ProgramFiles: 'C:\\Program Files' },
        existsSync: (p) => p === chromePath,
        platform: 'win32',
      });
      expect(result).toBe(chromePath);
    });

    it('finds Edge in ProgramFiles(x86) or ProgramFiles', () => {
      const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
      const result = resolverCaminhoChrome({
        env: { 'ProgramFiles(x86)': 'C:\\Program Files (x86)' },
        existsSync: (p) => p === edgePath,
        platform: 'win32',
      });
      expect(result).toBe(edgePath);
    });
  });
});
