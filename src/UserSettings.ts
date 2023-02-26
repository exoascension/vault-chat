import { App, PluginSettingTab, Setting, SliderComponent } from 'obsidian'
import SemanticSearch from './main'

export interface SemanticSearchSettings {
	apiSetting: string;
	relevanceSetting: number;
}

export const DEFAULT_SETTINGS: SemanticSearchSettings = {
	apiSetting: 'OpenAI API key goes here',
	relevanceSetting: 0.01
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

		containerEl.createEl('h2', {text: 'Semantic search settings.'});

		new Setting(containerEl)
			.setName('API key')
			.setDesc('In order to use semantic search, you need to register an OpenAI account and create a new API key on their website')
			.addText(text => text
				.setPlaceholder('Enter your API key')
				.setValue(this.plugin.settings.apiSetting)
				.onChange(async (value) => {
					console.log(value)
					this.plugin.settings.apiSetting = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Relevance threshold')
			.setDesc('Sets the threshold for determining if a search result is relevant. A higher value means the search will only return more closely related results')
			.addSlider((slider: SliderComponent) => {
				slider
					.setLimits(0, 1, 0.01)
					.setValue(this.plugin.settings.relevanceSetting)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.relevanceSetting = value
						await this.plugin.saveSettings()
					})
				}	
			)
	}
}
