import { ItemView, WorkspaceLeaf } from "obsidian";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { SearchResults } from "./searchResults";
import { createRoot } from "react-dom/client";
import { AppContext } from "./appContext";

export const VIEW_TYPE_EXAMPLE = "semantic-search-view";

export class SemanticSearchView extends ItemView {
	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType() {
		return VIEW_TYPE_EXAMPLE;
	}

	getDisplayText() {
		return "Semantic Search View";
	}

	async onOpen() {
		const root = createRoot(this.containerEl.children[1]);
		root.render(
			<AppContext.Provider value={this.app}>
				<SearchResults />
			</AppContext.Provider>,
		);
	}

	async onClose() {
		ReactDOM.unmountComponentAtNode(this.containerEl.children[1]);
	}
}
