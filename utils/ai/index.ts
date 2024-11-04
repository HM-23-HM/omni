import * as fs from "fs";
import * as yaml from "js-yaml";
import axiosClient from "../network/index.ts";

export interface Config {
  websites: string[];
  prompts: {
    rank: string;
    summarize: string;
  };
}

type PromptStage = "rank" | "summarize";

interface LlamaResponse {
    model: string;
    created_at: string;
    response: string;
    done: boolean;
    done_reason: string;
    context: number[];
    total_duration: number;
    load_duration: number;
    prompt_eval_count: number;
    prompt_eval_duration: number;
    eval_count: number;
    eval_duration: number;
}

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

/**
 * Builds a prompt string by combining instruction and input with delimited content
 * @param instruction - The instruction/task to perform
 * @param content - The content to process, will be wrapped in triple backticks
 * @returns Formatted prompt string
 */
export const buildPrompt = (stage: PromptStage, content: string): string => {
    const instruction = getInstruction(stage);
    return `${instruction}\n\`\`\`\n${content}\n\`\`\``;
};

export const sendPrompt = async (prompt: string): Promise<LlamaResponse> => {
    const response = await axiosClient.post("/", {
        prompt,
        model: "llama3.2",
        temperature: 0.7,
        max_tokens: 100,
        stream: false
    });
    return response.data;
};