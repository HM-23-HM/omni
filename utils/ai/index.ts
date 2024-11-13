import { GoogleGenerativeAI } from "@google/generative-ai";
import * as fs from "fs";
import * as yaml from "js-yaml";
import { CONFIG_FILE_PATH } from "../constants/index.ts";
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

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

type Frequency = "DAILY" | "DAY_OF_WEEK" | "WEEKLY" | "MONTHLY" | "QUARTERLY";
type SourceType = "NEWSPAPERS" | "JAMSTOCKEX" | "STOCK";

type PromptStage = "ingest" | "summarize";

const fileContents = fs.readFileSync(CONFIG_FILE_PATH, "utf8");
const config = yaml.load(fileContents) as Config;

    /**
     * Get the prompt for a given stage from the config file
     * @param stage - The stage of the prompt to get
     * @returns The prompt for the given stage
     */
    const getInstruction = (stage: PromptStage, type: SourceType, frequency: Frequency = "DAILY") => {
  const instruction = config.prompts.DAILY[type][stage]  ;
  if (!instruction) {
    throw new Error(`Prompt for stage ${stage} not found`);
  }
  return instruction;
};

const formatPrompt = (header: string, content: string) => {
  return `${header}\n\`\`\`\n${content}\n\`\`\``;
}

/**
 * Builds a prompt string by combining instruction and input with delimited content
 * @param instruction - The instruction/task to perform
 * @param content - The content to process, will be wrapped in triple backticks
 * @returns Formatted prompt string
 */
const buildPrompt = (stage: PromptStage, content: string, type: SourceType, frequency: Frequency = "DAILY"): string => {
  const instruction = getInstruction(stage, type, frequency);
  return formatPrompt(instruction, content);
};

export const sendPrompt = async (
  stage: PromptStage,
  content: string,
  type: SourceType,
  frequency: Frequency = "DAILY",
  waitFor: number = 10, // default wait time in minutes
  maxRetries: number = 3 // maximum number of retries
): Promise<string> => {
  console.log({ length: content.length });
  const prompt = buildPrompt(stage, content, type, frequency);
  let attempts = 0;

  while (attempts < maxRetries) {
    try {
      if (attempts > 0) {
        console.log(`Retrying...`);
      }
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (err: any) {
      if (err.status === 429) {
        attempts++;
        console.error(`429 Too Many Requests. Attempt ${attempts} of ${maxRetries}. Retrying in ${waitFor} minutes...`);
        await new Promise(resolve => setTimeout(resolve, waitFor * 60 * 1000));
      } else {
        console.error(err);
        throw err;
      }
    }
  }

  throw new Error(`Failed to generate content after ${maxRetries} attempts due to 429 errors.`);
};
