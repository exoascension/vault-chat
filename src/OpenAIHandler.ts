import {Configuration, CreateEmbeddingResponse, OpenAIApi} from "openai";
import { ChatCompletionRequestMessage, CreateChatCompletionResponse } from "openai/api";
import { backOff } from "exponential-backoff";
import pTimeout from 'p-timeout';

// conservative max length - tokens are variable in length (1 token is APPROX 4 chars and max 8191 tokens allowed)
const maxInputLength = 28000
export class OpenAIHandler {
	private openai: OpenAIApi

	constructor(apiKey: string) {
		const configuration = new Configuration({
			apiKey
		});
		this.openai = new OpenAIApi(configuration);
	}

	createEmbeddingBatch = async (data: string[], options = {}): Promise<CreateEmbeddingResponse | undefined> => {
		const truncatedTexts = data.map(s => s.substring(0, maxInputLength))
		try {
			const response = await backOff(() => {
				return pTimeout(this.openai.createEmbedding({
					// there is a 1 Gb limit on the input
					model: "text-embedding-ada-002",
					input: truncatedTexts
				}), { milliseconds: 30000 })
			}, options)
			return response.data
		} catch (e) {
			console.error(`Error during createEmbedding call: ${JSON.stringify(e)}`)
			return undefined
		}
	}

	createChatCompletion = async (messages: Array<ChatCompletionRequestMessage>, options = {}): Promise<CreateChatCompletionResponse | undefined> => {
		try {
			const response = await backOff(() => {
				return pTimeout(this.openai.createChatCompletion({
					"model": "gpt-4",
					messages
				}), { milliseconds: 30000 })
			}, options)
			return response.data
		} catch (e) {
			console.error(`Error during completion call: ${JSON.stringify(e)}`)
			return undefined
		}
	}
}
