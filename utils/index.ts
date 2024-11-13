import * as fsPromises from "fs/promises";
import { sendPrompt } from "./ai/index.ts";
import { generateHtml, sendEmail } from "./email/index.ts";
import {
  closeBrowser,
  getFullPage,
  getDailySourcesToIngest,
  RankedArticle,
  scrapeTopStories,
  separateArticlesByPriority,
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
 * @param articles The processed articles ready for reporting
 */
const generateReport = async (articles: ProcessedArticles): Promise<void> => {
  const highPriorityHtml = generateHtml(articles.highPriority, "hp");
  const lowPriorityHtml = generateHtml(articles.lowPriority, "lp");

  const combinedHtml = `
    <div class="high-priority-section">
      ${highPriorityHtml}
    </div>
    <div class="low-priority-section">
      ${lowPriorityHtml}
    </div>
  `;

  await sendEmail(combinedHtml);
};

export const sendReport = async (): Promise<void> => {
  try {
    const gatheredArticles = await getNewspaperArticles();
    const processedArticles = await processArticles(gatheredArticles);
    await generateReport(processedArticles);
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

