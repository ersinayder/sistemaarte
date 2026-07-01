'use strict';

const fs = require('fs');
const puppeteer = require('puppeteer-core');

function resolverCaminhoChrome({ env = process.env, existsSync = fs.existsSync, platform = process.platform } = {}) {
  const explicitPath = env.DANFE_PDF_CHROME_PATH || env.PUPPETEER_EXECUTABLE_PATH;
  if (explicitPath) return explicitPath;

  if (platform !== 'win32') return null;

  const candidates = [
    env.ProgramFiles && `${env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
    env['ProgramFiles(x86)'] && `${env['ProgramFiles(x86)']}\\Google\\Chrome\\Application\\chrome.exe`,
    env.LOCALAPPDATA && `${env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    env.ProgramFiles && `${env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
    env['ProgramFiles(x86)'] && `${env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
  ].filter(Boolean);

  return candidates.find((candidate) => existsSync(candidate)) || null;
}

function buildLaunchOptions() {
  const executablePath = resolverCaminhoChrome();
  if (!executablePath) {
    const err = new Error('Chrome/Edge nao encontrado para gerar DANFE PDF. Configure DANFE_PDF_CHROME_PATH ou PUPPETEER_EXECUTABLE_PATH.');
    err.statusCode = 500;
    throw err;
  }
  return {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    ...(executablePath ? { executablePath } : {}),
  };
}

function createDanfePdfRenderer(puppeteerClient = puppeteer) {
  let browserPromise = null;

  async function getBrowser() {
    if (!browserPromise) {
      browserPromise = puppeteerClient.launch(buildLaunchOptions()).catch((err) => {
        browserPromise = null;
        throw err;
      });
    }
    return browserPromise;
  }

  async function render(html) {
    if (!html || typeof html !== 'string') {
      const err = new Error('HTML do DANFE indisponivel para gerar PDF.');
      err.statusCode = 422;
      throw err;
    }

    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      await page.setContent(html, { waitUntil: ['load', 'networkidle0'] });
      await page.emulateMediaType('print');
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
      });
      return Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf);
    } finally {
      await page.close().catch(() => {});
    }
  }

  async function close() {
    const browser = browserPromise ? await browserPromise.catch(() => null) : null;
    browserPromise = null;
    if (browser) await browser.close().catch(() => {});
  }

  return { close, render };
}

const defaultRenderer = createDanfePdfRenderer();

async function renderDanfePdf(html) {
  return defaultRenderer.render(html);
}

async function closeDanfePdfBrowser() {
  return defaultRenderer.close();
}

module.exports = {
  buildLaunchOptions,
  closeDanfePdfBrowser,
  createDanfePdfRenderer,
  renderDanfePdf,
  resolverCaminhoChrome,
};
