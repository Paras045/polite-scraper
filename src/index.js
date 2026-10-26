import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as cheerio from 'cheerio';

const BASE_URL = 'https://books.toscrape.com/';
const CACHE_DIR = path.resolve('cache');
const OUTPUT_DIR = path.resolve('output');
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
    if (error.code !== 'ENOENT') throw error;
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

function extractBookDetails(html, productUrl, sourcePage) {
  const $ = cheerio.load(html);

  const title = $('div.product_main h1').first().text().trim();
  const priceText = $('p.price_color').first().text().trim();
  const availabilityText = $('div.product_main p.availability')
    .first()
    .text()
    .replace(/\s+/g, ' ')
    .trim();

  const ratingClass = $('div.product_main p.star-rating')
    .first()
    .attr('class');

  const ratingText =
    ratingClass?.split(/\s+/).find((value) => value !== 'star-rating') ?? null;

    const descriptionElement = $('#product_description')
    .nextAll('p')
    .first();

    const description = descriptionElement.length
    ? descriptionElement.text().trim()
    : null;

  return {
    title,
    product_url: productUrl,
    price_text: priceText,
    availability_text: availabilityText,
    rating_text: ratingText,
    description,
    source_page: sourcePage,
    fetched_at: new Date().toISOString(),
  };
}

async function main() {
  const urlsFile = path.join(CACHE_DIR, 'book-urls.json');
  const urls = JSON.parse(await readFile(urlsFile, 'utf8'));

  if (!Array.isArray(urls) || urls.length === 0) {
    throw new Error('No book URLs found in cache/book-urls.json');
  }

  await mkdir(OUTPUT_DIR, { recursive: true });

  const records = [];
  const failures = [];

  for (let index = 0; index < urls.length; index++) {
    const productUrl = urls[index];
    const filename = `book-${String(index + 1).padStart(3, '0')}.html`;
    const cacheFile = path.join(CACHE_DIR, 'books', filename);

    // Catalogue pages 1–3 are traversed in order; retain the originating page.
    const sourcePage = `${BASE_URL}catalogue/page-${Math.floor(index / 20) + 1}.html`;

    try {
      const html = await fetchHtml(productUrl, cacheFile);
      const record = extractBookDetails(html, productUrl, sourcePage);

      records.push(record);
      console.log(`EXTRACTED ${index + 1}/${urls.length}: ${record.title || '(missing title)'}`);
    } catch (error) {
      failures.push({
        product_url: productUrl,
        reason: error.message,
      });

      console.error(`FAILED ${productUrl}: ${error.message}`);
    }
  }

  await writeFile(
    path.join(OUTPUT_DIR, 'raw-books.json'),
    JSON.stringify(records, null, 2),
    'utf8',
  );

  await writeFile(
    path.join(OUTPUT_DIR, 'stage3-errors.json'),
    JSON.stringify(failures, null, 2),
    'utf8',
  );

  console.log('\n--- Stage 3 checkpoint ---');
  console.log(`discovered_urls=${urls.length}`);
  console.log(`records_extracted=${records.length}`);
  console.log(`failed_pages=${failures.length}`);
  console.log(`pages_fetched=${pagesFetched}`);
  console.log(`cache_hits=${cacheHits}`);
  console.log(`saved=${path.join(OUTPUT_DIR, 'raw-books.json')}`);
}

main().catch((error) => {
  console.error(`Scraper failed: ${error.message}`);
  process.exitCode = 1;
});