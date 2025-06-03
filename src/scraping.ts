import axios from "axios";
import * as fs from "fs";
import * as fsPromises from "fs/promises";
import * as yaml from "js-yaml";
import * as path from "path";
import puppeteer, { Browser } from "puppeteer";
import { PROMPTS_FILE_PATH, HIGH_PRIORITY_COUNT, SCRAPED_ARTICLES_DIR } from "./utils/constants.ts";
import { log } from "./utils/logging.ts";
import { newspaperSourceToHomePageCleanerFn, parseJamStockexDaily, parseJsonString, parseStockData, populateDateUrl } from "./utils/parsing.ts";
import { ArticleSource, Prompts, HttpProxy, ProcessedArticles, RankedArticle, StockData } from "./utils/types.ts";
import { aiService } from "./utils/ai.ts";

class BrowserService {
  private static instance: BrowserService | null = null;
  private browser: Browser | null = null;

  private constructor() {}

  public static getInstance(): BrowserService {
    if (!BrowserService.instance) {
      BrowserService.instance = new BrowserService();
    }
    return BrowserService.instance;
  }

  async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        args: ["--no-sandbox"],
        acceptInsecureCerts: true,
      });
    }
    return this.browser;
  }

  async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

const browserService = BrowserService.getInstance();

async function scrape(url: string) {
  try {
    const browser = await browserService.getBrowser();
    const page = await browser.newPage();

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
  await browserService.closeBrowser();
}

/**
 * Fetch the HTML content from a given URL
 * @param url - The URL to fetch the HTML content from
 * @returns The HTML content
 * @throws An error if the fetch fails
 */
export async function fetchHtmlWithProxy(url: string, proxy: HttpProxy) {
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

/**
 * Get the websites to ingest from the prompts file
 * @returns The list of websites to ingest
 */
export const getDailySourcesToIngest = (
  type: "NEWSPAPERS" | "STOCK" | "JAMSTOCKEX" = "NEWSPAPERS"
) => {
  const prompts = yaml.load(fs.readFileSync(PROMPTS_FILE_PATH, "utf8")) as Prompts;
  return prompts.FREQUENCY.DAILY[type].map(populateDateUrl);
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


export async function getProxy(): Promise<HttpProxy> {
  const url = new URL("https://proxy.webshare.io/api/v2/proxy/list/");
  url.searchParams.append("mode", "direct");
  url.searchParams.append("page", "1");
  url.searchParams.append("page_size", "1");

  let attempts = 0;
  const maxAttempts = 3;
  const retryInterval = 5 * 60 * 1000; // 5 minutes
  let _data = null;

  while (attempts < maxAttempts) {
    try {
      const { data } = await axios.get(url.href, {
        headers: {
          Authorization: `Token ${process.env.PROXY_API_TOKEN}`,
        },
      });
      _data = data;
    } catch (error) {
      if (
        (error as any).response &&
        (error as any).response.status >= 400 &&
        (error as any).response.status < 500
      ) {
        attempts++;
        if (attempts < maxAttempts) {
          log(
            `Retrying to fetch the proxy in 5 minutes... Attempt ${attempts} of ${maxAttempts}`,
            true
          );
          if (error instanceof Error) {
            log(`${error.message}`, true);
          }
          await new Promise((resolve) => setTimeout(resolve, retryInterval));
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

/**
 * Gathers articles from all listed websites
 * @returns Raw articles separated by priority
 */
export const getNewspaperArticles = async (): Promise<ProcessedArticles> => {
  const websites = getDailySourcesToIngest("NEWSPAPERS");
  const allHighPriority: RankedArticle[] = [];
  const allLowPriority: RankedArticle[] = [];

  for (const [index, website] of websites.entries()) {
    log(`Ingesting index ${index} of ${websites.length - 1}: ${website}`);
    let homePageContent = await scrape(website);
    log(`Home page content length: ${homePageContent.length}`);
    if (
      newspaperSourceToHomePageCleanerFn[
        website as keyof typeof newspaperSourceToHomePageCleanerFn
      ]
    ) {
      log(`Cleaning home page content for ${website}`);
      homePageContent =
        newspaperSourceToHomePageCleanerFn[
          website as keyof typeof newspaperSourceToHomePageCleanerFn
        ](homePageContent);
      log(`Cleaned home page content length: ${homePageContent.length}`);
    }
    await savePageContent(`${index}-homepage.html`, homePageContent);
    const llmResponse = await aiService.sendPrompt(
      "ingest",
      homePageContent,
      "NEWSPAPERS",
      "DAILY"
    );
    let rankedArticles: RankedArticle[] = parseJsonString(llmResponse);
    rankedArticles = rankedArticles.map((article) => ({
      ...article,
      source: website,
    }));

    const { highPriority, lowPriority } = separateArticlesByPriority(
      rankedArticles,
      HIGH_PRIORITY_COUNT
    );

    allHighPriority.push(...highPriority);
    allLowPriority.push(...lowPriority);
  }

  return {
    highPriority: allHighPriority,
    lowPriority: allLowPriority,
  };
};

/**
 * Gets the links for the Jamstockex website
 * @returns The list of links for the Jamstockex website
 */
export const getJamstockexDailyLinks = async (proxy: HttpProxy): Promise<ArticleSource[]> => {
  const url = getDailySourcesToIngest("JAMSTOCKEX")[0];
  const pageContent = await fetchHtmlWithProxy(url, proxy);
  const parsedData = parseJamStockexDaily(pageContent);

  await savePageContent(
    "jamstockex-daily.json",
    JSON.stringify(parsedData, null, 2)
  );
  log("Saved Jamstockex daily links");

  return parsedData;
};

export const getDailyStockSummaries = async (proxy: HttpProxy): Promise<StockData[]> => {
  const urls = getDailySourcesToIngest("STOCK");
  log({ urls })
  const stockSummaries: StockData[] = [];
  for (const [index, url] of urls.entries()) {
    const pageContent = await fetchHtmlWithProxy(url, proxy);
    await savePageContent(`stock-${index}.html`, pageContent);
    log(" Saved stock summary page content");
    const parsedContent = parseStockData(pageContent);
    await savePageContent(
      `stock-${index}-parsed.json`,
      JSON.stringify(parsedContent)
    );
    stockSummaries.push(parsedContent);

    // Wait for 3 minutes before fetching the next URL
    await new Promise(resolve => setTimeout(resolve, 1 * 60 * 1000));
  }
  return stockSummaries;
};


export async function savePageContent(
  filename: string,
  content: string
): Promise<void> {
  try {
    const directory = path.join(process.cwd(), "page-content");
    await fsPromises.mkdir(directory, { recursive: true });

    const extension = content.trim().startsWith("<") ? ".html" : ".txt";
    const fullFilename = filename.includes(".")
      ? filename
      : `${filename}${extension}`;

    const filePath = path.join(directory, fullFilename);
    await fsPromises.writeFile(filePath, content, "utf-8");
    log(`Saved content to ${filePath}`);
  } catch (error) {
    log(`Error saving content to file: ${error}`, true);
    throw error;
  }
};

