import { PAGE_CONTENT_DIR } from "./constants.ts";
import { SCRAPED_ARTICLES_DIR } from "./constants.ts";
import path from "path";
import { log } from "./logging.ts";
import * as fsPromises from "fs/promises";

export const clearScrapedArticles = async () => {
  const directory = path.join(process.cwd(), SCRAPED_ARTICLES_DIR);
  try {
    const files = await fsPromises.readdir(directory);
    for (const file of files) {
      await fsPromises.unlink(path.join(directory, file));
    }
    log("Cleared scraped-articles directory");
  } catch (error) {
    log("Error clearing scraped-articles directory:" + error, true);
  }
};

export const clearPageContent = async () => {
  const directory = path.join(process.cwd(), PAGE_CONTENT_DIR);
  try {
    await fsPromises.rm(directory, { recursive: true });
    log("Cleared page-content directory");
  } catch (error) {
    log("Error clearing page-content directory:" + error, true);
  }
};
