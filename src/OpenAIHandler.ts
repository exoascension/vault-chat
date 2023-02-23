import { Configuration, OpenAIApi } from "openai";
import { Vector } from "./VectorStore";

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
		const entry = await openai.createEmbedding({
			// there is a 1 Gb limit on the input
			model: "text-embedding-ada-002",
			input: fileText
		});
		const embedding = entry.data.data[0].embedding
		return embedding
	}
}