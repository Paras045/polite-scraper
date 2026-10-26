import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CATALOGUE_URL = 'https://books.toscrape.com/';
const CACHE_DIR = path.resolve('cache');
const CACHE_FILE = path.join(CACHE_DIR, 'catalogue-page-1.html');
const TIMEOUT_MS = 10_000;

const USER_AGENT =
  'FlyRankInternship-PoliteScraper/1.0 (+https://github.com/Paras045/polite-scraper)';

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });

  // Reuse the cached HTML if we've already fetched this page.
  try {
    const html = await readFile(CACHE_FILE, 'utf8');
    console.log(`CACHE HIT bytes=${Buffer.byteLength(html, 'utf8')}`);
    return;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  console.log('Fetching the first catalogue page...');

  const response = await fetch(CATALOGUE_URL, {
    headers: {
      'User-Agent': USER_AGENT,
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  // Check the HTTP status before reading or parsing the response body.
  if (!response.ok) {
    throw new Error(`Catalogue request failed: HTTP ${response.status}`);
  }

  const html = await response.text();

  await writeFile(CACHE_FILE, html, 'utf8');

  console.log(`FETCH status=${response.status} bytes=${Buffer.byteLength(html, 'utf8')}`);
  console.log(`Cached HTML at ${CACHE_FILE}`);
}

main().catch((error) => {
  console.error(`Scraper failed: ${error.message}`);
  process.exitCode = 1;
});