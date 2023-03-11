import { Plugin, TFile } from 'obsidian';
import { VectorStore } from "./VectorStore";
import { OpenAIHandler } from "./OpenAIHandler"
import { VIEW_TYPE_EXAMPLE, SemanticSearchView } from "./semanticSearchView";
import { SemanticSearchSettingTab, SemanticSearchSettings } from './UserSettings';
import { debounce } from 'obsidian'

const randNum = () => Math.random() * (Math.round(Math.random()) * 2 - 1)
const generateRandomVector = () => Array.from(new Array(1536), randNum)

const DEFAULT_SETTINGS: SemanticSearchSettings = {
	apiKey: 'OpenAI API key goes here',
	relevanceThreshold: 0.01
}

export default class SemanticSearch extends Plugin {
	settings: SemanticSearchSettings;

	viewActivated: boolean;

	searchIconObserver: MutationObserver;

	searchResultsObserver: MutationObserver;

	searchTerm: string;

	searchActive: boolean = false;

	vectorStore: VectorStore;

	openAIHandler: OpenAIHandler

	async onload() {
		await this.loadSettings();

		this.registerView(
			VIEW_TYPE_EXAMPLE,
			(leaf) => new SemanticSearchView(leaf)
		)

		this.app.workspace.onLayoutReady( () => {
			this.registerSearchIconObserver()
			this.registerSearchResultsObserver()
		})

		this.vectorStore = new VectorStore(this.app.vault)
		this.vectorStore.isReady.then(async () => {
			this.openAIHandler = new OpenAIHandler(this.settings.apiKey)
			const files = this.app.vault.getFiles()
			await this.vectorStore.updateVectorStore(files, this.openAIHandler.createEmbedding)

			this.registerEvent(this.app.vault.on('delete', (file) => {
				this.vectorStore.deleteByFilePath(file.path)
			}));

			this.registerEvent(this.app.vault.on('create', (file) => {
				if (file instanceof TFile) {
					this.app.vault.read(file).then((fileContent) => {
						this.openAIHandler.createEmbedding(`${file.path} ${fileContent}`).then((embedding) => {
							if (embedding !== undefined) {
								this.vectorStore.addVector(file.path, embedding)
							}
						})

					})
				}
			}));

			const modifyHandler = debounce((file) => {
				if (file instanceof TFile) {
					this.app.vault.read(file).then((fileContent) => {
						this.openAIHandler.createEmbedding(`${file.path} ${fileContent}`).then((embedding) => {
							if (embedding !== undefined) {
								this.vectorStore.updateVectorByFilename(file.path, embedding)
							}
						})
					})
				}
			}, 30000, true)

			this.registerEvent(this.app.vault.on('modify', modifyHandler()));

			this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
				this.vectorStore.deleteByFilePath(oldPath)
				if (file instanceof TFile) {
					this.app.vault.read(file).then((fileContent) => {
						this.openAIHandler.createEmbedding(`${file.path} ${fileContent}`).then((embedding) => {
							if (embedding !== undefined) {
								this.vectorStore.addVector(file.path, embedding)
							}
						})
					})
				}
			}));
		})

		this.addCommand({
			id: 'test-search',
			name: 'Test Searching Vector',
			callback: () => {
				this.vectorStore.isReady.then(async () => {
					console.log("search result:")
					console.log(this.vectorStore.getNearestVectors(generateRandomVector(), 3, this.settings.relevanceThreshold))
				})
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SemanticSearchSettingTab(this.app, this));
	}

	showSemanticSearchPanel() {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_EXAMPLE);
		this.app.workspace.getLeftLeaf(true).setViewState({
			type: VIEW_TYPE_EXAMPLE,
			active: true,
		}).then(() => {
			const leavesOfType = this.app.workspace.getLeavesOfType(VIEW_TYPE_EXAMPLE)
			if (leavesOfType.length > 0) {
				this.app.workspace.revealLeaf(
					leavesOfType[0]
				);
			}

			this.viewActivated = true
		})
	}

	hideSemanticSearchPanel() {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_EXAMPLE);
		this.viewActivated = false
		this.searchTerm = ''
	}

	onunload() {
		this.searchIconObserver.disconnect()
		this.searchResultsObserver.disconnect()
		this.app.workspace.getActiveViewOfType(SemanticSearchView)?.onClose()
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_EXAMPLE);
	}

	registerSearchResultsObserver() {
		const searchLeaf = this.app.workspace.getLeavesOfType('search')[0]
		const searchContainerEl = searchLeaf.view.containerEl
		const searchInfoEl = searchContainerEl.find(".search-info-container")
		const searchResultContainerEl = searchContainerEl.find(".search-result-container")
		this.searchResultsObserver = new MutationObserver(() => {
			const searchInfoText = searchInfoEl.textContent
			let searchTerm = ''
			if (searchInfoText) {
				if (searchInfoText.contains("Matches text: \"")) {
					const matches = searchInfoText.match(RegExp(`Matches text: \"([^"]*)\"`, 'g'))
					if (matches) {
						const matchTerms = matches.map(match => match.split('"')[1])
						searchTerm = matchTerms.join(' ')
					}
				} else if (searchInfoText.contains("Contains exact text: \"")) {
					const startIndex = searchInfoText.indexOf("Contains exact text: \"")
					searchTerm = searchInfoText.substring(startIndex + 13)
					const split = searchTerm.split('"')
					searchTerm = split[1]
				}
			}
			const prevSearchTerm = this.searchTerm
			if (searchTerm !== prevSearchTerm) {
				this.searchTerm = searchTerm
				this.searchForTerm(searchTerm).then((results) => {
					const view = this.app.workspace.getLeavesOfType(VIEW_TYPE_EXAMPLE)[0].view as SemanticSearchView
					view.updateSearchResults(results)
				})
			}
		})
		this.searchResultsObserver.observe(searchResultContainerEl, {
			childList: true,
			subtree: true
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

	registerSearchIconObserver() {
		const appContainerEl = this.app.workspace.containerEl
		const searchIconEl = appContainerEl.find("[aria-label=Search]")

		/*
		Watches the Search icon for `is-active` to be added or removed from the classes.
		The presence of `is-active` indicates the search panel is visible and ours should be too.
		*/
		this.searchIconObserver = new MutationObserver((
			mutations: MutationRecord[]
		) => {
			for(const mutation of mutations) {
				if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
					const isActive = (mutation.target as HTMLElement).attributes.getNamedItem('class')?.value.contains('is-active')
					if (isActive !== this.viewActivated) {
						if (isActive) {
							this.showSemanticSearchPanel()
						} else {
							this.hideSemanticSearchPanel()
						}
					}
				}
			}
		})
		this.searchIconObserver.observe(searchIconEl, {
			attributes: true,
			attributeFilter: [ 'class' ]
		})
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
