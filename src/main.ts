import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { VectorStore } from "./VectorStore";
import { VIEW_TYPE_EXAMPLE, SemanticSearchView } from "./semanticSearchView";


const randNum = () => Math.random() * (Math.round(Math.random()) * 2 - 1)
const generateRandomVector = () => Array.from(new Array(1536), randNum)

interface SemanticSearchSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: SemanticSearchSettings = {
	mySetting: 'default'
}

export default class SemanticSearch extends Plugin {
	settings: SemanticSearchSettings;

	viewActivated: boolean;

	vectorStore: VectorStore;

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
			const files = this.app.vault.getFiles()
			await this.vectorStore.updateVectorStore(files, generateRandomVector)

			this.registerEvent(this.app.vault.on('delete', (file) => {
				this.vectorStore.deleteByFilename(file.name)
			}));

			this.registerEvent(this.app.vault.on('create', (file) => {
				this.vectorStore.addVector(file.name, generateRandomVector())
			}));

			this.registerEvent(this.app.vault.on('modify', (file) => {
				this.vectorStore.updateVectorByFilename(file.name, generateRandomVector())
			}));

			this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
				this.vectorStore.deleteByFilename(oldPath)
				this.vectorStore.addVector(file.name, generateRandomVector())
			}));
		})

		this.addCommand({
			id: 'test-search',
			name: 'Test Searching Vector',
			callback: () => {
				this.vectorStore.isReady.then(async () => {
					console.log("search result:")
					console.log(this.vectorStore.getNearestVectors(generateRandomVector(), 3))
				})
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));

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

class SampleSettingTab extends PluginSettingTab {
	plugin: SemanticSearch;

	constructor(app: App, plugin: SemanticSearch) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Settings for my awesome plugin.'});

		new Setting(containerEl)
			.setName('Setting #1')
			.setDesc('It\'s a secret')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					console.log('Secret: ' + value);
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));
	}
}
