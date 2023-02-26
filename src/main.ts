import { Plugin, TFile } from 'obsidian';
import { VectorStore } from "./VectorStore";
import { OpenAIHandler } from "./OpenAIHandler"
import { VIEW_TYPE_EXAMPLE, SemanticSearchView } from "./semanticSearchView";
import { SemanticSearchSettingTab, SemanticSearchSettings, DEFAULT_SETTINGS } from './UserSettings';


const randNum = () => Math.random() * (Math.round(Math.random()) * 2 - 1)
const generateRandomVector = () => Array.from(new Array(1536), randNum)

export default class SemanticSearch extends Plugin {
	settings: SemanticSearchSettings;

	viewActivated: boolean;

	vectorStore: VectorStore;

	openAIHandler: OpenAIHandler

	async onload() {
		await this.loadSettings();
		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon("dice", "Activate view", () => {
			this.activateView();
		});
		// Perform additional things with the ribbon
		ribbonIconEl.addClass('my-plugin-ribbon-class');

		this.registerView(
			VIEW_TYPE_EXAMPLE,
			(leaf) => new SemanticSearchView(leaf)
		);

		this.vectorStore = new VectorStore(this.app.vault)
		this.vectorStore.isReady.then(async () => {
			this.openAIHandler = new OpenAIHandler(this.settings.apiSetting)
			const files = this.app.vault.getFiles()
			await this.vectorStore.updateVectorStore(files, this.openAIHandler.createEmbedding)

			this.registerEvent(this.app.vault.on('delete', (file) => {
				this.vectorStore.deleteByFilename(file.name)
			}));

			this.registerEvent(this.app.vault.on('create', (file) => {
				if (file instanceof TFile) {
					this.app.vault.read(file).then((fileContent) => {
						this.openAIHandler.createEmbedding(`${file.name} ${fileContent}`).then((embedding) => {
							this.vectorStore.addVector(file.name, embedding) 
						})

					})
				}
			}));

			this.registerEvent(this.app.vault.on('modify', (file) => {
				if (file instanceof TFile && file.name !== 'database2.json') {
					this.app.vault.read(file).then((fileContent) => {
						this.openAIHandler.createEmbedding(`${file.name} ${fileContent}`).then((embedding) => {
							this.vectorStore.updateVectorByFilename(file.name, embedding) 
						})
					})
				}
			}));

			this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
				this.vectorStore.deleteByFilename(oldPath)
				if (file instanceof TFile && file.name !== 'database2.json') {
					this.app.vault.read(file).then((fileContent) => {
						this.openAIHandler.createEmbedding(`${file.name} ${fileContent}`).then((embedding) => {
							this.vectorStore.addVector(file.name, embedding) 
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
					console.log(this.vectorStore.getNearestVectors(generateRandomVector(), 3, this.settings.relevanceSetting))
				})
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SemanticSearchSettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			console.log('click', evt);
		});

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
	}

	async activateView() {
		if (this.viewActivated) {
			this.app.workspace.detachLeavesOfType(VIEW_TYPE_EXAMPLE);
			this.viewActivated = false;
		} else {
			this.app.workspace.detachLeavesOfType(VIEW_TYPE_EXAMPLE);

			await this.app.workspace.getLeftLeaf(true).setViewState({
				type: VIEW_TYPE_EXAMPLE,
				active: true,
			});

			this.app.workspace.revealLeaf(
				this.app.workspace.getLeavesOfType(VIEW_TYPE_EXAMPLE)[0]
			);
			this.viewActivated = true;
		}
	}

	onunload() {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_EXAMPLE);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
