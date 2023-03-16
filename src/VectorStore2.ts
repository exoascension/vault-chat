import {TFile, Vault} from 'obsidian';
import {Md5} from 'ts-md5';
import {
	ChatCompletionRequestMessage,
	ChatCompletionRequestMessageRoleEnum,
	CreateChatCompletionResponse
} from 'openai/api';
// @ts-ignore
import similarity from 'compute-cosine-similarity';
import {CreateEmbeddingResponse} from "openai";

type Vector = Array<number>
type Chunk = {
	contents: string;
	embedding: Vector;
}
type FileEntry = {
	eTs: number;
	mTs: number;
	md5hash: string;
	fileEmbedding: Vector;
	chunks: Array<Chunk>;
}
type DatabaseFile = {
	version: number;
	mTs: number;
	embeddings: Map<string, FileEntry>;
}
export type NearestVectorResult = {
	path: string;
	chunk: string | undefined;
	similarity: number;
}
type FileEntryUpdate = {
	path: string;
	chunk: boolean;
	hash: string | undefined;
	contents: string;
	embedding: Vector | undefined;
	mTs: number | undefined;
}

const isChunk = (item: Chunk | undefined): item is Chunk => {
	return !!item
}
export class VectorStore2 {
	private readonly dbFileName = "vault-chat.json"
	private readonly dbFilePath = `.obsidian/plugins/vault-chat/${this.dbFileName}`
	private embeddings: Map<string, FileEntry>
	private vault: Vault
	private readonly createEmbeddingBatch: (textsToEmbed: string[]) => Promise<CreateEmbeddingResponse | undefined>
	private readonly createCompletion: (messages: Array<ChatCompletionRequestMessage>) => Promise<CreateChatCompletionResponse | undefined>

	constructor(vault: Vault, createEmbeddingBatch: (textsToEmbed: string[]) => Promise<CreateEmbeddingResponse | undefined>, createCompletion: (messages: Array<ChatCompletionRequestMessage>) => Promise<CreateChatCompletionResponse | undefined>) {
		this.vault = vault
		this.createEmbeddingBatch = createEmbeddingBatch
		this.createCompletion = createCompletion
	}

	async initDatabase() {
		this.embeddings = await this.readEmbeddingsFromDatabaseFile()
	}

	async updateDatabase(latestFiles: TFile[]) {
		const newEmbeddings: Map<string, FileEntry> = new Map()
		const oldEmbeddings: Map<string, FileEntry> = new Map(
			JSON.parse(
				JSON.stringify(Array.from(this.embeddings))
			)
		);
		const entriesToUpdate: FileEntryUpdate[] = []
		for (const file of latestFiles) {
			const oldFileEntry = oldEmbeddings.get(file.path)
			const fileContents = await this.vault.read(file)
			const newHash = this.generateMd5Hash(fileContents)
			if ((oldFileEntry && newHash !== oldFileEntry.md5hash) || // EXISTING FILE IN DB TO BE UPDATED
				!oldFileEntry) { // NEW FILE IN DB TO BE ADDED
				entriesToUpdate.push({
					path: file.path,
					chunk: false,
					hash: newHash,
					contents: fileContents,
					embedding: undefined,
					mTs: file.stat.mtime
				})
				const chunks = await this.chunkFile(fileContents) // todo handle empty files or very short files!
				if (!chunks) {
					console.error('failed to get chunks from file - file entry failing - lets skip it for now')
					// todo should maybe track failed files
					continue
				}
				chunks.forEach(chunk => {
					entriesToUpdate.push({
						path: file.path,
						chunk: true,
						hash: undefined,
						contents: chunk,
						embedding: undefined,
						mTs: undefined
					})
				})
			}
		}
		const embeddingRequestTexts = entriesToUpdate.map(e => e.contents)
		const response = await this.createEmbeddingBatch(embeddingRequestTexts)
		if (!response) {
			console.error(`embedding didn't work! - failing indexing completely for that`)
			return
		}
		response.data.forEach(embeddingResponse => {
			entriesToUpdate[embeddingResponse.index].embedding = embeddingResponse.embedding
		})

		const entriesByPath: FileEntryUpdate[][] = this.groupBy(entriesToUpdate, 'path')
		for (const entries of entriesByPath) {
			const file = entries.find(x => !x.chunk)
			if (!file || !file.mTs || !file.hash || !file.embedding) {
				console.warn('something weird happened with this entry - skipping it') // todo
				continue
			}
			const chunks: Chunk[] = entries.filter(x => (x.chunk && x.embedding)).map(c => ({
				contents: c.contents,
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				embedding: c.embedding! // cant be null since we filter first
			}))
			const fileEntry: FileEntry = {
				eTs: Date.now(),
				mTs: file.mTs,
				md5hash: file.hash,
				fileEmbedding: file.embedding,
				chunks: chunks
			}
			newEmbeddings.set(file.path, fileEntry)
		}
		this.embeddings = newEmbeddings
		await this.saveEmbeddingsToDatabaseFile()
	}

