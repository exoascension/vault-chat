import {ChatCompletionResponseMessage, Configuration, OpenAIApi} from "openai";
import { Vector } from "./VectorStore";
import {ChatCompletionRequestMessage, CreateChatCompletionResponse} from "openai/api";

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
	
	createEmbedding = async (fileText: string): Promise<Vector | undefined> => {
		let truncatedText = fileText.substring(0, maxInputLength)
		try {
			const entry = await this.openai.createEmbedding({
				// there is a 1 Gb limit on the input
				model: "text-embedding-ada-002",
				input: truncatedText
			});
			return entry.data.data[0].embedding
		} catch (e) {
			console.error(`Error during createEmbedding call: ${JSON.stringify(e)}`)
			return undefined
		}
	}

	createChatCompletion = async (messages: Array<ChatCompletionRequestMessage>): Promise<CreateChatCompletionResponse> => {
		const response = await this.openai.createChatCompletion({
			"model": "gpt-3.5-turbo",
			messages
		});
		return response.data
	}
}
