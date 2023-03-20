import {App, Modal} from "obsidian";
import VaultChat, {SearchResult} from "../main";
import * as React from "react";
import {createRoot, Root} from "react-dom/client";
import {OpenAIHandler} from "../OpenAIHandler";
import {SemanticSearchModalComponent} from "../components/SemanticSearchModalComponent";

export class SemanticSearchModal extends Modal {
	plugin: VaultChat;
	myRoot: Root | undefined;

	openAIHandler: OpenAIHandler;
	getSearchResultsFiles: (searchTerm: string) => Promise<Array<SearchResult>>;

	isIndexingComplete: Promise<void>;

	constructor(app: App, plugin: VaultChat, openAIHandler: OpenAIHandler, getSearchResultsFiles: (searchTerm: string) => Promise<Array<SearchResult>>, isIndexingComplete: Promise<void>) {
		super(app);
		this.plugin = plugin;
		this.openAIHandler = openAIHandler;
		this.getSearchResultsFiles = getSearchResultsFiles;
		this.isIndexingComplete = isIndexingComplete;
	}

	onOpen() {
		this.myRoot = createRoot(this.contentEl)
		this.myRoot.render(
			<SemanticSearchModalComponent
				openAIHandler={this.openAIHandler}
				getSearchResultsFiles={this.getSearchResultsFiles}
				isIndexingComplete={this.isIndexingComplete}
				openFile={this.openFile.bind(this)}
			/>
		)
	}

	onClose() {
		const { contentEl } = this;
		if (this.myRoot) this.myRoot.unmount()
		contentEl.empty();
	}

	async openFile(searchResult: SearchResult) {
		await this.app.workspace.getLeaf().openFile(searchResult.abstractFile)
		this.close()
	}
}


