import puppeteer, { Browser } from "puppeteer";
import { logger } from "../utils/logging.js";

class BrowserService {
  private static instance: BrowserService | null = null;
  private browser: Browser | null = null;

  private constructor() {}

  public static getInstance(): BrowserService {
    if (!BrowserService.instance) {
      BrowserService.instance = new BrowserService();
    }
    return BrowserService.instance;
  }

  async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        args: ["--no-sandbox"],
        acceptInsecureCerts: true,
      });
    }
    return this.browser;
  }

  async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async scrape(url: string): Promise<string> {
    try {
      const browser = await this.getBrowser();
      const page = await browser.newPage();
  
      await page.setViewport({
        width: 1920,
        height: 1080,
      });
  
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
      );
  
      await page.setExtraHTTPHeaders({
        "Accept-Language": "en-US,en;q=0.9",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      });
  
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 1200000 });
      const pageContent = await page.content();
      await page.close();
  
      return pageContent;
    } catch (error) {
      logger.error(`An error occurred while scraping the url: ${error}`);
      throw error;
    }
  }
}

export const browserService = BrowserService.getInstance();
