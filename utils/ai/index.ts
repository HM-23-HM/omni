import * as fs from "fs";
import * as yaml from "js-yaml";
import ollama from "ollama";
import { chunkTextGenerator } from "../index.ts";

const ollamaClient = ollama as any;
const model = "mistral"


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
  const higherOrderPrompt = config.higherOrderPrompts.chunksThenInstruction;
  const messages = [{ role: "user", content: higherOrderPrompt }];
  
  const firstResponse = await ollamaClient.chat({
    model,
    messages: messages,
    keep_alive: 240000
  });
  
  // Add the response to our message history
  messages.push(firstResponse.message);
  
  const value = firstResponse.message.content;
  console.log({ value });

  if (Number.parseInt(value) === 7) {
    console.log("Proceeding with the next stage");

    let index = 0;
    for (const chunk of chunkTextGenerator(content, 8000)) {
      console.log({ index, chunk });
      // Add each chunk as a new message

      const formattedChunk = formatPrompt(`CHUNK ${index}`, chunk);

      messages.push({ role: "user", content: formattedChunk });

      console.log({ messages });
      
      const response = await ollamaClient.chat({
        model,
        messages: messages, // Pass the full conversation history
        keep_alive: 240000
      });
      messages.push(response.message);
      
      index++;
    }

    // Send instruction to llm
    messages.push({ role: "user", content: getInstruction(stage) });

    console.log({ finalMessages: messages });

    const finalResponse = await ollamaClient.chat({
      model,
      messages: messages,
      keep_alive: 240000
    });

    return finalResponse.message.content;
  } else { 
    console.log("The instruction was not understood")
  }

  return "";
};
