import * as fsPromises from "fs/promises";
import * as path from "path";
import { sendPrompt } from "./ai/index.ts";
import {
  HIGH_PRIORITY_COUNT,
  PAGE_CONTENT_DIR,
  SCRAPED_ARTICLES_DIR,
} from "./constants/index.ts";
import {
  generateDailyJamstockexHtml,
  generateDailyNewsHtml,
  generateDailyStockSummaryHtml,
  sendEmail,
} from "./email/index.ts";
import {
  ArticleSource,
  closeBrowser,
  getDailySourcesToIngest,
  getFullPage,
  RankedArticle,
  scrapeTopStories,
  separateArticlesByPriority,
  StockData,
} from "./ingestion/index.ts";
import {
  newspaperSourceToCleanerFn,
  newspaperSourceToHomePageCleanerFn,
  parseJamStockexDaily,
  parseJsonString,
  parseStockData,
  stripCodeMarkers,
} from "./parsing/index.ts";
import { log } from "./logging/index.ts";

/**
 * Generates summaries for the top headlines and returns the list of ranked articles with summaries.
 * @param hpArticles The list of high priority ranked articles to summarize.
 * @returns The list of ranked articles with summaries.
 */
const getNewspaperSummaries = async (
  hpArticles: RankedArticle[]
): Promise<RankedArticle[]> => {
  const headlinesWithSummaries: RankedArticle[] = [];
  for (const headline of hpArticles) {
    const pageContent = await fsPromises.readFile(headline.path!, "utf-8");
    const cleanedHtml =
      newspaperSourceToCleanerFn[
        headline.source as keyof typeof newspaperSourceToCleanerFn
      ](pageContent);
    console.log({
      headline: headline.headline,
      path: headline.path,
      originalLength: pageContent.length,
      cleanedLength: cleanedHtml.length,
    });
    const summary = await sendPrompt(
      "summarize",
      cleanedHtml,
      "NEWSPAPERS",
      "DAILY"
    );
    headlinesWithSummaries.push({
      ...headline,
      summary,
    });
  }

  return headlinesWithSummaries;
};

const clearScrapedArticles = async () => {
  const directory = path.join(process.cwd(), SCRAPED_ARTICLES_DIR);
  try {
    const files = await fsPromises.readdir(directory);
    for (const file of files) {
      await fsPromises.unlink(path.join(directory, file));
    }
    log("Cleared scraped-articles directory");
  } catch (error) {
    log("Error clearing scraped-articles directory:" + error, true);
  }
};

const clearPageContent = async () => {
  const directory = path.join(process.cwd(), PAGE_CONTENT_DIR);
  try {
    await fsPromises.rm(directory, { recursive: true });
    log("Cleared page-content directory");
  } catch (error) {
    log("Error clearing page-content directory:" + error, true);
  }
};

interface ProcessedArticles {
  highPriority: RankedArticle[];
  lowPriority: RankedArticle[];
}

/**
 * Gathers articles from all configured websites
 * @returns Raw articles separated by priority
 */
