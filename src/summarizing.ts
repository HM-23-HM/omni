import * as fsPromises from "fs/promises";
import { scrapeTopStories } from "./scraping.ts";
import { aiService } from "./services/AIService.ts";
import { logger } from "./utils/logging.ts";
import { newspaperSourceToCleanerFn } from "./utils/parsing.ts";
import { ProcessedArticles, RankedArticle } from "./utils/types.ts";

/**
 * Generates summaries for the top headlines and returns the list of ranked articles with summaries.
 * @param hpArticles The list of high priority ranked articles to summarize.
 * @returns The list of ranked articles with summaries.
 * @throws Error if article path is missing or content cannot be read
 */
export const getHeadlinesWithSummaries = async (
  hpArticles: RankedArticle[]
): Promise<RankedArticle[]> => {
  const headlinesWithSummaries: RankedArticle[] = [];
  
  for (const headline of hpArticles) {
    if (!headline.path) {
      continue;
    }

    const pageContent = await fsPromises.readFile(headline.path, "utf-8");
    
    if (!newspaperSourceToCleanerFn[headline.source as keyof typeof newspaperSourceToCleanerFn]) {
      throw new Error(`No cleaner function found for source: ${headline.source}`);
    }

    const cleanedHtml = newspaperSourceToCleanerFn[
      headline.source as keyof typeof newspaperSourceToCleanerFn
    ](pageContent);

    const summary = await aiService.sendPrompt(
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

/**
 * Processes the gathered articles by scraping content and generating summaries.
 * The summaries are classified as either high priority or low priority.
 * @param articles The raw gathered articles
 * @returns Processed articles with summaries
 */
export const getClassifiedSummaries = async (
  articles: ProcessedArticles
): Promise<ProcessedArticles> => {
  try {
    const highPriorityWithPaths = await scrapeTopStories(articles.highPriority);
    const highPriorityWithSummaries = await getHeadlinesWithSummaries(
      highPriorityWithPaths
    );

    return {
      highPriority: highPriorityWithSummaries,
      lowPriority: articles.lowPriority,
    };
  } catch (error) {
    logger.error(`Failed to classify summaries: ${error instanceof Error ? error.message : 'Unknown error'}`);
    throw error;
  }
};
