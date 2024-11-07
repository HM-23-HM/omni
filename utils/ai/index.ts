import { GoogleGenerativeAI } from "@google/generative-ai";
import * as fs from "fs";
import * as yaml from "js-yaml";
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

export interface Config {
  websites: string[];
  prompts: {
    rank: string;
    summarize: string;
  };
  higherOrderPrompts: {
    chunksThenInstruction: string;
  };
}

type PromptStage = "rank" | "summarize";

const fileContents = fs.readFileSync("./config.yml", "utf8");
const config = yaml.load(fileContents) as Config;

/**
 * Get the prompt for a given stage from the config file
 * @param stage - The stage of the prompt to get
 * @returns The prompt for the given stage
 */
const getInstruction = (stage: PromptStage) => {
  const instruction = config.prompts[stage];
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
const buildPrompt = (stage: PromptStage, content: string): string => {
  const instruction = getInstruction(stage);
  return formatPrompt(instruction, content);
};

export const sendPrompt = async (
  stage: PromptStage,
  content: string
): Promise<string> => {
  console.log({ length: content.length })
  const prompt = buildPrompt(stage, content);
  const result = await model.generateContent(prompt);
  return result.response.text();
};
