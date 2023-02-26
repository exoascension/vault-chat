import {TFile, Vault} from "obsidian";
// @ts-ignore
import similarity from "compute-cosine-similarity";

export type Vector = Array<number>

export class VectorStore {
	constructor(vault: Vault) {
		this.vault = vault

		const vectorFileExists = this.vault.getAbstractFileByPath(this.dbFilePath) != null

		this.isReady = new Promise(resolve => {
			if (vectorFileExists) {
				this.readVectorFile().then((vectorFileContents) => {
					this.filePathToVector = new Map(JSON.parse(vectorFileContents))
					resolve(true)
				})
			} else {
				this.vault.create(this.dbFilePath, "[]").then((jsonFile) => {
					this.filePathToVector = new Map()
					resolve(true)
				})
			}
		})
	}

	private vault: Vault
	private dbFilePath = "database2.json"
	private relevancePercentage = .01
	private filePathToVector: Map<string, Vector>;
	isReady: Promise<boolean>;

	private async readVectorFile(): Promise<string> {
		const vectorAbstractFile = this.vault.getAbstractFileByPath(this.dbFilePath)
		return this.vault.read(vectorAbstractFile as TFile)
	}

	private async saveVectorFile() {
		const absVectorFile = this.vault.getAbstractFileByPath(this.dbFilePath) as TFile
		await this.vault.modify(absVectorFile, JSON.stringify(Array.from(this.filePathToVector.entries())))
	}

	getNearestVectors(searchVector: Vector, resultNumber: number): Map<string, number> {
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
			.filter(entry => entry[0] > this.relevancePercentage)
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
		for (const userFile of userMdFiles) {
			if (this.getByFilename(userFile.path)) {
				// todo implement below to compare hash
				const fileHasChanged = false
				if (fileHasChanged) {
					const newVector = await app.vault.read(userFile).then((fileContent) => createEmbedding(`${userFile.path} ${fileContent}`))
					newFilenameToVector.set(userFile.path, newVector)
					hasChanges = true
				} else {
					const existingVector = this.getByFilename(userFile.path)
					newFilenameToVector.set(userFile.path, existingVector)
				}
			} else {
				const newVector = await app.vault.read(userFile).then((fileContent) => createEmbedding(`${userFile.path} ${fileContent}`))
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
