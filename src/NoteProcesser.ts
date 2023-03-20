// @ts-ignore
import { Remarkable } from 'remarkable';

export type MarkdownChunk = {
	type: string;
	content: string;
	path: string;
	localHeading: string;
}
export function parseMarkdown(mdContent: string, path: string): MarkdownChunk[] {
	const chunks: MarkdownChunk[] = [];
	const mdParser = new Remarkable();
	const mdTokens = mdParser.parse(mdContent, {});

	let currentChunk: MarkdownChunk = {
		type: '',
		content: '',
		path: path,
		localHeading: '',
	};

	// @ts-ignore
	mdTokens.forEach((token) => {
		switch (token.type) {
			case 'heading_open':
				if (currentChunk.content) {
					chunks.push(currentChunk);
				}
				currentChunk = {
					type: `h${token.hLevel}`,
					content: '',
					path: path,
					localHeading: '',
				};
				break;
			case 'text':
				currentChunk.content += token.content;
				break;
			case 'heading_close':
				currentChunk.localHeading = currentChunk.content;
				break;
			case 'list_item_open':
			case 'paragraph_open':
				if (currentChunk.content) {
					chunks.push(currentChunk);
				}
				currentChunk = {
					type: token.type === 'list_item_open' ? 'list_item' : 'paragraph',
					content: '',
					path: path,
					localHeading: currentChunk.localHeading,
				};
				break;
			case 'bullet_list_open':
			case 'ordered_list_open':
			case 'list_item_close':
			case 'paragraph_close':
			case 'bullet_list_close':
			case 'ordered_list_close':
				break;
			default:
				if (token.content) {
					currentChunk.content += token.content;
				}
		}
	});

	if (currentChunk.content) {
		chunks.push(currentChunk);
	}

	return chunks;
}

