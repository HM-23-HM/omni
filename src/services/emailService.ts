import * as fs from "fs";
import { google } from "googleapis";
import handlebars from "handlebars";
import nodemailer from "nodemailer";
import Mail from "nodemailer/lib/mailer/index.js";
import * as path from "path";
import {
  closeBrowser,
  getDailyStockSummaries,
  getJamstockexDailyLinks,
  getNewspaperArticles,
  getProxy,
  savePageContent,
} from "../scraping.ts";
import { getClassifiedSummaries } from "../summarizing.ts";
import { clearPageContent, clearScrapedArticles } from "../utils/cleanup.ts";
import { EMAIL_CONFIG } from "../utils/constants.ts";
import { logger } from "../services/logger.ts";
import { stripCodeMarkers } from "../utils/parsing.ts";
import {
  ArticleSource,
  ProcessedArticles,
  RankedArticle,
  StockData,
} from "../utils/types.ts";

/**
 * A singleton service that handles all email-related operations including
 * template management, email sending, and report generation.
 */
class EmailService {
  private static instance: EmailService;
  private oAuth2Client: any;
  private templates: {
    lp: string;
    hp: string;
    stockSummary: string;
  } = {
    lp: "",
    hp: "",
    stockSummary: ""
  };

  private constructor() {
    this.initializeOAuth();
    this.loadTemplates();
  }

  public static getInstance(): EmailService {
    if (!EmailService.instance) {
      EmailService.instance = new EmailService();
    }
    return EmailService.instance;
  }

  private initializeOAuth() {
    this.oAuth2Client = new google.auth.OAuth2(
      EMAIL_CONFIG.CLIENT_ID,
      EMAIL_CONFIG.CLIENT_SECRET,
      EMAIL_CONFIG.OAUTH_PLAYGROUND_URL
    );
    this.oAuth2Client.setCredentials({
      refresh_token: EMAIL_CONFIG.OAUTH2_REFRESH_TOKEN,
    });
  }

  private loadTemplates() {
    this.templates = {
      lp: fs.readFileSync(
        path.join(process.cwd(), `./src/templates/lp-section.html`),
        "utf8"
      ),
      hp: fs.readFileSync(
        path.join(process.cwd(), `./src/templates/hp-section.html`),
        "utf8"
      ),
      stockSummary: fs.readFileSync(
        path.join(process.cwd(), `./src/templates/daily/stock-summary.html`),
        "utf8"
      ),
    };
  }

  private async getAccessToken(): Promise<string> {
    try {
      const { token } = await this.oAuth2Client.getAccessToken();
      if (!token) {
        throw new Error("Failed to obtain access token");
      }
      return token;
    } catch (error) {
      logger.error("Error getting access token: " + error);
      throw error;
    }
  }

  public generateDailyNewsHtml(
    sections: RankedArticle[],
    priority: "hp" | "lp"
  ): string {
    const template = priority === "hp" ? this.templates.hp : this.templates.lp;
    const compiledTemplate = handlebars.compile(template);
    return compiledTemplate({ sections });
  }

  public generateDailyJamstockexHtml(sections: ArticleSource[]): string {
    const compiledTemplate = handlebars.compile(this.templates.lp);
    return compiledTemplate({ sections });
  }

  public generateDailyStockSummaryHtml(sections: StockData[]): string {
    const compiledTemplate = handlebars.compile(this.templates.stockSummary);
    return compiledTemplate({ sections });
  }

