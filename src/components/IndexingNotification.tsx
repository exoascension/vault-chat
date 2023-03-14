import * as React from "react";

export const IndexingNotification = () => {
	return (
		<p className={'chat-indexing-banner'}>
			Your vault is still indexing! Until indexing is complete, your chat assistant will only
			have partial context and results may be inaccurate. Indexing takes approximately 1 minute per
			20 files in your vault.
		</p>
	)
}
