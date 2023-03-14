import { Plugin, TFile} from 'obsidian';
import { VectorStore } from "./VectorStore";
import { OpenAIHandler } from "./OpenAIHandler"
import { VaultChatSettingTab, VaultChatSettings } from './UserSettings';
import { debounce } from 'obsidian'
import {ChatGPTModal} from "./ChatGPTModal";

const DEFAULT_SETTINGS: VaultChatSettings = {
	apiKey: 'OpenAI API key goes here',
	relevanceThreshold: 0.01
}

export type SearchResult = {
	name: string;
	contents: string;
}
export default class VaultChat extends Plugin {
	settings: VaultChatSettings;

	viewActivated: boolean;

	searchTerm: string;

	searchActive: boolean = false;

	vectorStore: VectorStore;

	openAIHandler: OpenAIHandler;

	waitingForApiKey: boolean;

	pluginInitialized: boolean = false;

	async onload() {
		await this.loadSettings();

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new VaultChatSettingTab(this.app, this));

		this.waitingForApiKey = !this.apiKeyIsValid()

		if (this.waitingForApiKey) {
			this.waitingForApiKey = true;
			console.warn('Vault Chat plugin requires you to set your OpenAI API key in the plugin settings, ' +
				'but it appears you have not set one. Until you do, Vault Chat plugin will remain inactive.')
		} else {
			this.initializePlugin()
		}
	}

	onunload() {
	}

	apiKeyIsValid() {
		return this.settings.apiKey
			&& this.settings.apiKey !== ''
			&& this.settings.apiKey !== DEFAULT_SETTINGS.apiKey
			&& this.settings.apiKey.length > 30
	}

	initializePlugin() {
		if (this.pluginInitialized) return
		this.openAIHandler = new OpenAIHandler(this.settings.apiKey)
		this.vectorStore = new VectorStore(this.app.vault)
		this.vectorStore.isReady.then(async () => {
			const files = this.app.vault.getMarkdownFiles()
			const indexingPromise = this.vectorStore.updateVectorStore(files, this.openAIHandler.createEmbedding)

			this.addCommand({
				id: 'ask-chatgpt',
				name: 'Ask ChatGPT',
				callback: () => {
					new ChatGPTModal(this.app, this, this.openAIHandler, this.getSearchResultsFiles.bind(this), indexingPromise).open();
				}
			});
			this.registerEvent(this.app.vault.on('create', async (file) => {
				await indexingPromise
				if (file instanceof TFile && file.extension === 'md') {
					const fileExistsInStore = this.vectorStore.getByFilePath(file.path)
					if (fileExistsInStore !== undefined) {
						await this.vectorStore.addOrUpdateFile(file, this.openAIHandler.createEmbedding)
					}
				}
			}));

			this.registerEvent(this.app.vault.on('delete', async (file) => {
				if (file instanceof TFile && file.extension === 'md') {
					await indexingPromise
					await this.vectorStore.deleteByFilePath(file.path)
				}
			}));

			// todo what happens if there are two calls with two different files within 30s
			const modifyHandler = debounce(async (file) => {
				if (file instanceof TFile && file.extension === 'md') {
					await indexingPromise
					await this.vectorStore.addOrUpdateFile(file, this.openAIHandler.createEmbedding)
				}
			}, 30000, true)

			this.registerEvent(this.app.vault.on('modify', modifyHandler()));

			this.registerEvent(this.app.vault.on('rename', async (file, oldPath) => {
				if (file instanceof TFile && file.extension === 'md') {
					await indexingPromise
					await this.vectorStore.deleteByFilePath(oldPath)
					await this.vectorStore.addOrUpdateFile(file, this.openAIHandler.createEmbedding)
				}
			}));
		})
	}

	async searchForTerm(searchTerm: string): Promise<Array<string>> {
		if (searchTerm === '') {
			return []
		}
		return this.openAIHandler.createEmbedding(searchTerm).then((embedding) => {
			if (embedding === undefined) {
				console.error(`Failed to generate vector for search term.`)
				return []
			}
			const results = this.vectorStore.getNearestVectors(embedding, 3, this.settings.relevanceThreshold)
			return Array.from(results.keys())
		})
	}

	async getSearchResultsFiles(searchTerm: string): Promise<Array<SearchResult>> {
		const embeddingResponse = await this.openAIHandler.createEmbedding(searchTerm)
		if (embeddingResponse === undefined) {
			console.error(`Failed to generate vector for search term.`)
			return []
		}
		const nearestVectors = this.vectorStore.getNearestVectors(embeddingResponse, 3, this.settings.relevanceThreshold)
		const searchResults = Array.from(nearestVectors.keys())
		const hydratedResults = []
		for (const searchResult of searchResults) {
			const abstractFile = app?.vault.getAbstractFileByPath(searchResult) as TFile
			const fileContentsOrEmpty = await app?.vault.read(abstractFile)
			let fileContents: string = fileContentsOrEmpty ? fileContentsOrEmpty : ''
			if (fileContents.length > 1000) {
				fileContents = `${fileContents.substring(0, 1000)}...`
			}
			const fileName = searchResult.split('/').last()!!
			hydratedResults.push({
				name: fileName,
				contents: fileContents,
			})
		}
		return hydratedResults
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		if (this.waitingForApiKey && this.apiKeyIsValid()) {
			this.initializePlugin()
		}
	}
}
