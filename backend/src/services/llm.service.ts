import axios, {
  AxiosInstance,
} from "axios";

import { env } from "../config/env";

export class LLMService {
  private readonly client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: env.llm.baseUrl,

      headers: {
        Authorization: `Bearer ${env.llm.apiKey}`,
        "Content-Type": "application/json",
      },

      timeout: env.llm.requestTimeoutMs,
    });
  }

  async generate(
    systemPrompt: string,
    userPrompt: string,
  ): Promise<string> {
    const response =
      await this.client.post("/chat/completions", {
        model: env.llm.model,

        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],

        temperature: 0.1,
      });

    return response.data.choices[0].message.content;
  }
}