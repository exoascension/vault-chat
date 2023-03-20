import { Plugin, TFile} from 'obsidian';
import { OpenAIHandler } from "./OpenAIHandler"
import { VaultChatSettingTab, VaultChatSettings } from './UserSettings';
import { debounce } from 'obsidian'
import { AskChatGPTModal } from "./modals/AskChatGPTModal";
import {VectorStore} from "./VectorStore";
import {SummarizeNoteModal} from "./modals/SummarizeNoteModal";
import {ChatCompletionRequestMessage} from "openai/api";
import {ChatCompletionResponseMessageRoleEnum} from "openai";
import {parseMarkdown} from "./NoteProcesser";
import {SemanticSearchModal} from "./modals/SemanticSearchModal";

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

const hydePrompt = "Imagine you are a human and have an Obsidian.md notes vault. Write a note, containing Obsidian.md markdown features, that answers the following question as if you were the human author:"

export default class VaultChat extends Plugin {
	settings: VaultChatSettings;

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
				new AskChatGPTModal(this.app, this, this.openAIHandler, this.getSearchResults.bind(this), indexingPromise).open();
			}
		});

		this.addCommand({
			id: 'summarize-note',
			name: 'Summarize note',
			checkCallback: (checking: boolean) => {
				const activeFile = this.app.workspace.activeEditor?.file
				if (activeFile) {
					if (!checking) {
						const fileName = activeFile.name
						this.app.vault.read(activeFile).then(f => {
							new SummarizeNoteModal(this.app, this, this.openAIHandler, fileName, f).open()
						})
					}
					return  true
				}
				return false
			}
		});

		this.addCommand({
			id: 'semantic-search',
			name: 'Semantic search',
			callback: () => {
				new SemanticSearchModal(this.app, this, this.openAIHandler, this.getSearchResults.bind(this), indexingPromise).open()
			}
		})

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
		}, 30000, true)

		this.registerEvent(this.app.vault.on('modify', modifyHandler()));

		this.registerEvent(this.app.vault.on('rename', async (file, oldPath) => {
			if (file instanceof TFile && file.extension === 'md') {
				await indexingPromise
				await this.vectorStore.deleteFileByPath(oldPath)
				await this.vectorStore.addFile(file)
			}
		}));
	}

	onunload() {
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

	async getSearchResults(searchTerm: string) {
		// HyDE: request note that answers the question https://github.com/texttron/hyde
		const conversation: Array<ChatCompletionRequestMessage> = []
		const hydeMessage: ChatCompletionRequestMessage = {
			role: ChatCompletionResponseMessageRoleEnum.User,
			content: `${hydePrompt} ${searchTerm}`,
		}
		conversation.push(hydeMessage)
		const hydeResponse = await this.openAIHandler.createChatCompletion(conversation)
		if (!hydeResponse || hydeResponse.choices.length === 0 || !hydeResponse.choices[0].message) {
			console.error(`Failed to get hyde response for query: ${searchTerm}`)
			return
		}

		// create embeddings for that note and all of its blocks
		const hydeNote = hydeResponse.choices[0].message.content
		const hydeNoteBlocks = parseMarkdown(hydeNote, '')
		const queryBlockStrings = hydeNoteBlocks.map(t => `${t.path} ${t.localHeading} ${t.content}`)
		queryBlockStrings.push(hydeNote)
		queryBlockStrings.push(searchTerm) // include the users raw question
		const embeddingsResponse = await this.openAIHandler.createEmbeddingBatch(queryBlockStrings)
		const embeddings = embeddingsResponse?.data
		if (!embeddings) {
			console.error(`Failed to get embeddings for hyde response`)
			return
		}
		const searchVectors = embeddings.map(e => e.embedding)
		// search for matches
		const nearestVectors = this.vectorStore.getNearestVectors(searchVectors, 8, this.settings.relevanceThreshold)
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
}