const getNewspaperArticles = async (): Promise<ProcessedArticles> => {
  const websites = getDailySourcesToIngest("NEWSPAPERS");
  const allHighPriority: RankedArticle[] = [];
  const allLowPriority: RankedArticle[] = [];

  for (const [index, website] of websites.entries()) {
    log(`Ingesting index ${index} of ${websites.length - 1}: ${website}`);
    let homePageContent = await getFullPage(website);
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
    const llmResponse = await sendPrompt(
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
const getJamstockexDailyLinks = async (): Promise<ArticleSource[]> => {
  const url = getDailySourcesToIngest("JAMSTOCKEX")[0];
  log({ url });
  const pageContent = await getFullPage(url);
  log({ pageContent })
  const parsedData = parseJamStockexDaily(pageContent);
  log({ parsedData })

  // Save the parsed data
  await savePageContent(
    "jamstockex-daily.json",
    JSON.stringify(parsedData, null, 2)
  );
  log("Saved Jamstockex daily links");

  return parsedData;
};

export const getDailyStockSummaries = async (): Promise<StockData[]> => {
  const urls = getDailySourcesToIngest("STOCK");
  log({ urls})
  const stockSummaries: StockData[] = [];
  for (const [index, url] of urls.entries()) {
    const pageContent = await getFullPage(url);
    log({ stockSummariesPageContent: pageContent})
    await savePageContent(`stock-${index}.html`, pageContent);
    log(" Saved stock summary page content");
    const parsedContent = parseStockData(pageContent);
    log({ stockSummariesParsedContent: parsedContent })
    await savePageContent(
      `stock-${index}-parsed.json`,
      JSON.stringify(parsedContent)
    );
    stockSummaries.push(parsedContent);
  }
  return stockSummaries;
};

/**
 * Processes the gathered articles by scraping content and generating summaries
 * @param articles The raw gathered articles
 * @returns Processed articles with summaries
 */
const processNewspaperArticles = async (
  articles: ProcessedArticles
): Promise<ProcessedArticles> => {
  const highPriorityWithPaths = await scrapeTopStories(articles.highPriority);
  const highPriorityWithSummaries = await getNewspaperSummaries(
    highPriorityWithPaths
  );

  return {
    highPriority: highPriorityWithSummaries,
    lowPriority: articles.lowPriority,
  };
};

/**
 * Generates and sends the final report
 * @param newspaperSection The processed articles ready for reporting
 */
const sendDailyNewsEmail = async (
  newspaperSection: ProcessedArticles
): Promise<void> => {
  const newspaperHpHtml = generateDailyNewsHtml(
    newspaperSection.highPriority,
    "hp"
  );
  log("Generated newspaper high priority html");
  const newspaperLpHtml = generateDailyNewsHtml(
    newspaperSection.lowPriority,
    "lp"
  );
  log("Generated newspaper low priority html");

  const combinedHtml = `
    <div class="newspaper-section">
      <h2>Newspaper - High Priority</h2>
      ${newspaperHpHtml}
    </div>
    <div class="newspaper-section">
      <h2>Newspaper - Low Priority</h2>
      ${newspaperLpHtml}
    </div>
  `;

  // Save the combined HTML to a file
  await savePageContent("daily-report.html", combinedHtml);

  await sendEmail(stripCodeMarkers(combinedHtml));
};

const sendJamstockexEmail = async (
  jamstockexLinks: ArticleSource[],
  stockSummaries: StockData[]
): Promise<void> => {
  const jamstockexHtml = generateDailyJamstockexHtml(jamstockexLinks);
  log("Generated jamstockex html");
  const stockSummaryHtml = generateDailyStockSummaryHtml(stockSummaries);
  log("Generated stock summary html");

  const combinedHtml = `
    <div class="jamstockex-section">
      <h2>Jamstockex Daily</h2>
      ${jamstockexHtml}
    </div>
    <div class="stock-summary-section">
      <h2>JSE Stock Summary</h2>
      ${stockSummaryHtml}
    </div>
  `;

  await savePageContent("daily-report-jamstockex.html", combinedHtml);
  await sendEmail(stripCodeMarkers(combinedHtml), "Daily Jamstockex Report");
};

const savePageContent = async (
  filename: string,
  content: string
): Promise<void> => {
  try {
    const directory = path.join(process.cwd(), "page-content");
    // Ensure directory exists
    await fsPromises.mkdir(directory, { recursive: true });

    // Determine file extension based on content type
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

export const sendDailyNewsReport = async (): Promise<void> => {
  try {
    const gatheredArticles = await getNewspaperArticles();
    const processedArticles = await processNewspaperArticles(gatheredArticles);
    log("Processed articles");

    await sendDailyNewsEmail(processedArticles);

    log("Email sent successfully");
  } catch (error) {
    log("Error sending daily news report:" + error, true);
    throw error;
  } finally {
    // Clean up
    await closeBrowser();
    await clearScrapedArticles();
    await clearPageContent();
  }
};

export const sendDailyJamstockexReport = async (): Promise<void> => {
  try {
    const jamstockexLinks = await getJamstockexDailyLinks();
    log("Jamstockex links fetched");

    const stockSummaries = await getDailyStockSummaries();
    log("Stock summaries fetched");

    await sendJamstockexEmail(jamstockexLinks, stockSummaries);
  } catch (error) {
    log("Error sending jamstockex report:" + error, true);
    throw error;
  } finally {
    await closeBrowser();
    // await clearScrapedArticles();
    // await clearPageContent();
  }
};
