import { parseJSON } from "ollama/src/utils.js";
import { sendPrompt } from "./ai/index.ts";
import { getFullPage, getWebsitesToIngest, RankedArticle, scrapeTopStories } from "./ingestion/index.ts";
import { parseJsonString } from "./parsing/index.ts";
import * as fsPromises from "fs/promises";


/**
 * Generates summaries for the top headlines and returns the list of ranked articles with summaries.
 * @param rankedArticles The list of ranked articles to summarize.
 * @returns The list of ranked articles with summaries.
 */
const getSummaries = async (rankedArticles: RankedArticle[]): Promise<RankedArticle[]> => {
    const topHeadlines = rankedArticles.filter(article => !!article.path);
    const otherHeadlines = rankedArticles.filter(article => !article.path);

    const headlinesWithSummaries: RankedArticle[] = [];

    await Promise.all(topHeadlines.map(async (headline) => {
        const pageContent = await fsPromises.readFile(headline.path!, 'utf-8');
        const summary = await sendPrompt("summarize", pageContent);
        headlinesWithSummaries.push({
            ...headline,
            summary
        });
    }));

    return [...headlinesWithSummaries, ...otherHeadlines];
}

export const generateReport = async () => {
    const websites = getWebsitesToIngest();
    const sections: RankedArticle[] = [];
    for (const website of websites) {
        const homePageContent = await getFullPage(website);
        const llmResponse = await sendPrompt("rank", homePageContent);
        const rankedArticles: RankedArticle[] = parseJsonString(llmResponse);

        const rankedArticlesWithPaths = await scrapeTopStories(rankedArticles);
        const rankedArticlesWithSummaries = await getSummaries(rankedArticlesWithPaths);
        sections.push(...rankedArticlesWithSummaries);
    }

    // Exporting
}

/**
 * Generates chunks of text from a string, yielding each chunk of specified size
 * @param html The HTML to split into chunks
 * @param maxChunkSize Maximum size of each chunk in characters
 * @yields Each chunk of text
 */
export function* chunkTextGenerator(html: string, maxChunkSize: number): Generator<string> {
    // Handle edge cases
    if (!html) return;
    if (maxChunkSize <= 0) throw new Error('Chunk size must be positive');
    if (html.length <= maxChunkSize) {
        yield html;
        return;
    }

    let start = 0;
    while (start < html.length) {
        const end = Math.min(start + maxChunkSize, html.length);
        yield html.slice(start, end);
        start += maxChunkSize;
    }
}

const testHtml = `
<article class="main-content">
    <header>
        <h1>Understanding the Impact of Artificial Intelligence on Modern Society</h1>
        <div class="metadata">Published on January 1, 2024</div>
    </header>
    <section class="introduction">
        <p>${"Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(30)}</p>
        <p>${"Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ".repeat(25)}</p>
    </section>
    <section class="main-discussion">
        <h2>The Evolution of AI Technology</h2>
        <p>${"Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris. ".repeat(35)}</p>
        <div class="subsection">
            <h3>Machine Learning Breakthroughs</h3>
            <p>${"Duis aute irure dolor in reprehenderit in voluptate velit esse cillum. ".repeat(20)}</p>
            <p>${"Excepteur sint occaecat cupidatat non proident, sunt in culpa qui. ".repeat(25)}</p>
        </div>
        <div class="subsection">
            <h3>Impact on Daily Life</h3>
            <p>${"Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut. ".repeat(30)}</p>
        </div>
    </section>
    <section class="conclusion">
        <h2>Looking Ahead</h2>
        <p>${"Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet. ".repeat(40)}</p>
        <div class="final-thoughts">
            <p>${"At vero eos et accusamus et iusto odio dignissimos ducimus qui. ".repeat(15)}</p>
        </div>
    </section>
</article>`;

