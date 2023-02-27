import { App, PluginSettingTab, Setting, SliderComponent } from 'obsidian'
import SemanticSearch from './main'

export interface SemanticSearchSettings {
	apiKey: string;
	relevanceThreshold: number;
}

export class SemanticSearchSettingTab extends PluginSettingTab {
	plugin: SemanticSearch;
	constructor(app: App, plugin: SemanticSearch) {
		super(app, plugin);
		this.plugin = plugin;
	}
	
	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Semantic Search Settings.'});

		new Setting(containerEl)
			.setName('API key')
			.setDesc('In order to use semantic search, you need to register an OpenAI account and create a new API key on their website')
			.addText(text => text
				.setPlaceholder('Enter your API key')
				.setValue(this.plugin.settings.apiKey)
				.onChange(async (value) => {
					this.plugin.settings.apiKey = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Relevance threshold')
			.setDesc('Sets the threshold for determining if a search result is relevant. A higher value means the search will only return more closely related results')
			.addSlider((slider: SliderComponent) => {
				slider
					.setLimits(0, 1, 0.01)
					.setValue(this.plugin.settings.relevanceThreshold)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.relevanceThreshold = value
						await this.plugin.saveSettings()
					})
				}	
			)
	}
}
