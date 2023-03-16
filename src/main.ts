import { Plugin, TFile} from 'obsidian';
import { OpenAIHandler } from "./OpenAIHandler"
import { VaultChatSettingTab, VaultChatSettings } from './UserSettings';
import { debounce } from 'obsidian'
import { AskChatGPTModal } from "./AskChatGPTModal";
import {NearestVectorResult, VectorStore} from "./VectorStore";

const DEFAULT_SETTINGS: VaultChatSettings = {
	apiKey: 'OpenAI API key goes here',
	relevanceThreshold: 0.01
}

export type SearchResult = {
	name: string;
	contents: string;
}

const isSearchResult = (item: SearchResult | undefined): item is SearchResult => {
	return !!item
}
export default class VaultChat extends Plugin {
	settings: VaultChatSettings;

	searchTerm: string;

	searchActive = false;

	vectorStore: VectorStore;

	openAIHandler: OpenAIHandler;

	waitingForApiKey: boolean;

	async onload() {
		await this.loadSettings();

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new VaultChatSettingTab(this.app, this));

		if (this.apiKeyIsValid()) {
			this.waitingForApiKey = false
			await this.initializePlugin()
		} else {
			this.waitingForApiKey = true
			console.warn('Vault Chat plugin requires you to set your OpenAI API key in the plugin settings, ' +
				'but it appears you have not set one. Until you do, Vault Chat plugin will remain inactive.')
		}
	}

	apiKeyIsValid() {
		return this.settings.apiKey
			&& this.settings.apiKey !== ''
			&& this.settings.apiKey !== DEFAULT_SETTINGS.apiKey
			&& this.settings.apiKey.length > 30
	}

	async initializePlugin() {
		this.openAIHandler = new OpenAIHandler(this.settings.apiKey)
		this.vectorStore = new VectorStore(this.app.vault, this.openAIHandler.createEmbeddingBatch, this.openAIHandler.createChatCompletion)
		await this.vectorStore.initDatabase()
		const files = this.app.vault.getMarkdownFiles()
		const indexingPromise = this.vectorStore.updateDatabase(files)

		this.addCommand({
			id: 'ask-chatgpt',
			name: 'Ask ChatGPT',
			callback: () => {
				new AskChatGPTModal(this.app, this, this.openAIHandler, this.getSearchResultsFiles.bind(this), indexingPromise).open();
			}
		});
		this.registerEvent(this.app.vault.on('create', async (file) => {
			await indexingPromise
			if (file instanceof TFile && file.extension === 'md') {
				await this.vectorStore.addFile(file)
			}
		}));

		this.registerEvent(this.app.vault.on('delete', async (file) => {
			if (file instanceof TFile && file.extension === 'md') {
				await indexingPromise
				await this.vectorStore.deleteFileByPath(file.path)
			}
		}));

		// todo what happens if there are two calls with two different files within 30s
		const modifyHandler = debounce(async (file) => {
			if (file instanceof TFile && file.extension === 'md') {
				await indexingPromise
				await this.vectorStore.updateFile(file)
			}
		}, 60000, true)

		this.registerEvent(this.app.vault.on('modify', modifyHandler()));

		this.registerEvent(this.app.vault.on('rename', async (file, oldPath) => {
			if (file instanceof TFile && file.extension === 'md') {
				await indexingPromise
				await this.vectorStore.deleteFileByPath(oldPath)
				await this.vectorStore.addFile(file)
			}
		}));

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new VaultChatSettingTab(this.app, this));
	}

	onunload() {
	}

	async searchForTerm(searchTerm: string): Promise<Array<string>> {
		if (searchTerm === '') {
			return []
		}
		const embedding = await this.openAIHandler.createEmbedding(searchTerm)
		if (embedding === undefined) {
			console.error(`Failed to generate vector for search term.`)
			return []
		}
		const nearest: NearestVectorResult[] = this.vectorStore.getNearestVectors(embedding, 3, this.settings.relevanceThreshold)
		return nearest.map(n => n.path)
	}

	async getSearchResultsFiles(searchTerm: string): Promise<Array<SearchResult>> {
		const embeddingResponse = await this.openAIHandler.createEmbedding(searchTerm)
		if (embeddingResponse === undefined) {
			console.error(`Failed to generate vector for search term.`)
			return []
		}
		const nearestVectors = this.vectorStore.getNearestVectors(embeddingResponse, 3, this.settings.relevanceThreshold)
		const results = await Promise.all(nearestVectors.map(async (nearest, i) => {
			let name = nearest.path.split('/').last() || ''
			let contents = nearest.chunk
			if (nearest.chunk && nearest.chunk.length) {
				name = name + i // todo
			}
			if (!contents) {
				const abstractFile = this.app.vault.getAbstractFileByPath(nearest.path) as TFile
				const fileContentsOrEmpty = await this.app.vault.read(abstractFile)
				let fileContents: string = fileContentsOrEmpty ? fileContentsOrEmpty : ''
				if (fileContents.length > 1000) {
					fileContents = `${fileContents.substring(0, 1000)}...`
				}
				contents = fileContents
			}
			return {
				name,
				contents
			}
		}))
		return results.filter(isSearchResult)
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		if (this.waitingForApiKey && this.apiKeyIsValid()) {
			this.waitingForApiKey = false
			await this.initializePlugin()
		}
	}
}
