import puppeteer, { Browser } from 'puppeteer';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { Config } from '../ai/index.ts';    
import * as fs from "fs";
import * as yaml from "js-yaml";

export interface RankedArticle {
    headline: string;
    priority: number;
    link: string;
    summary?: string;
}


let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
    if (!browserInstance) {
        browserInstance = await puppeteer.launch();
    }
    return browserInstance;
}

/**
 * Get the HTML full page content from a given URL
 * @param url - The URL to get the full page content from
 * @returns The full page content
 */
export async function getFullPage(url: string) {
    const browser = await getBrowser();
    const page = await browser.newPage();

    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const pageContent = await page.content();
    await page.close();

    return pageContent;
}

export async function closeBrowser() {
    if (browserInstance) {
        await browserInstance.close();
        browserInstance = null;
    }
}

/**
 * Scrape the top 3 headlines from the list of ranked headlines.
 * @param headlines - The list of ranked headlines.
 * @param numHeadlines - The number of headlines to scrape. Defaults to 3.
 */
export async function scrapeTopStories(headlines: RankedArticle[], numHeadlines: number = 3): Promise<void> {
    try {
        // Sort headlines by priority (assuming lower number means higher priority)
        const sortedHeadlines = headlines.sort((a, b) => a.priority - b.priority);
        const topHeadlines = sortedHeadlines.slice(0, numHeadlines);

        const outputDir = path.join(process.cwd(), 'scraped-articles');
        await fsPromises.mkdir(outputDir, { recursive: true });

        const scrapePromises = topHeadlines.map(async (headline) => {
            try {
                const content = await getFullPage(headline.link);

                const safeFilename = headline.headline
                    .replace(/[^a-z0-9]/gi, '_')
                    .toLowerCase()
                    .replace(/_+/g, '_')
                    .trim();

                const filePath = path.join(outputDir, `${safeFilename}.txt`);
                await fsPromises.writeFile(filePath, content, 'utf-8');

                console.log(`Successfully scraped: ${headline.headline}`);
            } catch (error) {
                console.error(`Failed to scrape ${headline.headline}:`, error);
            }
        });

        await Promise.all(scrapePromises);

    } catch (error) {
        console.error('Error in scrapeTopStories:', error);
        throw error;
    }
}

/**
 * Get the websites to ingest from the config file
 * @returns The list of websites to ingest
 */
export const getWebsitesToIngest = () => {
    const config = yaml.load(fs.readFileSync("./config.yml", "utf8")) as Config;
    return config.websites; 
}