import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as cheerio from 'cheerio';

const BASE_URL = 'https://books.toscrape.com/';
const CACHE_DIR = path.resolve('cache');
const TIMEOUT_MS = 10_000;
const MIN_DELAY_MS = 500;

const USER_AGENT =
  'FlyRankInternship-PoliteScraper/1.0 (+https://github.com/Paras045/polite-scraper)';

let lastNetworkRequestAt = 0;
let pagesFetched = 0;
let cacheHits = 0;

async function fetchHtml(url, cacheFile) {
  await mkdir(path.dirname(cacheFile), { recursive: true });

  try {
    const html = await readFile(cacheFile, 'utf8');
    cacheHits++;
    console.log(
      `CACHE HIT ${path.basename(cacheFile)} bytes=${Buffer.byteLength(html, 'utf8')}`,
    );
    return html;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  const elapsed = Date.now() - lastNetworkRequestAt;
  if (lastNetworkRequestAt !== 0 && elapsed < MIN_DELAY_MS) {
    await new Promise((resolve) =>
      setTimeout(resolve, MIN_DELAY_MS - elapsed),
    );
  }

  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  lastNetworkRequestAt = Date.now();

  if (!response.ok) {
    throw new Error(`Request failed: HTTP ${response.status} for ${url}`);
  }

  const html = await response.text();
  await writeFile(cacheFile, html, 'utf8');
  pagesFetched++;

  console.log(
    `FETCH status=${response.status} ${path.basename(cacheFile)} bytes=${Buffer.byteLength(html, 'utf8')}`,
  );
  return html;
}

async function main() {
  const bookUrls = new Set();
  let pageUrl = BASE_URL;
  let cataloguePages = 0;

  while (pageUrl && cataloguePages < 3) {
    const cacheFile = path.join(
      CACHE_DIR,
      `catalogue-page-${cataloguePages + 1}.html`,
    );

    const html = await fetchHtml(pageUrl, cacheFile);
    const $ = cheerio.load(html);

    cataloguePages++;

    $('article.product_pod h3 a').each((_, element) => {
      const href = $(element).attr('href');
      if (href) {
        bookUrls.add(new URL(href, pageUrl).href);
      }
    });

    const nextHref = $('li.next a').attr('href');
    pageUrl = nextHref ? new URL(nextHref, pageUrl).href : null;
  }

  const urls = [...bookUrls];

  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(
    path.join(CACHE_DIR, 'book-urls.json'),
    JSON.stringify(urls, null, 2),
    'utf8',
  );

  console.log('\n--- Stage 2 checkpoint ---');
  console.log(`catalogue_pages=${cataloguePages}`);
  console.log(`discovered=${urls.length}`);
  console.log(`unique_urls=${new Set(urls).size}`);
  console.log(`pages_fetched=${pagesFetched}`);
  console.log(`cache_hits=${cacheHits}`);
  console.log('Saved URL list to cache/book-urls.json');
}

main().catch((error) => {
  console.error(`Scraper failed: ${error.message}`);
  process.exitCode = 1;
});
