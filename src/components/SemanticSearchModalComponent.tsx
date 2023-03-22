import * as React from "react";
import {OpenAIHandler} from "../OpenAIHandler";
import {SearchResult} from "../main";
import {IndexingNotification} from "./IndexingNotification";
import {useState} from "react";

interface Props {
	openAIHandler: OpenAIHandler,
	getSearchResultsFiles: (searchTerm: string, includeRedundantBlocks: boolean) => Promise<Array<SearchResult>>,

	isIndexingComplete: Promise<void>,

	openFile: (searchResult: SearchResult) => Promise<void>
}
export const SemanticSearchModalComponent: React.FC<Props> = (props: Props) => {
	const { getSearchResultsFiles, isIndexingComplete, openFile } = props;
	const [showIndexingBanner, setShowIndexingBanner] = useState(true)
	const [buttonDisabled, setButtonDisabled] = useState(true)
	const [inputDisabled, setInputDisabled] = useState(false)
	const [userMessage, setUserMessage] = useState('')
	const [searchResults, setSearchResults] = useState<Array<SearchResult>>([])
	const [loading, setLoading] = useState(false)

	isIndexingComplete.then(() => {
		if (showIndexingBanner) setShowIndexingBanner(false)
	})
	const userMessageOnChange = (e: { target: { value: React.SetStateAction<string>; }; }) => {
		setButtonDisabled(e.target.value.length === 0)
		setUserMessage(e.target.value)
	}

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'Enter') {
			onClickSubmit()
		}
	}

	const onClickSubmit = async () => {
		setLoading(true)
		setInputDisabled(true)
		setButtonDisabled(true)
		const searchResults = await getSearchResultsFiles(userMessage, true)
		setSearchResults(searchResults)
		setInputDisabled(false)
		setButtonDisabled(false)
		setLoading(false)
	}

	return (
		<>
			<h1>Semantic Search</h1>
			<p>
				Semantic Search means to search by meaning, rather than text matches. Results may vary and the
				accuracy of results depends on factors such as the contents and structure of your vault as well as
				the specificity of your search term.
			</p>
			{ showIndexingBanner && (
				<IndexingNotification/>
			)}
			<div className={'chat-input-layout'}>
				<input className={'chat-input-input'} type="text" name="user-message" value={userMessage} onChange={userMessageOnChange} onKeyDown={handleKeyDown} disabled={inputDisabled}/>
				<button className={buttonDisabled ? 'button-disabled' : ''} disabled={buttonDisabled} onClick={onClickSubmit}>Search</button>
			</div>
			<div className={"search-results-container"}>
				<>
					{ loading ? (
						'Loading...'
					) : searchResults.map(result => (
						<div className={"search-result-card"} key={result.name} onClick={() => openFile(result)}>
							<div className={"search-result-card-header"}>{result.name}</div>
							<div  className={"search-result-card-content"}>{result.contents.substring(0,200)}</div>
						</div>
					))}
				</>
			</div>
		</>
	)
}
