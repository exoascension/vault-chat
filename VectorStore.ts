import {TFile, Vault} from "obsidian";

export type Vector = Array<number>

export class VectorStore {
	constructor(vault: Vault) {
		this.vault = vault

		const vectorFileExists = this.vault.getAbstractFileByPath(this.dbFilePath) != null

		this.isReady = new Promise(resolve => {
			if (vectorFileExists) {
				this.readVectorFile().then((vectorFileContents) => {
					this.vectorToFilename = new Map(JSON.parse(vectorFileContents))
					this.updateReverseVectorMap()
					resolve(true)
				})
			} else {
				this.vault.create(this.dbFilePath, "{}").then((jsonFile) => {
					this.vectorToFilename = new Map()
					this.filenameToVector = new Map()
					resolve(true)
				})
			}
		})
	}

	private vault: Vault;
	private dbFilePath = "database2.json";
	// todo make private when we are 'ready' ;)
	vectorToFilename: Map<Vector, string>;
	filenameToVector: Map<string, Vector>;
	isReady: Promise<boolean>;

	private async readVectorFile(): Promise<string> {
		const vectorAbstractFile = this.vault.getAbstractFileByPath(this.dbFilePath)
		return this.vault.read(vectorAbstractFile as TFile)
	}

	private async saveVectorFile() {
		const absVectorFile = this.vault.getAbstractFileByPath(this.dbFilePath) as TFile
		await this.vault.modify(absVectorFile, JSON.stringify(Array.from(this.vectorToFilename.entries())))
	}

	private updateReverseVectorMap() {
		this.filenameToVector = new Map(Array.from(
			this.vectorToFilename, entry => [entry[1], entry[0]]))
	}

	getByFilename(filename: string): Vector {
		return this.filenameToVector.get(filename) as Vector
	}

	getByVector(vector: Vector): string {
		return this.vectorToFilename.get(vector) as string
	}

	async addVector(filename: string, vector: Vector) {
		debugger
		this.vectorToFilename.set(vector, filename)
		this.filenameToVector.set(filename, vector)
		await this.saveVectorFile()
	}

	async updateVectorByFilename(filename: string, updatedVector: Vector) {
		const oldVector = this.filenameToVector.get(filename) as Vector
		this.vectorToFilename.delete(oldVector)
		this.vectorToFilename.set(updatedVector, filename)
		this.filenameToVector.set(filename, updatedVector)
		await this.saveVectorFile()
	}

	async updateFilename(oldFilename: string, newFilename: string, newVector: Vector) {
		const oldVector = this.filenameToVector.get(oldFilename) as Vector
		this.vectorToFilename.delete(oldVector)
		this.filenameToVector.delete(oldFilename)
		this.vectorToFilename.set(newVector, newFilename)
		this.filenameToVector.set(newFilename, newVector)
		await this.saveVectorFile()
	}

	async deleteByFilename(filename: string) {
		const vector = this.filenameToVector.get(filename)
		if(vector != undefined) {
			this.vectorToFilename.delete(vector)
			this.filenameToVector.delete(filename)
			await this.saveVectorFile()
		}
	}

	async updateVectorStore(userFiles: Array<TFile>, calculateVector: (file: TFile) => Vector) {
		const newVectorToFilename: Map<Vector, string> = new Map()
		let hasChanges = false
		const userMdFiles = userFiles.filter(file => file.extension === "md")
		for (const userFile of userMdFiles) {
			if (this.getByFilename(userFile.name)) {
				// todo implement below to compare hash
				const fileHasChanged = false
				if (fileHasChanged) {
					const newVector = calculateVector(userFile)
					newVectorToFilename.set(newVector, userFile.name)
					hasChanges = true
				} else {
					const existingVector = this.getByFilename(userFile.name)
					newVectorToFilename.set(existingVector, userFile.name)
				}
			} else {
				const newVector = calculateVector(userFile)
				newVectorToFilename.set(newVector, userFile.name)
				hasChanges = true
			}
		}
		if (hasChanges) {
			this.vectorToFilename = newVectorToFilename
			this.updateReverseVectorMap()
			await this.saveVectorFile()
		}
	}
}
