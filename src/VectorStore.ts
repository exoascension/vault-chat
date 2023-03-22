import {debounce, Debouncer, TFile, Vault} from 'obsidian';
import {Md5} from 'ts-md5';
import GPT3Tokenizer from "gpt3-tokenizer";
import {
	ChatCompletionRequestMessage,
	CreateChatCompletionResponse
} from 'openai/api';
// @ts-ignore
import similarity from 'compute-cosine-similarity';
import {CreateEmbeddingResponse} from "openai";
import {MarkdownChunk, parseMarkdown} from "./NoteProcesser";
import {Throttler} from "./Throttler";


export type Vector = Array<number>
type Chunk = {
	contents: string;
	embedding: Vector | undefined;
}
type FileEntry = {
	md5hash: string;
	embedding: Vector;
	chunks: Array<Chunk>;
}
type DatabaseFile = {
	version: number;
	embeddings: [string, FileEntry][];
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
}
type CreateEmbeddingFunction = (textsToEmbed: string[]) => Promise<CreateEmbeddingResponse | undefined>
type CreateCompletionFunction = (messages: Array<ChatCompletionRequestMessage>) => Promise<CreateChatCompletionResponse | undefined>

export class VectorStore {
	private readonly dbFileName = "vault-chat.json"
	private readonly dbFilePath = `.obsidian/plugins/vault-chat/${this.dbFileName}`
	private embeddings: Map<string, FileEntry>
	private vault: Vault
	private readonly createEmbeddingBatch: CreateEmbeddingFunction
	private readonly createCompletion: CreateCompletionFunction
	private tokenizer: GPT3Tokenizer
	private debounceSave: Debouncer<[], Promise<void>>
	private throttler = new Throttler({
		tokensPerInterval: 20,
		interval: "minute"
	})

	private exclusionPath: string

	constructor(vault: Vault, createEmbeddingBatch: CreateEmbeddingFunction, createCompletion: CreateCompletionFunction, exclusionPath: string) {
		this.vault = vault
		this.createEmbeddingBatch = (textsToEmbed) => this.throttler.throttleCall(() => createEmbeddingBatch(textsToEmbed))
		this.createCompletion = createCompletion
		this.tokenizer = new GPT3Tokenizer({ type: "gpt3" })
		this.debounceSave = debounce(this.saveEmbeddingsToDatabaseFile, 30000, true)
		this.exclusionPath = exclusionPath
	}

	setExclusionPath(exclusionPath: string) {
		this.exclusionPath = exclusionPath
	}

	private isFilePathExcluded(file: string): boolean {
		return (!!this.exclusionPath && !!this.exclusionPath.trim() && file.startsWith(this.exclusionPath))
	}

	private isFileExcluded(file: TFile): boolean {
		return this.isFilePathExcluded(file.path)
	}

	async initDatabase() {
		this.embeddings = await this.readEmbeddingsFromDatabaseFile()
	}

