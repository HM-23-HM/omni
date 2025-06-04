import axios from "axios";
import * as fs from "fs";
import * as fsPromises from "fs/promises";
import * as yaml from "js-yaml";
import * as path from "path";
import { aiService } from "./services/AIService.ts";
import { browserService } from "./services/browserService.js";
import { HIGH_PRIORITY_COUNT, PROMPTS_FILE_PATH, SCRAPED_ARTICLES_DIR } from "./utils/constants.ts";
import { logger } from "./utils/logging.ts";
import {
  newspaperSourceToHomePageCleanerFn,
  parseJamStockexDaily,
  parseJsonString,
  parseStockData,
  populateDateUrl
} from "./utils/parsing.ts";
import {
  ArticleSource,
  HttpProxy,
  ProcessedArticles,
  Prompts,
  RankedArticle,
  StockData
} from "./utils/types.ts";

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

    logger.log(`Fetching html from ${url} with proxy: ${host}:${port}`);
    const { data: html } = await axios
      .get(url, {
        proxy: { host, port, protocol: "http", auth: { username, password } },
      })
      .catch(function (error) {
        logger.error(`An error occurred while fetching the url: ${url} `);
        logger.error(error.message);
        throw error;
      });
    return html;
  } catch (error) {
    logger.error(`An error occurred while fetching the url`);
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
        const content = await browserService.scrape(headline.link);

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

        logger.log(`Successfully scraped: ${headline.headline}`);
      } catch (error) {
        logger.error(`Failed to scrape ${headline.headline}: ` + error);
        logger.error(error);
      }
    });

    await Promise.all(scrapePromises);
    return headlinesWithPaths;
  } catch (error) {
    logger.error("Error in scrapeTopStories: " + error);
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

export const getProxy = async (): Promise<HttpProxy> => {
  const maxAttempts = 3;
  let attempts = 0;
  const retryInterval = 5 * 60 * 1000; // 5 minutes

  while (attempts < maxAttempts) {
    try {
      const url = new URL("https://proxy.webshare.io/api/v2/proxy/list/");
      url.searchParams.append("mode", "direct");
      url.searchParams.append("page", "1");
      url.searchParams.append("page_size", "1");

      const { data } = await axios.get(url.href, {
        headers: {
          Authorization: `Token ${process.env.PROXY_API_TOKEN}`,
        },
      });
      const { results } = data;
      const { proxy_address, port, username, password } = results[0];

      return { host: proxy_address, port, username, password };
    } catch (error) {
      attempts++;
      if (attempts < maxAttempts) {
        logger.log(
          `Retrying to fetch the proxy in 5 minutes... Attempt ${attempts} of ${maxAttempts}`
        );
        if (error instanceof Error) {
          logger.error(error.message);
        }
        await new Promise((resolve) => setTimeout(resolve, retryInterval));
      } else {
        logger.error(`Failed to fetch the proxy after ${maxAttempts} attempts`);
        throw error;
      }
    }
  }

  try {
    throw new Error("No working proxy found");
  } catch (error) {
    logger.error(`An error occurred while fetching the proxy`);
    if (error instanceof Error) {
      logger.error(error.message);
    } else {
      logger.error(`An unknown error occurred`);
    }
    throw error;
  }
};

/**
 * Gathers articles from all listed websites
 * @returns Raw articles separated by priority
 */
export const getNewspaperArticles = async (): Promise<ProcessedArticles> => {
  const websites = getDailySourcesToIngest("NEWSPAPERS");
  const allHighPriority: RankedArticle[] = [];
  const allLowPriority: RankedArticle[] = [];

  for (const [index, website] of websites.entries()) {
    logger.log(`Ingesting index ${index} of ${websites.length - 1}: ${website}`);
    let homePageContent = await browserService.scrape(website);
    logger.log(`Home page content length: ${homePageContent.length}`);
    if (
      newspaperSourceToHomePageCleanerFn[
        website as keyof typeof newspaperSourceToHomePageCleanerFn
      ]
    ) {
      logger.log(`Cleaning home page content for ${website}`);
      homePageContent =
        newspaperSourceToHomePageCleanerFn[
          website as keyof typeof newspaperSourceToHomePageCleanerFn
        ](homePageContent);
      logger.log(`Cleaned home page content length: ${homePageContent.length}`);
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
  logger.log("Saved Jamstockex daily links");

  return parsedData;
};

export const getDailyStockSummaries = async (proxy: HttpProxy): Promise<StockData[]> => {
  const urls = getDailySourcesToIngest("STOCK");
  logger.log({ urls })
  const stockSummaries: StockData[] = [];
  for (const [index, url] of urls.entries()) {
    const pageContent = await fetchHtmlWithProxy(url, proxy);
    await savePageContent(`stock-${index}.html`, pageContent);
    logger.log("Saved stock summary page content");
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
    logger.log(`Saved content to ${filePath}`);
  } catch (error) {
    logger.error(`Error saving content to file: ${error}`);
    throw error;
  }
};

