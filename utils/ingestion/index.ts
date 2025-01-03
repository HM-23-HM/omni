import puppeteer, { Browser } from "puppeteer";
import * as fsPromises from "fs/promises";
import * as path from "path";
import { Config } from "../ai/index.ts";
import * as fs from "fs";
import * as yaml from "js-yaml";
import { CONFIG_FILE_PATH, SCRAPED_ARTICLES_DIR } from "../constants/index.ts";
import { getProxyUrls, populateDateUrl } from "../parsing/index.ts";
import { log } from "../logging/index.ts";
import axios from "axios";
import { savePageContent } from "../index.ts";

export interface StockData {
  ticker: string;
  range: string;
  volume: number;
}

export interface ArticleSource {
  headline: string;
  link: string;
}

export interface RankedArticle {
  source: string;
  headline: string;
  link: string;
  path?: string;
  priority: number;
  summary?: string;
}

let browserInstance: Browser | null = null;
// const { host, port } = await getProxy();

async function getBrowser(): Promise<Browser> {
  if (!browserInstance) {
    browserInstance = await puppeteer.launch({
      args: ["--no-sandbox"],
      acceptInsecureCerts: true,
    });
  }
  return browserInstance;
}

/**
 * Get the HTML full page content from a given URL
 * @param url - The URL to get the full page content from
 * @returns The full page content
 */
export async function scrape(url: string) {
  try {
    const browser = await getBrowser();
    const page = await browser.newPage();

    // Set viewport to avoid mobile versions
    await page.setViewport({
      width: 1920,
      height: 1080,
    });

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    );

    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 1200000 });
    const pageContent = await page.content();
    await page.close();

    return pageContent;
  } catch (error) {
    log(`An error occurred while scraping the url: ${error}`, true);
    throw error;
  }
}

export async function closeBrowser() {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

/**
 * Fetch the HTML content from a given URL
 * @param url - The URL to fetch the HTML content from
 * @returns The HTML content
 * @throws An error if the fetch fails
 */
export async function fetchHtmlWithProxy(url: string, proxy: Proxy) {
  try {
    const { host, port, username, password } = proxy;

    log(`Fetching html from ${url} with proxy: ${host}:${port}`);
    const { data: html } = await axios
      .get(url, {
        proxy: { host, port, protocol: "http", auth: { username, password } },
      })
      .catch(function (error) {
        log(`An error occurred while fetching the url: ${url} `, true);
        log(error.message, true);
        throw error;
      });
    return html;
  } catch (error) {
    log(`An error occurred while fetching the url`, true);
    throw error;
  }
}

/**
 * Scrape the top headlines from the list of ranked headlines.
 * @param headlines - The list of ranked headlines.
 * @returns The list of ranked headlines with paths to the scraped articles.
 */
export async function scrapeTopStories(
  headlines: RankedArticle[]
): Promise<RankedArticle[]> {
  try {
    const outputDir = path.join(process.cwd(), SCRAPED_ARTICLES_DIR);
    await fsPromises.mkdir(outputDir, { recursive: true });

    const headlinesWithPaths: RankedArticle[] = [];

    const scrapePromises = headlines.map(async (headline) => {
      try {
        const content = await scrape(headline.link);

        const safeFilename = headline.headline
          .replace(/[^a-z0-9]/gi, "_")
          .toLowerCase()
          .replace(/_+/g, "_")
          .trim();

        const filePath = path.join(outputDir, `${safeFilename}.txt`);
        headlinesWithPaths.push({
          ...headline,
          path: filePath,
        });
        await fsPromises.writeFile(filePath, content, "utf-8");

        log(`Successfully scraped: ${headline.headline}`);
      } catch (error) {
        log(`Failed to scrape ${headline.headline}: ` + error, true);
        log(error, true);
      }
    });

    await Promise.all(scrapePromises);
    return headlinesWithPaths;
  } catch (error) {
    log("Error in scrapeTopStories: " + error, true);
    throw error;
  }
}

export type Frequency = "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY";

/**
 * Get the websites to ingest from the config file
 * @returns The list of websites to ingest
 */
export const getDailySourcesToIngest = (
  type: "NEWSPAPERS" | "STOCK" | "JAMSTOCKEX" = "NEWSPAPERS"
) => {
  const config = yaml.load(fs.readFileSync(CONFIG_FILE_PATH, "utf8")) as Config;
  return config.FREQUENCY.DAILY[type].map(populateDateUrl);
};

export function separateArticlesByPriority(
  articles: RankedArticle[],
  numHighPriority: number = 3
): {
  highPriority: RankedArticle[];
  lowPriority: RankedArticle[];
} {
  return {
    highPriority: articles.filter(
      (article) => article.priority <= numHighPriority
    ),
    lowPriority: articles.filter(
      (article) => article.priority > numHighPriority
    ),
  };
}


export type Proxy = {
  host: string;
  port: number;
  username: string;
  password: string;
}

export async function getProxy(): Promise<Proxy> {
  
  const url = new URL('https://proxy.webshare.io/api/v2/proxy/list/');
url.searchParams.append('mode', 'direct');
url.searchParams.append('page', '1');
url.searchParams.append('page_size', '1');

  let attempts = 0;
  const maxAttempts = 3;
  const retryInterval = 5 * 60 * 1000; // 5 minutes
  let _data = null;

  while (attempts < maxAttempts) {
    try {
      const { data } = await axios.get(url.href, {
        headers: {
          Authorization: `Token ${process.env.PROXY_API_TOKEN}`
        }
      });
      _data = data;
    } catch (error) {
      if ((error as any).response && (error as any).response.status >= 400 && (error as any).response.status < 500) {
        attempts++;
        if (attempts < maxAttempts) {
          log(`Retrying to fetch the proxy in 5 minutes... Attempt ${attempts} of ${maxAttempts}`, true);
          if (error instanceof Error) {
            log(`${error.message}`, true);
          } 
          await new Promise(resolve => setTimeout(resolve, retryInterval));
        } else {
          log(`Failed to fetch the proxy after ${maxAttempts} attempts`, true);
          throw error;
        }
      } else {
        log(`An error occurred while fetching the proxy`, true);
        if (error instanceof Error) {
          log(`${error.message}`, true);
        } else {
          log(`An unknown error occurred`, true);
        }
        throw error;
      }
    }
  }

  const { results } = _data;
  const { proxy_address, port, username, password } = results[0];

  return { host: proxy_address, port: parseInt(port), username, password };
}