import * as fs from "fs";
import { google } from "googleapis";
import handlebars from "handlebars";
import nodemailer from "nodemailer";
import Mail from "nodemailer/lib/mailer/index.js";
import * as path from "path";
import { ArticleSource, RankedArticle, StockData } from "../ingestion/index.ts";
import { log } from "../logging/index.ts";

const lpTemplate = fs.readFileSync(
  path.join(process.cwd(), `./templates/lp-section.html`),
  "utf8"
);
const hpTemplate = fs.readFileSync(
  path.join(process.cwd(), `./templates/hp-section.html`),
  "utf8"
);
const stockSummaryTemplate = fs.readFileSync(
  path.join(process.cwd(), `./templates/daily/stock-summary.html`),
  "utf8"
);

const oAuth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  "https://developers.google.com/oauthplayground"
);
oAuth2Client.setCredentials({
  refresh_token: process.env.OAUTH2_REFRESH_TOKEN,
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
  sections: ArticleSource[],
): string => {
  const compiledTemplate = handlebars.compile(lpTemplate);
  return compiledTemplate({ sections });
};

export const generateDailyStockSummaryHtml = (
  sections: StockData[],
): string => {
  const compiledTemplate = handlebars.compile(stockSummaryTemplate);
  return compiledTemplate({ sections });
};

export const sendEmail = async (html: string, subject: string = "Daily Report") => {
  try {
    const accessToken = await getAccessToken();
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        type: "OAuth2",
        user: process.env.EMAIL_USER,
        clientId: process.env.CLIENT_ID,
        clientSecret: process.env.CLIENT_SECRET,
        refreshToken: process.env.OAUTH2_REFRESH_TOKEN,
        accessToken,
      },
    });

    const mailOptions: Mail.Options = {
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_RECIPIENT,
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
