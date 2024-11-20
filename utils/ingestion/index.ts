import puppeteer, { Browser } from "puppeteer";
import * as fsPromises from "fs/promises";
import * as path from "path";
import { Config } from "../ai/index.ts";
import * as fs from "fs";
import * as yaml from "js-yaml";
import { CONFIG_FILE_PATH, SCRAPED_ARTICLES_DIR } from "../constants/index.ts";
import { populateDateUrl } from "../parsing/index.ts";

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
  headline: string;
  link: string;
  path?: string;
  priority: number;
  summary?: string;
}

let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserInstance) {
    browserInstance = await puppeteer.launch({
      args: ["--no-sandbox"],
    });
  }
  return browserInstance;
}

/**
 * Get the HTML full page content from a given URL
 * @param url - The URL to get the full page content from
 * @returns The full page content
 */
export async function getFullPage(url: string) {
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

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    const pageContent = await page.content();
    await page.close();

    return pageContent;
  } catch (error) {
    console.error(`An error occurred while getting the full page: ${error}`);
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
        const content = await getFullPage(headline.link);

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

        console.log(`Successfully scraped: ${headline.headline}`);
      } catch (error) {
        console.error(`Failed to scrape ${headline.headline}:`, error);
      }
    });

    await Promise.all(scrapePromises);
    return headlinesWithPaths;
  } catch (error) {
    console.error("Error in scrapeTopStories:", error);
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