	async updateDatabase(latestFiles: TFile[]) {
		const filesWithoutExclusions = latestFiles.filter(f => !this.isFileExcluded(f))
		const newEmbeddings: Map<string, FileEntry> = new Map()

		// get list of files that are new or have changed
		const filesToUpdate: {file: TFile, contents: string, hash: string, embedding: Vector | undefined }[] = []
		for (const file of filesWithoutExclusions) {
			const oldFileEntry = this.embeddings.get(file.path)
			const fileContents = await this.vault.read(file)
			const newHash = this.generateMd5Hash(fileContents)
			if (!oldFileEntry || // new file to add to the database
				newHash !== oldFileEntry.md5hash || // existing file has changed since last index
				(fileContents.length > 0 && oldFileEntry.chunks.length === 0) || // breaking into chunks previously failed
				oldFileEntry.chunks.find(c => c.embedding === undefined)) { // embeddings on chunks previously failed
				filesToUpdate.push({
					file: file,
					contents: fileContents,
					hash: newHash,
					embedding: undefined
				})
			} else { // existing files that haven't changed
				newEmbeddings.set(file.path, oldFileEntry)
			}
		}

		// save the unchanged entries to the db
		this.embeddings = newEmbeddings
		await this.saveEmbeddingsToDatabaseFile()

		if (filesToUpdate.length === 0) {
			return
		}

		// create embeddings for the full files first (50 at a time)
		const chunksOfFilesToUpdate: {file: TFile, contents: string, hash: string, embedding: Vector | undefined }[][] = this.chunkArray(filesToUpdate, 50)
		for (const chunk of chunksOfFilesToUpdate) {
			const embeddingRequestTexts = chunk.map(fileToUpdate => `${fileToUpdate.file.path} ${fileToUpdate.contents}`)
			const response = await this.createEmbeddingBatch(embeddingRequestTexts)
			if (!response) {
				console.error(`embedding didn't work! - failing indexing completely for that`)
				return
			}
			response.data.forEach(embeddingResponse => {
				chunk[embeddingResponse.index].embedding = embeddingResponse.embedding
			})
		}

		// save the updated files with file-level embeddings to the db
		chunksOfFilesToUpdate.forEach(chunk => chunk.forEach(fileToUpdate => {
			if (fileToUpdate.embedding && fileToUpdate.embedding.length) {
				newEmbeddings.set(fileToUpdate.file.path, {
					md5hash: fileToUpdate.hash,
					embedding: fileToUpdate.embedding,
					chunks: []
				})
			}
		}))
		this.embeddings = newEmbeddings
		await this.saveEmbeddingsToDatabaseFile()

		const chunksToEmbed: {path: string, content: string, embedding: Vector | undefined}[] = []
		filesToUpdate.forEach(fileToUpdate => {
			const chunks = this.chunkFile(fileToUpdate.contents, fileToUpdate.file.path)
			chunks.forEach(c => {
				chunksToEmbed.push({
					path: fileToUpdate.file.path,
					content: c,
					embedding: undefined
				})
			})
		})

		const chunksToEmbedRequestBatches: {path: string, content: string, embedding: Vector | undefined}[][] = this.batchArrayByTokenCount(chunksToEmbed, 7500)
		for (const batch of chunksToEmbedRequestBatches) {
			const batchStrings = batch.map(b => b.content)
			const batchEmbedResponse = await this.createEmbeddingBatch(batchStrings)
			if (!batchEmbedResponse) {
				console.log(`batch embed response failed skipping batch`)
				continue
			}
			batchEmbedResponse.data.forEach(embeddingResponse => {
				batch[embeddingResponse.index].embedding = embeddingResponse.embedding
			})
		}
		const chunksWithEmbeddings = chunksToEmbedRequestBatches.flatMap(x => x)
		const chunksByPath = this.groupBy(chunksWithEmbeddings, 'path')
		chunksByPath.forEach(chunkByPath => {
			const path = chunkByPath[0].path
			const entry = this.embeddings.get(path)
			if (entry) {
				entry.chunks = chunkByPath.map(c => ({
					contents: c.content,
					embedding: c.embedding
				}))
			}
		})
		await this.saveEmbeddingsToDatabaseFile()
	}

	private async getEntriesToUpdate(file: TFile, newHash: string, fileContents: string): Promise<FileEntryUpdate[]> {
		const entriesToUpdate: FileEntryUpdate[] = []
		entriesToUpdate.push({
			path: file.path,
			chunk: false,
			hash: newHash,
			contents: fileContents,
			embedding: undefined
		})
		const chunks = fileContents.length > 0 ? this.chunkFile(fileContents, file.path) : [] // todo empty files?
		if (!chunks) {
			console.error('failed to get chunks from file - file entry failing - lets skip it for now')
			// todo should maybe track failed files
			return []
		}
		chunks.forEach(chunk => {
			entriesToUpdate.push({
				path: file.path,
				chunk: true,
				hash: undefined,
				contents: chunk,
				embedding: undefined
			})
		})
		return entriesToUpdate
	}

	private async generateFileEntry(file: TFile, fileContents: string, md5hash: string): Promise<FileEntry | undefined> {
		if (fileContents.length === 0) { // todo empty files?
			return
		}
		const entriesToUpdate: FileEntryUpdate[] = await this.getEntriesToUpdate(file, md5hash, fileContents)
		const newEmbeddings = await this.convertEntriesToEmbeddingsMap(entriesToUpdate)
		if (newEmbeddings !== undefined) {
			return newEmbeddings.get(file.path)
		}
	}

	private async convertEntriesToEmbeddingsMap(entriesToUpdate: FileEntryUpdate[]): Promise<Map<string, FileEntry> | undefined>  {
		const newEmbeddings: Map<string, FileEntry> = new Map()
		if (!entriesToUpdate || entriesToUpdate.length === 0) {
			return
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
			if (!file || !file.hash || !file.embedding) {
				console.warn('something weird happened with this entry - skipping it') // todo
				continue
			}
			const chunks: Chunk[] = entries.filter(x => (x.chunk && x.embedding)).map(c => ({
				contents: c.contents,
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				embedding: c.embedding! // cant be null since we filter first
			}))
			const fileEntry: FileEntry = {
				md5hash: file.hash,
				embedding: file.embedding,
				chunks: chunks
			}
			newEmbeddings.set(file.path, fileEntry)
		}
		return newEmbeddings
	}

