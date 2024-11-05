import { sendPrompt } from "./ai/index.ts";
import { getFullPage, getWebsitesToIngest, RankedArticle, scrapeTopStories } from "./ingestion/index.ts";


export const generateReport = async () => {
    // Ingestion
    const websites = getWebsitesToIngest();
    // for (const website of websites) {
        const homePageContent = await getFullPage(websites[0]);
        // Ranking
        const llmResponse = await sendPrompt("rank", homePageContent);
        const rankedArticles: RankedArticle[] = JSON.parse(llmResponse);

        console.log({rankedArticles});

        // Summarizing
        await scrapeTopStories(rankedArticles);
    // }

    // Summarizing

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

