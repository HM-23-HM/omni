export const HIGH_PRIORITY_COUNT = 3;
export const SCRAPED_ARTICLES_DIR = "scraped-articles";
export const PAGE_CONTENT_DIR = "page-content";
export const CONFIG_FILE_PATH = "./src/configs/main.yml";
export const PROXY_API_TOKEN = process.env.PROXY_API_TOKEN;
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY as string;
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";

// Email Configuration
export const EMAIL_CONFIG = {
  CLIENT_ID: process.env.CLIENT_ID as string,
  CLIENT_SECRET: process.env.CLIENT_SECRET as string,
  OAUTH2_REFRESH_TOKEN: process.env.OAUTH2_REFRESH_TOKEN as string,
  EMAIL_USER: process.env.EMAIL_USER as string,
  EMAIL_RECIPIENT: process.env.EMAIL_RECIPIENT as string,
  OAUTH_PLAYGROUND_URL: "https://developers.google.com/oauthplayground"
} as const;