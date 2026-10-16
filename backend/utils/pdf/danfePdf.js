'use strict';

const fs = require('fs');
const puppeteer = require('puppeteer-core');

function resolverCaminhoChrome({ env = process.env, existsSync = fs.existsSync, platform = process.platform } = {}) {
  const explicitPath = env.DANFE_PDF_CHROME_PATH || env.PUPPETEER_EXECUTABLE_PATH || env.CHROME_PATH || env.CHROME_BIN || env.EDGE_PATH;
  if (explicitPath) return explicitPath;

  if (platform !== 'win32') {
    const unixCandidates = [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium',
    ];
    return unixCandidates.find((c) => existsSync(c)) || null;
  }

  const programFiles = env.ProgramFiles || 'C:\\Program Files';
  const programFilesX86 = env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const programW6432 = env.ProgramW6432 || 'C:\\Program Files';
  const localAppData = env.LOCALAPPDATA;
  const userProfile = env.USERPROFILE;
  const systemDrive = env.SystemDrive || 'C:';

  const candidates = [
    // Standard Chrome paths
    env.ProgramFiles && `${env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
    env['ProgramFiles(x86)'] && `${env['ProgramFiles(x86)']}\\Google\\Chrome\\Application\\chrome.exe`,
    `${programFiles}\\Google\\Chrome\\Application\\chrome.exe`,
    `${programFilesX86}\\Google\\Chrome\\Application\\chrome.exe`,
    `${programW6432}\\Google\\Chrome\\Application\\chrome.exe`,
    `${systemDrive}\\Program Files\\Google\\Chrome\\Application\\chrome.exe`,
    `${systemDrive}\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe`,
    localAppData && `${localAppData}\\Google\\Chrome\\Application\\chrome.exe`,
    userProfile && `${userProfile}\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe`,
    `${systemDrive}\\Users\\Administrator\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe`,

    // Standard Edge paths
    env.ProgramFiles && `${env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
    env['ProgramFiles(x86)'] && `${env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${programFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${programFilesX86}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${programW6432}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${systemDrive}\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${systemDrive}\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe`,
    localAppData && `${localAppData}\\Microsoft\\Edge\\Application\\msedge.exe`,
    userProfile && `${userProfile}\\AppData\\Local\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${systemDrive}\\Users\\Administrator\\AppData\\Local\\Microsoft\\Edge\\Application\\msedge.exe`,
  ].filter(Boolean);

  const uniqueCandidates = [...new Set(candidates)];
  return uniqueCandidates.find((candidate) => existsSync(candidate)) || null;
}

function buildLaunchOptions() {
  const executablePath = resolverCaminhoChrome();
  if (!executablePath) {
    const err = new Error('Chrome/Edge nao encontrado para gerar DANFE PDF. Configure DANFE_PDF_CHROME_PATH ou PUPPETEER_EXECUTABLE_PATH.');
    err.statusCode = 500;
    err.code = 'CHROME_NAO_ENCONTRADO';
    throw err;
  }
  return {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    ...(executablePath ? { executablePath } : {}),
  };
}

function createSemaphore(max = 3) {
  let running = 0;
  const queue = [];
  return function acquire() {
    return new Promise((resolve) => {
      const tryRun = () => {
        if (running < max) {
          running++;
          resolve(() => {
            running--;
            if (queue.length > 0) {
              const next = queue.shift();
              next();
            }
          });
        } else {
          queue.push(tryRun);
        }
      };
      tryRun();
    });
  };
}

const MAX_CONCURRENT_RENDERS = Number(process.env.DANFE_PDF_MAX_CONCURRENT) || 3;

function createDanfePdfRenderer(puppeteerClient = puppeteer) {
  let browserPromise = null;
  const semaphore = createSemaphore(MAX_CONCURRENT_RENDERS);

  async function getBrowser() {
    if (!browserPromise) {
      browserPromise = puppeteerClient
        .launch(buildLaunchOptions())
        .then((browser) => {
          if (browser && typeof browser.on === 'function') {
            browser.on('disconnected', () => {
              browserPromise = null;
            });
          }
          return browser;
        })
        .catch((err) => {
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

    const release = await semaphore();
    let page = null;
    try {
      const browser = await getBrowser();
      page = await browser.newPage();
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
      if (page) await page.close().catch(() => {});
      release();
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
  MAX_CONCURRENT_RENDERS,
  buildLaunchOptions,
  closeDanfePdfBrowser,
  createDanfePdfRenderer,
  createSemaphore,
  renderDanfePdf,
  resolverCaminhoChrome,
};
