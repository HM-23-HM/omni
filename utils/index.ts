import puppeteer, { Browser } from 'puppeteer';

let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
    if (!browserInstance) {
        browserInstance = await puppeteer.launch();
    }
    return browserInstance;
}

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