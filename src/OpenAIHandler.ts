import { Configuration, OpenAIApi } from "openai";
import { Vector } from "./VectorStore";

// conservative max length - tokens are variable in length (1 token is APPROX 4 chars and max 8191 tokens allowed)
const maxInputLength = 28000
export class OpenAIHandler {
	constructor(apiKey: string) {
		this.apiKey = apiKey
	}

	//should apikey be private?
	apiKey: string
	
	createEmbedding = async (fileText: string): Promise<Vector> => {
		const configuration = new Configuration({
			apiKey: this.apiKey
		});
		const openai = new OpenAIApi(configuration);

		let truncatedText = fileText.substring(0, maxInputLength)
		const entry = await openai.createEmbedding({
			// there is a 1 Gb limit on the input
			model: "text-embedding-ada-002",
			input: truncatedText
		});
		return entry.data.data[0].embedding
	}
}
