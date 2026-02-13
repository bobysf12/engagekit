import type { z } from "zod";
import OpenAI from "openai";
import { env } from "../core/config";
import { logger } from "../core/logger";
import { LLMError } from "../core/errors";
import { retryWithBackoff } from "../core/retry";
import type { LLMClient, LLMCallOptions } from "./contracts";

const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_MAX_TOKENS = 2048;
const DEFAULT_TEMPERATURE = 0.3;

export class OpenRouterClient implements LLMClient {
  private client: OpenAI;
  private model: string;

  constructor() {
    if (!env.OPENROUTER_API_KEY) {
      throw new LLMError("OPENROUTER_API_KEY is required", "config_missing_api_key");
    }

    this.client = new OpenAI({
      apiKey: env.OPENROUTER_API_KEY,
      baseURL: env.OPENROUTER_BASE_URL,
      defaultHeaders: {
        "HTTP-Referer": "https://engagekit.local",
        "X-Title": "EngageKit",
      },
    });
    this.model = env.OPENROUTER_MODEL;
  }

  async complete<T>(
    systemPrompt: string,
    userPrompt: string,
    responseSchema: z.ZodSchema<T>,
    options?: LLMCallOptions
  ): Promise<T> {
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const temperature = options?.temperature ?? DEFAULT_TEMPERATURE;
    const maxTokens = options?.maxTokens ?? DEFAULT_MAX_TOKENS;

    const callWithRetry = () =>
      retryWithBackoff(
        () => this.makeRequest(systemPrompt, userPrompt, temperature, maxTokens, timeoutMs),
        {
          maxAttempts: 3,
          baseDelayMs: 1000,
          maxDelayMs: 10000,
          jitterMs: 500,
        },
        "llm_complete"
      );

    const rawContent = await callWithRetry();
    const parsed = this.parseAndValidate(rawContent, responseSchema);
    return parsed;
  }

  private async makeRequest(
    systemPrompt: string,
    userPrompt: string,
    temperature: number,
    maxTokens: number,
    timeoutMs: number
  ): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await this.client.chat.completions.create(
        {
          model: this.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature,
          max_tokens: maxTokens,
        },
        {
          signal: controller.signal,
        }
      );

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new LLMError("No content in response", "empty_response");
      }

      return content;
    } catch (error) {
      if (error instanceof LLMError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new LLMError("Request timed out", "timeout");
      }
      if (error instanceof OpenAI.APIError) {
        logger.error({ status: error.status, message: error.message }, "OpenRouter API error");
        throw new LLMError(`OpenRouter API error: ${error.status}`, `api_error_${error.status}`);
      }
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new LLMError(`Request failed: ${message}`, "request_failed");
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private parseAndValidate<T>(rawContent: string, schema: z.ZodSchema<T>): T {
    let parsed: unknown;
    let jsonStr = rawContent.trim();

    if (jsonStr.startsWith("```")) {
      const lines = jsonStr.split("\n");
      if (lines[0] && lines[0].startsWith("```")) {
        lines.shift();
      }
      const lastLine = lines[lines.length - 1];
      if (lastLine && lastLine.startsWith("```")) {
        lines.pop();
      }
      jsonStr = lines.join("\n").trim();
    }

    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      logger.error({ rawContent, cleaned: jsonStr }, "Failed to parse LLM response as JSON");
      throw new LLMError("Failed to parse response as JSON", "parse_error");
    }

    const result = schema.safeParse(parsed);
    if (!result.success) {
      logger.debug(
        { error: result.error.message, parsed },
        "LLM response validation failed"
      );
      throw new LLMError(
        `Response validation failed: ${result.error.message}`,
        "validation_error"
      );
    }

    return result.data;
  }
}

export const openRouterClient = new OpenRouterClient();
