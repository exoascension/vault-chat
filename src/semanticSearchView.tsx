import { ItemView, WorkspaceLeaf } from "obsidian";
import * as React from "react";
import { SearchResults } from "./searchResults";
import {createRoot, Root} from "react-dom/client";
import { AppContext } from "./appContext";

export const VIEW_TYPE_EXAMPLE = "semantic-search-view";

export class SemanticSearchView extends ItemView {
	myRoot: Root | undefined;
	searchResults: Array<string>;
	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
		this.searchResults = []
	}

	getViewType() {
		return VIEW_TYPE_EXAMPLE;
	}

	getDisplayText() {
		return "Semantic Search View";
	}

	updateSearchResults(results: Array<string>) {
		this.searchResults = results
		if (this.myRoot) this.myRoot.unmount()
		this.onOpen()
	}

	async onOpen() {
		this.myRoot = createRoot(this.containerEl.children[1]);
		this.myRoot.render(
			<AppContext.Provider value={this.app}>
				<SearchResults searchResults={this.searchResults} />
			</AppContext.Provider>,
		);
	}

	async onClose() {
		if (this.myRoot) this.myRoot.unmount()
	}
}
