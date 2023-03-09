import { TFile, Vault } from "obsidian";
// @ts-ignore
import similarity from "compute-cosine-similarity";
import {Throttler} from "./Throttler";

export type Vector = Array<number>

export class VectorStore {
	constructor(vault: Vault) {
		this.vault = vault
		this.initializeFile()
	}

	private vault: Vault
	private dbFileName = "database2.json"
	private dbFilePath = `.obsidian/plugins/obsidian-semantic-search/${this.dbFileName}`

	private filePathToVector: Map<string, Vector>;
	isReady: Promise<boolean>;

	private async initializeFile() {
		const fileSystemAdapter = this.vault.adapter
		this.isReady = new Promise(async resolve => {
			const vectorFileExists = await fileSystemAdapter.exists(this.dbFilePath)
			if (vectorFileExists) {
				const vectorFileContents = await fileSystemAdapter.read(this.dbFilePath)
				this.filePathToVector = new Map(JSON.parse(vectorFileContents))
				resolve(true)
			} else {
				this.filePathToVector = new Map()
				await fileSystemAdapter.write(this.dbFilePath, JSON.stringify(Array.from(this.filePathToVector.entries())))
				resolve(true)
			}
		})
	}

	private async saveVectorFile() {
		const fileSystemAdapter = this.vault.adapter
		await fileSystemAdapter.write(this.dbFilePath, JSON.stringify(Array.from(this.filePathToVector.entries())))
	}

	getNearestVectors(searchVector: Vector, resultNumber: number, relevanceThreshold: number): Map<string, number> {
		const results: Array<[number, string, Vector]> = []
		
		for (const entry of this.filePathToVector.entries()) {
			const cosineSimilarity = similarity(searchVector, entry[1])
			results.push([cosineSimilarity, entry[0], entry[1]])
		}

		results.sort((a, b) => {
			return a[0]> b[0] ? -1: 1
		})

		const result: Iterable<[string, number]> = results
			.splice(0, resultNumber)
			.filter(entry => entry[0] > relevanceThreshold)
			.map((value) => {
				return [value[1], value[0]]
			})

		return new Map(result)
	}

	getByFilename(filePath: string): Vector {
		return this.filePathToVector.get(filePath) as Vector
	}

	async addVector(filePath: string, vector: Vector) {
		this.filePathToVector.set(filePath, vector)
		await this.saveVectorFile()
	}

	async updateVectorByFilename(filePath: string, updatedVector: Vector) {
		this.filePathToVector.set(filePath, updatedVector)
		await this.saveVectorFile()
	}

	async updateFilename(oldFilePath: string, newFilePath: string, newVector: Vector) {
		this.filePathToVector.delete(oldFilePath)
		this.filePathToVector.set(newFilePath, newVector)
		await this.saveVectorFile()
	}

	async deleteByFilePath(filepath: string) {
		const vector = this.filePathToVector.get(filepath)
		if(vector != undefined) {
			this.filePathToVector.delete(filepath)
			await this.saveVectorFile()
		}
	}

	async updateVectorStore(userFiles: Array<TFile>, createEmbedding: (fileText: string) => Promise<Vector>) {
		const newFilenameToVector: Map<string, Vector> = new Map()
		let hasChanges = false
		const userMdFiles = userFiles.filter(file => file.extension === "md")
		/*
		   this is the most conservative rate limit for openai
		   we are throttling this function to ensure indexing the vault will succeed
		   this is an MVP solution - ideal solution would handle the rate limiting of a specific token since
		   the rate limit could change over time and different tokens can have different rate limits
		 */
		const throttler = new Throttler({
			tokensPerInterval: 20,
			interval: "minute"
		})
		for (const userFile of userMdFiles) {
			if (this.getByFilename(userFile.path)) {
				// todo implement below to compare hash
				const fileHasChanged = false
				if (fileHasChanged) {
					const newVector = await app.vault.read(userFile).then((fileContent) => throttler.throttleCall(() => createEmbedding(`${userFile.path} ${fileContent}`)))
					newFilenameToVector.set(userFile.path, newVector)
					hasChanges = true
				} else {
					const existingVector = this.getByFilename(userFile.path)
					newFilenameToVector.set(userFile.path, existingVector)
				}
			} else {
				const newVector = await app.vault.read(userFile).then((fileContent) => throttler.throttleCall(() => createEmbedding(`${userFile.path} ${fileContent}`)))
				newFilenameToVector.set(userFile.path, newVector)
				hasChanges = true
			}
		}
		if (hasChanges) {
			this.filePathToVector = newFilenameToVector
			await this.saveVectorFile()
		}
	}
}
