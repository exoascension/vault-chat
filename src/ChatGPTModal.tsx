import {App, Modal} from "obsidian";
import VaultChat, {SearchResult} from "./main";
import * as React from "react";
import {createRoot, Root} from "react-dom/client";
import {ChatGPTModalComponent} from "./ChatModal/ChatGPTModalComponent";
import {OpenAIHandler} from "./OpenAIHandler";

export class ChatGPTModal extends Modal {
	plugin: VaultChat;
	myRoot: Root | undefined;

	openAIHandler: OpenAIHandler;
	getSearchResultsFiles: (searchTerm: string) => Promise<Array<SearchResult>>;

	isIndexingComplete: Promise<boolean>

	constructor(app: App, plugin: VaultChat, openAIHandler: OpenAIHandler, getSearchResultsFiles: (searchTerm: string) => Promise<Array<SearchResult>>, isIndexingComplete: Promise<boolean>) {
		super(app);
		this.plugin = plugin;
		this.openAIHandler = openAIHandler;
		this.getSearchResultsFiles = getSearchResultsFiles;
		this.isIndexingComplete = isIndexingComplete;
	}

	onOpen() {
		this.myRoot = createRoot(this.contentEl)
		this.myRoot.render(
			<ChatGPTModalComponent
				openAIHandler={this.openAIHandler}
				getSearchResultsFiles={this.getSearchResultsFiles}
				isIndexingComplete={this.isIndexingComplete}
				saveToAndOpenNewNote={this.saveToAndOpenNewNote.bind(this)}
				appendToActiveNote={this.appendToActiveNote.bind(this)}
			/>
		)
	}

	onClose() {
		const { contentEl } = this;
		if (this.myRoot) this.myRoot.unmount()
		contentEl.empty();
	}

	async saveToAndOpenNewNote(text: string) {
		const noteRandomId = Math.floor(Math.random() * (100000 - 1) + 1);
		const newNote = await this.app.vault.create(`/vaultchat-${noteRandomId}.md`, text)
		await this.app.workspace.getLeaf().openFile(newNote)
		this.app.workspace.activeEditor?.editor?.scrollTo(this.app.workspace.activeEditor?.editor?.lastLine())
		this.app.workspace.activeEditor?.editor?.focus()
		this.close()
	}

	async appendToActiveNote(text: string) {
		const currentVal = this.app.workspace.activeEditor?.editor?.getValue()
		this.app.workspace.activeEditor?.editor?.setValue(`${currentVal}\n\n${text}`)
		this.app.workspace.activeEditor?.editor?.scrollTo(this.app.workspace.activeEditor?.editor?.lastLine())
		this.app.workspace.activeEditor?.editor?.focus()
		this.close()
	}
}