	private async generateFileEntry(fileContents: string, mtime: number, md5hash: string): Promise<FileEntry | undefined> {
		const chunks = await this.chunkFile(fileContents) // todo handle empty files or very short files!
		if (!chunks) {
			console.error('failed to get chunks from file - file entry failing')
			return
		}
		const fileEmbeddingPromise = this.createEmbeddingBatch([fileContents])
		const cEP: Promise<Chunk | undefined>[] = chunks.map(c => {
			const p: Promise<Chunk | undefined> = this.createEmbeddingBatch([c]).then(e => {
				if (e === undefined) return undefined
				return ({
					contents: c,
					embedding: e.data[0].embedding
				});
			})
			return p
		})
		const chunksWithEmbeddings: Array<Chunk | undefined> = await Promise.all(cEP)
		const chunksNotUndefined: Chunk[] = chunksWithEmbeddings.filter(isChunk)
		const fileEmbedding = await fileEmbeddingPromise
		if (!fileEmbedding) {
			console.error('failed to embed file')
			return
		}
		return {
			eTs: Date.now(),
			mTs: mtime,
			md5hash: md5hash,
			fileEmbedding: fileEmbedding.data[0].embedding,
			chunks: chunksNotUndefined
		}
	}

	async addFile(file: TFile) {
		const existingFile = this.embeddings.get(file.path)
		if (existingFile) return
		const fileContents = await this.vault.read(file)
		const hash = this.generateMd5Hash(fileContents)
		const fileEntry = await this.generateFileEntry(fileContents, file.stat.mtime, hash)
		if (fileEntry) {
			this.embeddings.set(file.path, fileEntry)
		}
		await this.saveEmbeddingsToDatabaseFile() // todo debounce
	}

	async updateFile(file: TFile) {
		const existingFile = this.embeddings.get(file.path)
		if (existingFile) {
			const fileContents = await this.vault.read(file)
			const hash = this.generateMd5Hash(fileContents)
			if (hash !== existingFile.md5hash) {
				const fileEntry = await this.generateFileEntry(fileContents, file.stat.mtime, hash)
				if (fileEntry) {
					this.embeddings.set(file.path, fileEntry)
				}
			} else {
				console.log('no change, not updating db')
			}
		} else {
			await this.addFile(file)
		}
		await this.saveEmbeddingsToDatabaseFile() // todo debounce
	}

	async deleteFileByPath(filePath: string) {
		this.embeddings.delete(filePath)
		await this.saveEmbeddingsToDatabaseFile() // todo debounce
	}

	private generateMd5Hash(content: string) {
		return Md5.hashStr(content)
	}

	private async chunkFile(fileContents: string): Promise<string[] | undefined> {
		const messageRequest: ChatCompletionRequestMessage = {
			role: ChatCompletionRequestMessageRoleEnum.User,
			content: `I am indexing a file for search. 
			When I search for a term, I want to be able to find the most relevant chunk of content from the file. 
			To do that, I need to first break the file into topical chunks so that I can create embeddings for each chunk. 
			When I search, I will compute the cosine similarity between the chunks and my search term and return chunks that are nearest. 
			Please break the following file into chunks that would suit my use case. 
			When you tell me the chunks you have decided on, include the original content from the file. Do not summarize. 
			Prefix each chunk with "<<<CHUNK START>>>" so that I know where they begin. Here is the file:
			${fileContents}`
		}
		const response = await this.createCompletion([messageRequest])
		if (!response) {
			console.error('failed to get completion for chunks')
			return undefined
		}
		return response.choices[0].message?.content.split('<<<CHUNK START>>>').filter(t => t !== '\n\n') // todo error handling
	}

	private async saveEmbeddingsToDatabaseFile() {
		const fileSystemAdapter = this.vault.adapter
		const dbFile: DatabaseFile = {
			version: 2,
			mTs: Date.now(),
			embeddings: this.embeddings
		}
		await fileSystemAdapter.write(this.dbFilePath, JSON.stringify(dbFile))
	}

	private async readEmbeddingsFromDatabaseFile(): Promise<Map<string, FileEntry>> {
		const fileSystemAdapter = this.vault.adapter
		const dbFileExists = await fileSystemAdapter.exists(this.dbFilePath)
		if (!dbFileExists) {
			return new Map()
		}
		const dbFileString = await fileSystemAdapter.read(this.dbFilePath)
		const dbFile: DatabaseFile = JSON.parse(dbFileString)
		return dbFile.embeddings
	}

	getNearestVectors(searchVector: Vector, resultNumber: number, relevanceThreshold: number): NearestVectorResult[] {
		const nearestVectors: NearestVectorResult[] = []

		for (const entry of this.embeddings.entries()) {
			const filePath = entry[0]
			const fileEntry = entry[1]
			const fileSimilarity = similarity(searchVector, fileEntry.fileEmbedding)
			nearestVectors.push({
				path: filePath,
				chunk: undefined,
				similarity: fileSimilarity
			})
			fileEntry.chunks.forEach(chunk => {
				const chunkSimilarity = similarity(searchVector, chunk.embedding)
				nearestVectors.push({
					path: filePath,
					chunk: chunk.contents,
					similarity: chunkSimilarity
				})
			})
		}

		nearestVectors.sort((a, b) => {
			const aEmbedding = a.similarity
			const bEmbedding = b.similarity
			return aEmbedding > bEmbedding ? -1: 1
		})

		return nearestVectors
			.splice(0, resultNumber)
			.filter(e => e.similarity > relevanceThreshold)
	}

	private groupBy(entries: any[], key: string): any[][] {
		return Object.values(entries.reduce(function(prev, cur) {
			(prev[cur[key]] = prev[cur[key]] || []).push(cur);
			return prev;
		}, {}))
	}
}
