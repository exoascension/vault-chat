import { App, PluginSettingTab, Setting, SliderComponent } from 'obsidian'
import VaultChat from './main'

export interface VaultChatSettings {
	apiKey: string;
	relevanceThreshold: number;
}

export class VaultChatSettingTab extends PluginSettingTab {
	plugin: VaultChat;
	constructor(app: App, plugin: VaultChat) {
		super(app, plugin);
		this.plugin = plugin;
	}
	
	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Vault Chat Settings'});

		new Setting(containerEl)
			.setName('API key')
			.setDesc('In order to use Vault Chat, you need to register an OpenAI account and create a new API key on their website')
			.addText(text => text
				.setPlaceholder('Enter your API key')
				.setValue(this.plugin.settings.apiKey)
				.onChange(async (value) => {
					this.plugin.settings.apiKey = value;
					await this.plugin.saveSettings();
				}));
	}
}
