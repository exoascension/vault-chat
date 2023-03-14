import {App, Modal} from "obsidian";
import VaultChat from "./main";
import * as React from "react";
import {createRoot, Root} from "react-dom/client";
import {OpenAIHandler} from "./OpenAIHandler";
import {SummarizeNoteModalComponent} from "./components/SummarizeNoteModalComponent";

export class SummarizeNoteModal extends Modal {
	plugin: VaultChat;
	myRoot: Root | undefined;

	openAIHandler: OpenAIHandler;

	fileName: string;

	fileContents: string;

	constructor(app: App, plugin: VaultChat, openAIHandler: OpenAIHandler, fileName: string, fileContents: string) {
		super(app);
		this.plugin = plugin;
		this.openAIHandler = openAIHandler;
		this.fileName = fileName
		this.fileContents = fileContents
	}

	onOpen() {
		this.myRoot = createRoot(this.contentEl)
		this.myRoot.render(
			<SummarizeNoteModalComponent
				openAIHandler={this.openAIHandler}
				saveToAndOpenNewNote={this.saveToAndOpenNewNote.bind(this)}
				appendToActiveNote={this.appendToActiveNote.bind(this)}
				fileName={this.fileName}
				fileContents={this.fileContents}
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
		this.app.workspace.activeEditor?.editor?.setValue(`${currentVal} \n\n ${text}`)
		this.app.workspace.activeEditor?.editor?.scrollTo(this.app.workspace.activeEditor?.editor?.lastLine())
		this.app.workspace.activeEditor?.editor?.focus()
		this.close()
	}
}


