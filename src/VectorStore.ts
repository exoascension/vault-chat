import {TFile, Vault} from "obsidian";
// @ts-ignore
import similarity from "compute-cosine-similarity";
import SemanticSearch from './main'

export type Vector = Array<number>

export class VectorStore {
	constructor(vault: Vault) {
		this.vault = vault

		const vectorFileExists = this.vault.getAbstractFileByPath(this.dbFilePath) != null

		this.isReady = new Promise(resolve => {
			if (vectorFileExists) {
				this.readVectorFile().then((vectorFileContents) => {
					this.filenameToVector = new Map(JSON.parse(vectorFileContents))
					resolve(true)
				})
			} else {
				this.vault.create(this.dbFilePath, "{}").then((jsonFile) => {
					this.filenameToVector = new Map()
					resolve(true)
				})
			}
		})
	}

	private plugin: SemanticSearch
	private vault: Vault
	private dbFilePath = "database2.json"
	// todo make private when we are 'ready' ;)
	filenameToVector: Map<string, Vector>;
	isReady: Promise<boolean>;

	private async readVectorFile(): Promise<string> {
		const vectorAbstractFile = this.vault.getAbstractFileByPath(this.dbFilePath)
		return this.vault.read(vectorAbstractFile as TFile)
	}

	private async saveVectorFile() {
		const absVectorFile = this.vault.getAbstractFileByPath(this.dbFilePath) as TFile
		await this.vault.modify(absVectorFile, JSON.stringify(Array.from(this.filenameToVector.entries())))
	}

	getNearestVectors(searchVector: Vector, resultNumber: number): Map<string, number> {
		const results: Array<[number, string, Vector]> = []

		for (const entry of this.filenameToVector.entries()) {
			const cosineSimilarity = similarity(searchVector, entry[1])
			results.push([cosineSimilarity, entry[0], entry[1]])
		}

		results.sort((a, b) => {
			return a[0]> b[0] ? -1: 1
		})

		const result: Iterable<[string, number]> = results
			.splice(0, resultNumber)
			.filter(entry => entry[0] > this.plugin.settings.relevanceSetting)
			.map((value) => {
				return [value[1], value[0]]
			})

		return new Map(result)
	}

	getByFilename(filename: string): Vector {
		return this.filenameToVector.get(filename) as Vector
	}

	async addVector(filename: string, vector: Vector) {
		this.filenameToVector.set(filename, vector)
		await this.saveVectorFile()
	}

	async updateVectorByFilename(filename: string, updatedVector: Vector) {
		this.filenameToVector.set(filename, updatedVector)
		await this.saveVectorFile()
	}

	async updateFilename(oldFilename: string, newFilename: string, newVector: Vector) {
		this.filenameToVector.delete(oldFilename)
		this.filenameToVector.set(newFilename, newVector)
		await this.saveVectorFile()
	}

	async deleteByFilename(filename: string) {
		const vector = this.filenameToVector.get(filename)
		if(vector != undefined) {
			this.filenameToVector.delete(filename)
			await this.saveVectorFile()
		}
	}

	async updateVectorStore(userFiles: Array<TFile>, createEmbedding: (fileText: string) =>Promise<Vector>) {
		const newFilenameToVector: Map<string, Vector> = new Map()
		let hasChanges = false
		const userMdFiles = userFiles.filter(file => file.extension === "md")
		for (const userFile of userMdFiles) {
			if (this.getByFilename(userFile.name)) {
				// todo implement below to compare hash
				const fileHasChanged = false
				if (fileHasChanged) {
					const newVector = await app.vault.read(userFile).then((fileContent) => createEmbedding(`${userFile.name} ${fileContent}`))
					newFilenameToVector.set(userFile.name, newVector)
					hasChanges = true
				} else {
					const existingVector = this.getByFilename(userFile.name)
					newFilenameToVector.set(userFile.name, existingVector)
				}
			} else {
				const newVector = await app.vault.read(userFile).then((fileContent) => createEmbedding(`${userFile.name} ${fileContent}`))
				newFilenameToVector.set(userFile.name, newVector)
				hasChanges = true
			}
		}
		if (hasChanges) {
			this.filenameToVector = newFilenameToVector
			await this.saveVectorFile()
		}
	}
}
