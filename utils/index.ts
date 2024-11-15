import * as fsPromises from "fs/promises";
import * as path from "path";
import { sendPrompt } from "./ai/index.ts";
import { HIGH_PRIORITY_COUNT, SCRAPED_ARTICLES_DIR } from "./constants/index.ts";
import { generateDailyJamstockexHtml, generateDailyNewsHtml, generateDailyStockSummaryHtml, sendEmail } from "./email/index.ts";
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
import { parseJamStockexDaily, parseJsonString, parseStockData } from "./parsing/index.ts";

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
    console.log({
      headline: headline.headline,
      path: headline.path,
      length: pageContent.length,
    });
    const summary = await sendPrompt("summarize", pageContent, "NEWSPAPERS", "DAILY");
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
    console.log("Cleared scraped-articles directory");
  } catch (error) {
    console.error("Error clearing scraped-articles directory:", error);
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

  for (const website of websites) {
    const homePageContent = await getFullPage(website);
    const llmResponse = await sendPrompt("ingest", homePageContent, "NEWSPAPERS", "DAILY");
    const rankedArticles: RankedArticle[] = parseJsonString(llmResponse);

    const { highPriority, lowPriority } = separateArticlesByPriority(
      rankedArticles,
      HIGH_PRIORITY_COUNT
    );
    
    allHighPriority.push(...highPriority);
    allLowPriority.push(...lowPriority);
  }

  return { 
    highPriority: allHighPriority, 
    lowPriority: allLowPriority 
  };
};

/**
 * Gets the links for the Jamstockex website
 * @returns The list of links for the Jamstockex website
 */
const getJamstockexDailyLinks = async (): Promise<ArticleSource[]> => {
  const url = getDailySourcesToIngest("JAMSTOCKEX")[0];
  const pageContent = await getFullPage(url);
  const parsedData = parseJamStockexDaily(pageContent);
  return parsedData;
}

export const getDailyStockSummaries = async (): Promise<StockData[]> => {
  const urls = getDailySourcesToIngest("STOCK");
  const stockSummaries: StockData[] = [];
  for (const [index, url] of urls.entries()) {
    const pageContent = await getFullPage(url);
    await savePageContent(`stock-${index}.html`, pageContent);
    const parsedContent = parseStockData(pageContent);
    await savePageContent(`stock-${index}-parsed.json`, JSON.stringify(parsedContent));
    stockSummaries.push(parsedContent);
  }
  return stockSummaries;
}

/**
 * Processes the gathered articles by scraping content and generating summaries
 * @param articles The raw gathered articles
 * @returns Processed articles with summaries
 */
const processNewspaperArticles = async (articles: ProcessedArticles): Promise<ProcessedArticles> => {
  const highPriorityWithPaths = await scrapeTopStories(articles.highPriority);
  const highPriorityWithSummaries = await getNewspaperSummaries(highPriorityWithPaths);

  return {
    highPriority: highPriorityWithSummaries,
    lowPriority: articles.lowPriority
  };
};

/**
 * Generates and sends the final report
 * @param newspaperSection The processed articles ready for reporting
 */
const generateAndSendEmail = async (newspaperSection: ProcessedArticles, jamstockexLinks: ArticleSource[], stockSummaries: StockData[]): Promise<void> => {
  const newspaperHpHtml = generateDailyNewsHtml(newspaperSection.highPriority, "hp");
  console.log('Generated newspaper high priority html');
  const newspaperLpHtml = generateDailyNewsHtml(newspaperSection.lowPriority, "lp");
  console.log('Generated newspaper low priority html');
  const jamstockexHtml = generateDailyJamstockexHtml(jamstockexLinks);
  console.log('Generated jamstockex html');
  const stockSummaryHtml = generateDailyStockSummaryHtml(stockSummaries);
  console.log('Generated stock summary html');

  const combinedHtml = `
    <div class="newspaper-section">
      <h2>Newspaper - High Priority</h2>
      ${newspaperHpHtml}
    </div>
    <div class="jamstockex-section">
      <h2>Jamstockex Daily</h2>
      ${jamstockexHtml}
    </div>
    <div class="stock-summary-section">
      <h2>JSE Stock Summary</h2>
      ${stockSummaryHtml}
    </div>
    <div class="newspaper-section">
      <h2>Newspaper - Low Priority</h2>
      ${newspaperLpHtml}
    </div>
  `;

  // Save the combined HTML to a file
  await savePageContent('daily-report.html', combinedHtml);

  await sendEmail(combinedHtml);
};

const savePageContent = async (filename: string, content: string): Promise<void> => {
  try {
    const directory = path.join(process.cwd(), 'page-content');
    // Ensure directory exists
    await fsPromises.mkdir(directory, { recursive: true });
    
    // Determine file extension based on content type
    const extension = content.trim().startsWith('<') ? '.html' : '.txt';
    const fullFilename = filename.includes('.') ? filename : `${filename}${extension}`;
    
    const filePath = path.join(directory, fullFilename);
    await fsPromises.writeFile(filePath, content, 'utf-8');
    console.log(`Saved content to ${filePath}`);
  } catch (error) {
    console.error(`Error saving content to file: ${error}`);
    throw error;
  }
};

export const sendDailyReport = async (): Promise<void> => {
  try {
    const gatheredArticles = await getNewspaperArticles();
    const processedArticles = await processNewspaperArticles(gatheredArticles);
    console.log("Processed articles");

    const jamstockexLinks = await getJamstockexDailyLinks();
    console.log("Jamstockex links fetched");

    const stockSummaries = await getDailyStockSummaries();
    console.log("Stock summaries fetched");

    await generateAndSendEmail(processedArticles, jamstockexLinks, stockSummaries);
    console.log("Email sent successfully");

  } catch (error) {
    console.error("Error sending report:", error);
    throw error;
  } finally {
    // Clean up
    await closeBrowser();
    await clearScrapedArticles();
  }
};

