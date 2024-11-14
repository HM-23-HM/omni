import * as fsPromises from "fs/promises";
import { sendPrompt } from "./ai/index.ts";
import { generateDailyNewsHtml, generateJamstockexHtml, sendEmail } from "./email/index.ts";
import {
  closeBrowser,
  getFullPage,
  getDailySourcesToIngest,
  RankedArticle,
  scrapeTopStories,
  separateArticlesByPriority,
  ArticleSource,
} from "./ingestion/index.ts";
import { parseJsonString } from "./parsing/index.ts";
import * as path from "path";
import { HIGH_PRIORITY_COUNT, SCRAPED_ARTICLES_DIR } from "./constants/index.ts";

/**
 * Generates summaries for the top headlines and returns the list of ranked articles with summaries.
 * @param hpArticles The list of high priority ranked articles to summarize.
 * @returns The list of ranked articles with summaries.
 */
const getSummaries = async (
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
  const llmResponse = await sendPrompt("ingest", pageContent, "JAMSTOCKEX", "DAILY");
  const rankedArticles: ArticleSource[] = parseJsonString(llmResponse);
  return rankedArticles;
}

/**
 * Processes the gathered articles by scraping content and generating summaries
 * @param articles The raw gathered articles
 * @returns Processed articles with summaries
 */
const processArticles = async (articles: ProcessedArticles): Promise<ProcessedArticles> => {
  const highPriorityWithPaths = await scrapeTopStories(articles.highPriority);
  const highPriorityWithSummaries = await getSummaries(highPriorityWithPaths);

  return {
    highPriority: highPriorityWithSummaries,
    lowPriority: articles.lowPriority
  };
};

/**
 * Generates and sends the final report
 * @param newspaperSection The processed articles ready for reporting
 */
const generateAndSendEmail = async (newspaperSection: ProcessedArticles, jamstockexLinks: ArticleSource[]): Promise<void> => {
  const highPriorityHtml = generateDailyNewsHtml(newspaperSection.highPriority, "hp");
  const lowPriorityHtml = generateDailyNewsHtml(newspaperSection.lowPriority, "lp");
  const jamstockexHtml = generateJamstockexHtml(jamstockexLinks);

  const combinedHtml = `
    <div class="high-priority-section">
      <h2>Newspapers (High Priority)</h2>
      ${highPriorityHtml}
    </div>
    <div class="jamstockex-section">
      <h2>Jamstockex</h2>
      ${jamstockexHtml}
    </div>
    <div class="low-priority-section">
      <h2>Newspapers (Low Priority)</h2>
      ${lowPriorityHtml}
    </div>
  `;

  await sendEmail(combinedHtml);
};

export const sendDailyReport = async (): Promise<void> => {
  try {
    const gatheredArticles = await getNewspaperArticles();
    const processedArticles = await processArticles(gatheredArticles);
    const jamstockexLinks = await getJamstockexDailyLinks();
    await generateAndSendEmail(processedArticles, jamstockexLinks);
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

