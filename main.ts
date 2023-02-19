import {App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile} from 'obsidian';
require('fs')

// Remember to rename these classes and interfaces!

interface SemanticSearchSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: SemanticSearchSettings = {
	mySetting: 'default'
}

type Vector = Array<number>

export default class SemanticSearch extends Plugin {
	settings: SemanticSearchSettings;
	dbFileName = "database2.json";

	vectorToFilename: Map<Vector, string>;
	filenameToVector: Map<string, Vector>;

	async readVectorFile(): Promise<Map<Vector, string>> {
		const vectorAbstractFile = this.app.vault.getAbstractFileByPath(this.dbFileName)
		const vectorFile = await this.app.vault.read(vectorAbstractFile as TFile)
		return new Map(JSON.parse(vectorFile))
	}

	reverseMap(map: Map<Vector, string>): Map<string, Vector> {
		return new Map(Array.from(map, entry => [entry[1], entry[0]]))
	}


	async onload() {
		await this.loadSettings();

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('dice', 'Sample Plugin', (evt: MouseEvent) => {
			// Called when the user clicks the icon.
			new Notice('This is a notice!');
		});
		// Perform additional things with the ribbon
		ribbonIconEl.addClass('my-plugin-ribbon-class');

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Status Bar Text');

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'open-sample-modal-simple',
			name: 'Open sample modal (simple)',
			callback: () => {
				new SampleModal(this.app).open();
			}
		});

		/*
			new Map(Array.from(origMap, a => a.reverse()))

			Generate vectors:
				Vector calculation includes file name
			Initial Load:
				Get all markdown files
				Generate vectors
			Search:
				Take in a search term
				Get the vector for the search term
				Compare search vector to all vectors
				Closest vector match, return the file name
			On File Update:
				Calculate new vector
				For the file updated, update the vector
			On File Delete:
				Remove vector for filename

			Build a double Map for Array<number>, string
			Persist that to disk
			Read and generate double
			When we update, we use the one we know and then the one we find out
		 */

		// Testing writing to a file
		this.addCommand({
			id: 'test-file-writing',
			name: 'Test File Writing',
			callback: () => {
				// return vector map from file
				// return true / false if vector file exists
				const vectorFileExists = this.app.vault.getAbstractFileByPath(this.dbFileName) != null

				if (vectorFileExists) {
					this.readVectorFile().then((vectorMap) => {
						this.vectorToFilename = vectorMap
						this.filenameToVector = this.reverseMap(vectorMap)
					})
				} else {
					// TODO need to generate the vectors build the database
					const mockData = new Map<Vector, string>([
						[[0,1], "fake-file.md"]
					]);
					const mapJson = JSON.stringify(Array.from(mockData.entries()));

					this.app.vault.create(this.dbFileName, mapJson).then((jsonFile) => {
						this.readVectorFile().then((vectorMap) => {
							this.vectorToFilename = vectorMap
							this.filenameToVector = this.reverseMap(vectorMap)
						})
					})
				}
			}
		});
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'sample-editor-command',
			name: 'Sample editor command',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				console.log(editor.getSelection());
				editor.replaceSelection('Sample Editor Command');
			}
		});
		// This adds a complex command that can check whether the current state of the app allows execution of the command
		this.addCommand({
			id: 'open-sample-modal-complex',
			name: 'Open sample modal (complex)',
			checkCallback: (checking: boolean) => {
				// Conditions to check
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					// If checking is true, we're simply "checking" if the command can be run.
					// If checking is false, then we want to actually perform the operation.
					if (!checking) {
						new SampleModal(this.app).open();
					}

					// This command will only show up in Command Palette when the check function returns true
					return true;
				}
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

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
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
