import { RankedArticle } from "../ingestion/index.ts";
import * as fs from "fs";
import * as path from "path";
import handlebars from "handlebars";
import nodemailer from "nodemailer";
import Mail from "nodemailer/lib/mailer/index.js";
import { google } from "googleapis";

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
    console.error("Error getting access token:", error);
    throw error;
  }
};

/**
 * Generates an HTML string from a list of ranked articles.
 * @param sections The list of ranked articles.
 * @param priority The priority of the section. High priority (hp) or low priority (lp).
 * @returns The HTML string.
 */
export const generateHtml = (
  sections: RankedArticle[],
  priority: "hp" | "lp"
): string => {
  const template = fs.readFileSync(
    path.join(process.cwd(), `./html-templates/${priority}-section.html`),
    "utf8"
  );
  const compiledTemplate = handlebars.compile(template);
  return compiledTemplate({ sections });
};

export const sendEmail = async (html: string) => {
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
      subject: "Daily Report",
      html,
    };

    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
};