  public async sendEmail(
    html: string,
    subject: string = "Daily Report",
    maxRetries: number = 3
  ): Promise<void> {
    let attempts = 0;

    while (attempts < maxRetries) {
      try {
        const accessToken = await this.getAccessToken();
        const transporter = nodemailer.createTransport({
          service: "gmail",
          auth: {
            type: "OAuth2",
            user: EMAIL_CONFIG.EMAIL_USER,
            clientId: EMAIL_CONFIG.CLIENT_ID,
            clientSecret: EMAIL_CONFIG.CLIENT_SECRET,
            refreshToken: EMAIL_CONFIG.OAUTH2_REFRESH_TOKEN,
            accessToken,
          },
        });

        const mailOptions: Mail.Options = {
          from: EMAIL_CONFIG.EMAIL_USER,
          to: EMAIL_CONFIG.EMAIL_RECIPIENT,
          subject,
          html,
        };

        await transporter.sendMail(mailOptions);
        return;
      } catch (error) {
        attempts++;
        logger.error(`Email send attempt ${attempts} of ${maxRetries} failed: ${error}`);

        if (attempts === maxRetries) {
          throw error;
        }

        const waitTime = Math.min(1000 * Math.pow(2, attempts), 30000);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  private async sendDailyNewsEmail(
    newspaperSection: ProcessedArticles
  ): Promise<void> {
    const newspaperHpHtml = this.generateDailyNewsHtml(
      newspaperSection.highPriority,
      "hp"
    );
    logger.log("Generated newspaper high priority html");
    const newspaperLpHtml = this.generateDailyNewsHtml(
      newspaperSection.lowPriority,
      "lp"
    );
    logger.log("Generated newspaper low priority html");

    const combinedHtml = `
      <div class="newspaper-section">
        <h2>Newspaper - High Priority</h2>
        ${newspaperHpHtml}
      </div>
      <div class="newspaper-section">
        <h2>Newspaper - Low Priority</h2>
        ${newspaperLpHtml}
      </div>
    `;

    await savePageContent("daily-report.html", combinedHtml);
    await this.sendEmail(stripCodeMarkers(combinedHtml));
  }

  private async sendJamstockexEmail(
    jamstockexLinks: ArticleSource[],
    stockSummaries: StockData[]
  ): Promise<void> {
    const jamstockexHtml = this.generateDailyJamstockexHtml(jamstockexLinks);
    logger.log("Generated jamstockex html");
    const stockSummaryHtml = this.generateDailyStockSummaryHtml(stockSummaries);
    logger.log("Generated stock summary html");

    const combinedHtml = `
      <div class="jamstockex-section">
        <h2>Jamstockex Daily</h2>
        ${jamstockexHtml}
      </div>
      <div class="stock-summary-section">
        <h2>JSE Stock Summary</h2>
        ${stockSummaryHtml}
      </div>
    `;

    await savePageContent("daily-report-jamstockex.html", combinedHtml);
    await this.sendEmail(stripCodeMarkers(combinedHtml), "Daily Jamstockex Report");
  }

  public async sendDailyNewsReport(): Promise<void> {
    try {
      const gatheredArticles = await getNewspaperArticles();
      const processedArticles = await getClassifiedSummaries(gatheredArticles);
      logger.log("Processed articles");

      await this.sendDailyNewsEmail(processedArticles);

      logger.log("Email sent successfully");
    } catch (error) {
      logger.error("Error sending daily news report [sendDailyNewsReport]:" + error);
      throw error;
    } finally {
      await closeBrowser();
      await clearScrapedArticles();
      await clearPageContent();
    }
  }

  public async sendDailyJamstockexReport(): Promise<void> {
    try {
      logger.log("Getting proxy");
      const proxy = await getProxy();
      logger.log("Got proxy: " + proxy);

      const jamstockexLinks = await getJamstockexDailyLinks(proxy);
      logger.log("Jamstockex links fetched");

      const stockSummaries = await getDailyStockSummaries(proxy);
      logger.log("Stock summaries fetched");

      await this.sendJamstockexEmail(jamstockexLinks, stockSummaries);
    } catch (error) {
      logger.error("Error sending jamstockex report:" + error);
      throw error;
    } finally {
      await closeBrowser();
      await clearScrapedArticles();
      await clearPageContent();
    }
  }
}

export const emailService = EmailService.getInstance();
