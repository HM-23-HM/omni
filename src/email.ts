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
} from "./scraping.ts";
import { getClassifiedSummaries } from "./summarizing.ts";
import { clearPageContent, clearScrapedArticles } from "./utils/cleanup.ts";
import { EMAIL_CONFIG } from "./utils/constants.ts";
import { log } from "./utils/logging.ts";
import { stripCodeMarkers } from "./utils/parsing.ts";
import {
  ArticleSource,
  ProcessedArticles,
  RankedArticle,
  StockData,
} from "./utils/types.ts";

const lpTemplate = fs.readFileSync(
  path.join(process.cwd(), `./src/templates/lp-section.html`),
  "utf8"
);
const hpTemplate = fs.readFileSync(
  path.join(process.cwd(), `./src/templates/hp-section.html`),
  "utf8"
);
const stockSummaryTemplate = fs.readFileSync(
  path.join(process.cwd(), `./src/templates/daily/stock-summary.html`),
  "utf8"
);

const oAuth2Client = new google.auth.OAuth2(
  EMAIL_CONFIG.CLIENT_ID,
  EMAIL_CONFIG.CLIENT_SECRET,
  EMAIL_CONFIG.OAUTH_PLAYGROUND_URL
);
oAuth2Client.setCredentials({
  refresh_token: EMAIL_CONFIG.OAUTH2_REFRESH_TOKEN,
});

const getAccessToken = async (): Promise<string> => {
  try {
    const { token } = await oAuth2Client.getAccessToken();
    if (!token) {
      throw new Error("Failed to obtain access token");
    }
    return token;
  } catch (error) {
    log("Error getting access token: " + error, true);
    throw error;
  }
};

/**
 * Generates an HTML string from a list of ranked articles.
 * @param sections The list of ranked articles.
 * @param priority The priority of the section. High priority (hp) or low priority (lp).
 * @returns The HTML string.
 */
export const generateDailyNewsHtml = (
  sections: RankedArticle[],
  priority: "hp" | "lp"
): string => {
  const template = priority === "hp" ? hpTemplate : lpTemplate;
  const compiledTemplate = handlebars.compile(template);
  return compiledTemplate({ sections });
};

export const generateDailyJamstockexHtml = (
  sections: ArticleSource[]
): string => {
  const compiledTemplate = handlebars.compile(lpTemplate);
  return compiledTemplate({ sections });
};

export const generateDailyStockSummaryHtml = (
  sections: StockData[]
): string => {
  const compiledTemplate = handlebars.compile(stockSummaryTemplate);
  return compiledTemplate({ sections });
};

export const sendEmail = async (
  html: string,
  subject: string = "Daily Report"
) => {
  try {
    const accessToken = await getAccessToken();
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
  } catch (error) {
    log("Error sending email: " + error, true);
    log(error, true);
    throw error;
  }
};

/**
 * Generates and sends the final report
 * @param newspaperSection The processed articles ready for reporting
 */
export const sendDailyNewsEmail = async (
  newspaperSection: ProcessedArticles
): Promise<void> => {
  const newspaperHpHtml = generateDailyNewsHtml(
    newspaperSection.highPriority,
    "hp"
  );
  log("Generated newspaper high priority html");
  const newspaperLpHtml = generateDailyNewsHtml(
    newspaperSection.lowPriority,
    "lp"
  );
  log("Generated newspaper low priority html");

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

  // Save the combined HTML to a file
  await savePageContent("daily-report.html", combinedHtml);

  await sendEmail(stripCodeMarkers(combinedHtml));
};

export const sendJamstockexEmail = async (
  jamstockexLinks: ArticleSource[],
  stockSummaries: StockData[]
): Promise<void> => {
  const jamstockexHtml = generateDailyJamstockexHtml(jamstockexLinks);
  log("Generated jamstockex html");
  const stockSummaryHtml = generateDailyStockSummaryHtml(stockSummaries);
  log("Generated stock summary html");

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
  await sendEmail(stripCodeMarkers(combinedHtml), "Daily Jamstockex Report");
};

export const sendDailyNewsReport = async (): Promise<void> => {
  try {
    const gatheredArticles = await getNewspaperArticles();
    const processedArticles = await getClassifiedSummaries(gatheredArticles);
    log("Processed articles");

    await sendDailyNewsEmail(processedArticles);

    log("Email sent successfully");
  } catch (error) {
    log("Error sending daily news report [sendDailyNewsReport]:" + error, true);
    throw error;
  } finally {
    // Clean up
    await closeBrowser();
    await clearScrapedArticles();
    await clearPageContent();
  }
};

export const sendDailyJamstockexReport = async (): Promise<void> => {
  try {
    log("Getting proxy");
    const proxy = await getProxy();
    log("Got proxy: " + proxy);

    const jamstockexLinks = await getJamstockexDailyLinks(proxy);
    log("Jamstockex links fetched");

    const stockSummaries = await getDailyStockSummaries(proxy);
    log("Stock summaries fetched");

    await sendJamstockexEmail(jamstockexLinks, stockSummaries);
  } catch (error) {
    log("Error sending jamstockex report:" + error, true);
    throw error;
  } finally {
    await closeBrowser();
    await clearScrapedArticles();
    await clearPageContent();
  }
};
