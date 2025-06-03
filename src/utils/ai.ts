import { GoogleGenerativeAI } from "@google/generative-ai";
import * as fs from "fs";
import * as yaml from "js-yaml";
import { PROMPTS_FILE_PATH, GEMINI_API_KEY, GEMINI_MODEL } from "./constants.ts";
import { log } from "./logging.ts";
import { SourceType } from "./types.ts";
import { Prompts, PromptStage, Frequency } from "./types.ts";

enum HttpStatus {
  TOO_MANY_REQUESTS = 429,
  SERVICE_UNAVAILABLE = 503
}


class AIService {
  private static instance: AIService;
  private genAI!: GoogleGenerativeAI;
  private model: any;
  private prompts!: Prompts;
  private promptCache: Map<string, string> = new Map();

  private constructor() {
    this.initializeAI();
    this.loadAndValidatePrompts();
  }

  private initializeAI(): void {
    this.genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    this.model = this.genAI.getGenerativeModel({ model: GEMINI_MODEL });
  }

  private loadAndValidatePrompts(): void {
    const fileContents = fs.readFileSync(PROMPTS_FILE_PATH, "utf8");
    const loadedPrompts = yaml.load(fileContents) as Prompts;
    
    if (!loadedPrompts?.prompts?.DAILY) {
      throw new Error("Invalid prompts: missing prompts.DAILY");
    }
    
    if (!loadedPrompts.prompts.DAILY.NEWSPAPERS?.ingest ||
        !loadedPrompts.prompts.DAILY.JAMSTOCKEX?.ingest ||
        !loadedPrompts.prompts.DAILY.STOCK?.ingest) {
      throw new Error("Invalid prompts: missing required prompt configurations");
    }
    
    this.prompts = loadedPrompts;
  }

  public static getInstance(): AIService {
    if (!AIService.instance) {
      AIService.instance = new AIService();
    }
    return AIService.instance;
  }

  private getCacheKey(stage: PromptStage, type: SourceType, frequency: Frequency): string {
    return `${stage}-${type}-${frequency}`;
  }

  private getInstruction(stage: PromptStage, type: SourceType, frequency: Frequency = "DAILY"): string {
    const cacheKey = this.getCacheKey(stage, type, frequency);
    
    if (this.promptCache.has(cacheKey)) {
      return this.promptCache.get(cacheKey)!;
    }

    const instruction = this.prompts.prompts[frequency][type][stage];
    if (!instruction) {
      throw new Error(`Prompt for stage ${stage} not found`);
    }

    this.promptCache.set(cacheKey, instruction);
    return instruction;
  }

  private formatPrompt(header: string, content: string): string {
    return `${header}\n\`\`\`\n${content}\n\`\`\``;
  }

  public buildPrompt(stage: PromptStage, content: string, type: SourceType, frequency: Frequency = "DAILY"): string {
    const instruction = this.getInstruction(stage, type, frequency);
    return this.formatPrompt(instruction, content);
  }

  public async sendPrompt(
    stage: PromptStage,
    content: string,
    type: SourceType,
    frequency: Frequency = "DAILY",
    waitFor: number = 10,
    maxRetries: number = 3
  ): Promise<string> {
    log({ length: content.length, stage, type, frequency });
    const prompt = this.buildPrompt(stage, content, type, frequency);
    let attempts = 0;

    while (attempts < maxRetries) {
      try {
        if (attempts > 0) {
          log(`Retrying...`);
        }
        const result = await this.model.generateContent(prompt);
        return result.response.text();
      } catch (err: any) {
        if (err.status === HttpStatus.TOO_MANY_REQUESTS || err.status === HttpStatus.SERVICE_UNAVAILABLE) {
          attempts++;
          log(err, true);
          log(
            `${err.status} Error. Attempt ${attempts} of ${maxRetries}. Retrying in ${waitFor} minutes...`,
            true
          );
          await new Promise((resolve) => setTimeout(resolve, waitFor * 60 * 1000));
        } else {
          log(err, true);
          throw err;
        }
      }
    }

    throw new Error(
      `Failed to generate content after ${maxRetries} attempts due to rate limiting or service unavailability.`
    );
  }
}

export const aiService = AIService.getInstance();
