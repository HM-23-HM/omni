import * as fsPromises from "fs/promises";
import { sendPrompt } from "./ai/index.ts";
import { generateHtml, sendEmail } from "./email/index.ts";
import {
  closeBrowser,
  getFullPage,
  getWebsitesToIngest,
  RankedArticle,
  scrapeTopStories,
  separateArticlesByPriority,
} from "./ingestion/index.ts";
import { parseJsonString } from "./parsing/index.ts";

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
    const summary = await sendPrompt("summarize", pageContent);
    headlinesWithSummaries.push({
      ...headline,
      summary,
    });
  }

  return headlinesWithSummaries;
};

export const sendReport = async () => {
  const websites = getWebsitesToIngest();
  let allHighPriorityArticles: RankedArticle[] = [];
  let allLowPriorityArticles: RankedArticle[] = [];

  for (const website of websites) {
    const homePageContent = await getFullPage(website);
    const llmResponse = await sendPrompt("rank", homePageContent);
    const rankedArticles: RankedArticle[] = parseJsonString(llmResponse);

    const { highPriority, lowPriority } = separateArticlesByPriority(
      rankedArticles,
      2
    );

    const highPriorityWithPaths = await scrapeTopStories(highPriority);
    const highPriorityWithSummaries = await getSummaries(highPriorityWithPaths);

    allHighPriorityArticles.push(...highPriorityWithSummaries);
    allLowPriorityArticles.push(...lowPriority);
  }

  const highPriorityHtml = generateHtml(allHighPriorityArticles, "hp");
  const lowPriorityHtml = generateHtml(allLowPriorityArticles, "lp");

  const combinedHtml = `
    <div class="high-priority-section">
      ${highPriorityHtml}
    </div>
    <div class="low-priority-section">
      ${lowPriorityHtml}
    </div>
  `;

  await sendEmail(combinedHtml)
    .then(() => console.log("Email sent"))
    .catch(console.error);

  // Clean up
  await closeBrowser();
};

