import { emailService } from "./services/EmailService.ts";
import {
  ArticleSource,
  RankedArticle,
  StockData,
} from "./utils/types.ts";

// Export public functions that use the singleton service
export const sendDailyNewsReport = async (): Promise<void> => {
  return emailService.sendDailyNewsReport();
};

export const sendDailyJamstockexReport = async (): Promise<void> => {
  return emailService.sendDailyJamstockexReport();
};

export const sendEmail = async (
  html: string,
  subject: string = "Daily Report",
  maxRetries: number = 3
): Promise<void> => {
  return emailService.sendEmail(html, subject, maxRetries);
};

export const generateDailyNewsHtml = (
  sections: RankedArticle[],
  priority: "hp" | "lp"
): string => {
  return emailService.generateDailyNewsHtml(sections, priority);
};

export const generateDailyJamstockexHtml = (
  sections: ArticleSource[]
): string => {
  return emailService.generateDailyJamstockexHtml(sections);
};

export const generateDailyStockSummaryHtml = (
  sections: StockData[]
): string => {
  return emailService.generateDailyStockSummaryHtml(sections);
};
