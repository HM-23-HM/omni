import * as fsPromises from "fs/promises";
import { scrapeTopStories } from "./scraping.ts";
import { aiService } from "./utils/ai.ts";
import { newspaperSourceToCleanerFn } from "./utils/parsing.ts";
import { ProcessedArticles, RankedArticle } from "./utils/types.ts";

/**
 * Generates summaries for the top headlines and returns the list of ranked articles with summaries.
 * @param hpArticles The list of high priority ranked articles to summarize.
 * @returns The list of ranked articles with summaries.
 */
export const getNewspaperSummaries = async (
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
 * Processes the gathered articles by scraping content and generating summaries
 * @param articles The raw gathered articles
 * @returns Processed articles with summaries
 */
export const processNewspaperArticles = async (
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