	async addFile(file: TFile) {
		if(this.isFileExcluded(file)) {
			return
		}
		const existingFile = this.embeddings.get(file.path)
		if (existingFile) return
		const fileContents = await this.vault.read(file)
		if (fileContents.length === 0) return
		const hash = this.generateMd5Hash(fileContents)
		const fileEntry = await this.generateFileEntry(file, fileContents, hash)
		if (fileEntry) {
			this.embeddings.set(file.path, fileEntry)
		}
		await this.debounceSave()
	}

	async updateFile(file: TFile) {
		if (this.isFileExcluded(file)) return
		const existingFile = this.embeddings.get(file.path)
		if (existingFile) {
			const fileContents = await this.vault.read(file)
			const hash = this.generateMd5Hash(fileContents)
			if (hash !== existingFile.md5hash) {
				const fileEntry = await this.generateFileEntry(file, fileContents, hash)
				if (fileEntry) {
					this.embeddings.set(file.path, fileEntry)
				}
			} else {
				console.log('no change, not updating db')
			}
		} else {
			await this.addFile(file)
		}
		await this.debounceSave()
	}

	async deleteFileByPath(filePath: string) {
		this.embeddings.delete(filePath)
		await this.debounceSave()
	}

	deleteByPathPrefix() {
		const keysToBeDeleted: string[] = []
		for (const key of this.embeddings.keys()) {
			if(this.isFilePathExcluded(key)) {
				keysToBeDeleted.push(key)
			}
		}
		keysToBeDeleted.forEach(k => {
			this.embeddings.delete(k)
		})
		this.debounceSave()
	}


	private generateMd5Hash(content: string) {
		return Md5.hashStr(content)
	}

	private chunkFile(fileContents: string, path: string): string[] {
		const chunkObjects: MarkdownChunk[] = parseMarkdown(fileContents, path)
		return chunkObjects.map(c => `${c.path} ${c.localHeading} ${c.content}`)
	}

	private async saveEmbeddingsToDatabaseFile() {
		const fileSystemAdapter = this.vault.adapter
		const dbFile: DatabaseFile = {
			version: 2,
			embeddings: Array.from(this.embeddings.entries())
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
		return new Map(dbFile.embeddings)
	}

	private computeSimilarity(searchVectors: Vector[], possibleMatch: Vector): number {
		let highestSimilarity = similarity(searchVectors.first(), possibleMatch)
		for (const searchVector of searchVectors) {
			const currentSimilarity = similarity(searchVector, possibleMatch)
			if (currentSimilarity > highestSimilarity) {
				highestSimilarity = currentSimilarity
			}
		}
		return highestSimilarity
	}

	getNearestVectors(searchVectors: Vector[], resultNumber: number, relevanceThreshold: number, includeRedundantBlocks: boolean): NearestVectorResult[] {
		const nearestVectors: NearestVectorResult[] = []

		for (const entry of this.embeddings.entries()) {
			const filePath = entry[0]
			const fileEntry = entry[1]
			let addedFile = false
			if (fileEntry.embedding && fileEntry.embedding.length) {
				const fileSimilarity = this.computeSimilarity(searchVectors, fileEntry.embedding)
				nearestVectors.push({
					path: filePath,
					chunk: undefined,
					similarity: fileSimilarity
				})
				addedFile = true
			}
			if (includeRedundantBlocks || !addedFile) {
				fileEntry.chunks.forEach(chunk => {
					if (chunk.embedding && chunk.embedding.length) {
						const chunkSimilarity = this.computeSimilarity(searchVectors, chunk.embedding)
						nearestVectors.push({
							path: filePath,
							chunk: chunk.contents,
							similarity: chunkSimilarity
						})
					}
				})
			}
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

	// https://stackoverflow.com/questions/8495687/split-array-into-chunks
	private chunkArray(inputArray: any[], chunk: number) {
		return inputArray.reduce((resultArray, item, index) => {
			const chunkIndex = Math.floor(index/chunk)

			if(!resultArray[chunkIndex]) {
				resultArray[chunkIndex] = [] // start a new chunk
			}

			resultArray[chunkIndex].push(item)

			return resultArray
		}, [])
	}

	private batchArrayByTokenCount(chunks: {path: string, content: string, embedding: Vector | undefined}[], tokensPerBatch: number): {path: string, content: string, embedding: Vector | undefined}[][] {
		const batches: {path: string, content: string, embedding: Vector | undefined}[][] = []
		let batch: {path: string, content: string, embedding: Vector | undefined}[] = []
		let currentTokenCount = 0
		for (const chunk of chunks) {
			const tokenCount = this.tokenizer.encode(chunk.content).bpe.length
			const newTokenCount = currentTokenCount + tokenCount
			if (newTokenCount > tokensPerBatch) {
				batches.push(batch)
				batch = []
				currentTokenCount = 0
			} else {
				batch.push(chunk)
				currentTokenCount = newTokenCount
			}
		}
		batches.push(batch)
		return batches
	}
}
