export interface Config {
  FREQUENCY: {
    DAILY: {
      NEWSPAPERS: string[];
      STOCK: string[];
      JAMSTOCKEX: string[];
    };
    DAY_OF_WEEK: {
      TUESDAY: string[];
    };
    WEEKLY: string[];
    MONTHLY: string[];
    QUARTERLY: string[];
  };
  STOCKS: string[];
  prompts: {
    DAILY: {
      NEWSPAPERS: {
        ingest: string;
        summarize?: string;
      };
      JAMSTOCKEX: {
        ingest: string;
        summarize?: string;
      };
      STOCK: {
        ingest: string;
        summarize?: string;
      };
    };
  };
}

export type Frequency = "DAILY" | "DAY_OF_WEEK" | "WEEKLY" | "MONTHLY" | "QUARTERLY";
export type SourceType = "NEWSPAPERS" | "JAMSTOCKEX" | "STOCK";

export type PromptStage = "ingest" | "summarize";

export interface StockData {
  ticker: string;
  range: string;
  volume: number;
}

export interface ArticleSource {
  headline: string;
  link: string;
}

export interface RankedArticle {
  source: string;
  headline: string;
  link: string;
  path?: string;
  priority: number;
  summary?: string;
}

export interface ProcessedArticles {
  highPriority: RankedArticle[];
  lowPriority: RankedArticle[];
}
