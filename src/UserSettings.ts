import {App, ButtonComponent, PluginSettingTab, Setting} from 'obsidian'
import VaultChat from './main'

export interface VaultChatSettings {
	apiKey: string;
	relevanceThreshold: number;
	exclusionPath: string;
}

export class VaultChatSettingTab extends PluginSettingTab {
	plugin: VaultChat;

	provisionalExclusionPath: string;
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

		// TODO validation
		// TODO regex
		// TODO exclude on tags
		new Setting(containerEl)
			.setName('Exclusion Path')
			.setDesc('Path to exclude from OpenAI indexing. Example: `sensitive-folder/` For private files you don\'t want sent to OpenAI for training your model.')
			.addText(text => text
				.setPlaceholder('fake-sensitive-folder/')
				.setValue(this.plugin.settings.exclusionPath)
				.onChange(async (value) => this.provisionalExclusionPath = value))
			.addButton(button => button.
				setButtonText("Set Exclusion")
				.onClick(async _ => {
					this.plugin.settings.exclusionPath = this.provisionalExclusionPath;
					await this.plugin.saveSettings();
					this.plugin.initializeExclusion()
				}));
	}
}
