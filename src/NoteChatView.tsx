import {App, ItemView, TFile, WorkspaceLeaf} from "obsidian";
import * as React from "react";
import {createRoot, Root} from "react-dom/client";
import VaultChat from "./main";
import {OpenAIHandler} from "./OpenAIHandler";
import {NoteChatViewComponent} from "./components/NoteChatViewComponent";

export const NOTE_CHAT_VIEW = "note-chat-view";

export class NoteChatView extends ItemView {
	app: App;
	plugin: VaultChat;
	myRoot: Root | undefined;

	openAIHandler: OpenAIHandler;

	icon = "message-square"

	isOpen = false;

	currentFile = "";


	constructor(app: App, leaf: WorkspaceLeaf, openAIHandler: OpenAIHandler) {
		super(leaf);
		this.app = app
		this.openAIHandler = openAIHandler
		this.app.workspace.on('layout-change', () => {
			setTimeout(async () => {
				const activeFile = this.app.workspace.getActiveFile()
				if (this.isOpen && this.currentFile !== "") {
					if (activeFile !== null && activeFile.path !== this.currentFile) {
						await this.onClose()
						await this.onOpen() // open new file
					}
					if (activeFile === null) {
						await this.onClose() // just close
					}
				}
			}, 100) // yucky but otherwise close was firing before open could fire :'(
		})
	}

	getViewType() {
		return NOTE_CHAT_VIEW;
	}

	getDisplayText() {
		return "Note Chat";
	}

	async onOpen() {
		const activeFileAbstract = this.app.workspace.activeEditor?.file
		if (!(activeFileAbstract instanceof TFile)) {
			console.debug('Encountered unexpected file type in Note Chat')
			return
		}
		this.isOpen = true
		this.currentFile = activeFileAbstract.path
		const fileContents = await this.app.vault.read(activeFileAbstract)
		this.myRoot = createRoot(this.contentEl)
		this.myRoot.render(
			<NoteChatViewComponent
				openAIHandler={this.openAIHandler}
				fileContents={fileContents}
			/>
		)
	}

	async onClose() {
		const { contentEl } = this;
		if (this.myRoot) this.myRoot.unmount()
		contentEl.empty();
		this.app.workspace.off('layout-change', () => { console.log("called off") })
	}
}


