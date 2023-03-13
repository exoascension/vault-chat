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
	private dbFilePath = `.obsidian/plugins/vault-chat/${this.dbFileName}`

	private filePathToVector: Map<string, Vector>;
	isReady: Promise<boolean>;
	isIndexingComplete: Promise<boolean>;

	/*
	   this is the most conservative rate limit for openai
	   we are throttling this function to ensure indexing the vault will succeed
	   this is an MVP solution - ideal solution would handle the rate limiting of a specific token since
	   the rate limit could change over time and different tokens can have different rate limits
	 */
	private throttler = new Throttler({
		tokensPerInterval: 20,
		interval: "minute"
	})

	private async initializeFile() {
		const fileSystemAdapter = this.vault.adapter
		this.isReady = new Promise(async resolve => {
			const vectorFileExists = await fileSystemAdapter.exists(this.dbFilePath)
			if (vectorFileExists) {
				const vectorFileContents = await fileSystemAdapter.read(this.dbFilePath)
				try {
					this.filePathToVector = new Map(JSON.parse(vectorFileContents))
				} catch (e) {
					console.error(`Unable to load existing database json, starting fresh`, e)
					this.filePathToVector = new Map()
					await this.saveVectorFile()
				}
				resolve(true)
			} else {
				this.filePathToVector = new Map()
				await this.saveVectorFile()
				resolve(true)
			}
		})
	}

	private async saveVectorFile() { // todo debounce
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

	getByFilePath(filePath: string): Vector {
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

	async addOrUpdateFile(userFile: TFile, createEmbedding: (fileText: string) => Promise<Vector | undefined>) {
		const newVector = await this.getNewVector(userFile, createEmbedding)
		if (newVector === undefined) {
			console.warn(`Failed to add or update file to the database: ${userFile.name}`)
		} else {
			await this.updateVectorByFilename(userFile.path, newVector)
		}
	}

	async updateVectorStore(userFiles: Array<TFile>, createEmbedding: (fileText: string) => Promise<Vector | undefined>) {
		this.isIndexingComplete = new Promise(async (resolve) => {
			const newFilePathToVector: Map<string, Vector> = new Map()
			// create temp copy of the current filePathToVector map since we will overwrite this.filePathToVector as we go
			const oldFilePathToVector: Map<string, Vector> = new Map(
				JSON.parse(
					JSON.stringify(Array.from(this.filePathToVector))
				)
			);
			const userMdFiles = userFiles.filter(file => file.extension === 'md')
			// batch calls to create embeddings so that it saves as it goes,
			// and you don't have to start over if it doesn't finish
			const batchedFiles: Array<Array<TFile>> = this.chunkArray(userMdFiles, 10)
			for (const batchOfFiles of batchedFiles) {
				let hasChanges = false
				for (const userFile of batchOfFiles) {
					if (oldFilePathToVector.get(userFile.path)) {
						// todo implement below to compare hash
						const fileHasChanged = false
						if (fileHasChanged) {
							const newVector = await this.getNewVector(userFile, createEmbedding)
							if (newVector !== undefined) {
								newFilePathToVector.set(userFile.path, newVector)
								hasChanges = true
							}
						} else {
							const existingVector = oldFilePathToVector.get(userFile.path)
							newFilePathToVector.set(userFile.path, existingVector as Vector)
						}
					} else {
						const newVector = await this.getNewVector(userFile, createEmbedding)
						if (newVector !== undefined) {
							newFilePathToVector.set(userFile.path, newVector)
							hasChanges = true
						}
					}
				}
				if (hasChanges) {
					this.filePathToVector = newFilePathToVector
					await this.saveVectorFile()
				}
			}
			resolve(true)
		})
		return this.isIndexingComplete
	}

	private async getNewVector(userFile: TFile, createEmbedding: (fileText: string) => Promise<Vector | undefined>): Promise<Vector | undefined> {
			return app.vault.read(userFile).then((fileContent) =>
				this.throttler.throttleCall(() =>
					createEmbedding(`${userFile.path} ${fileContent}`)))
	}

	// https://stackoverflow.com/a/37826698
	private chunkArray(inputArray: Array<any>, chunkSize: number) {
		return inputArray.reduce((resultArray: any[][], item: any, index: number) => {
			const chunkIndex = Math.floor(index/chunkSize)

			if(!resultArray[chunkIndex]) {
				resultArray[chunkIndex] = [] // start a new chunk
			}

			resultArray[chunkIndex].push(item)

			return resultArray
		}, [])
	}
}
