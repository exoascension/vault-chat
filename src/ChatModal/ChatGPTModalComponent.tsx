import * as React from "react";
import { useState } from "react";
import { OpenAIHandler } from "../OpenAIHandler";
import { ChatCompletionRequestMessage } from "openai/api";
import { SearchResult } from "../main";
import {SaveOptions} from "./SaveOptions";
import {ChatGPTConversation} from "./ChatGPTConversation";
import {IndexingNotification} from "./IndexingNotification";

interface Props {
	openAIHandler: OpenAIHandler,
	getSearchResultsFiles: (searchTerm: string) => Promise<Array<SearchResult>>,

	isIndexingComplete: Promise<boolean>,

	saveToAndOpenNewNote: (text: string) => never,

	appendToActiveNote: (text: string) => never
}
export const ChatGPTModalComponent: React.FC<Props> = (props: Props) => {
	const { openAIHandler, getSearchResultsFiles, isIndexingComplete, saveToAndOpenNewNote, appendToActiveNote } = props;
	const [internalConversation, setInternalConversation] = useState<Array<ChatCompletionRequestMessage>>([])
	const [renderedConversation, setRenderedConversation] = useState<Array<ChatCompletionRequestMessage>>([])
	const [userMessage, setUserMessage] = useState('')
	const [buttonDisabled, setButtonDisabled] = useState(true)
	const [inputDisabled, setInputDisabled] = useState(false)
	const [tokensUsedSoFar, setTokensUsedSoFar] = useState(0)
	const [showIndexingBanner, setShowIndexingBanner] = useState(true)

	isIndexingComplete.then(() => {
		if (showIndexingBanner) setShowIndexingBanner(false)
	})
	const userMessageOnChange = (e: { target: { value: React.SetStateAction<string>; }; }) => {
		setButtonDisabled(e.target.value.length === 0)
		setUserMessage(e.target.value)
	}

	// @ts-ignore
	const handleKeyDown = (e) => {
		if (e.key === 'Enter') {
			onClickSubmit()
		}
	}

	const onClickSubmit = async () => {
		setButtonDisabled(true)
		// new conversation request will use the internalConversation so the assistant has all necessary history
		const newInternalConversation: Array<ChatCompletionRequestMessage> = Object.assign([], internalConversation);const searchResults = await getSearchResultsFiles(userMessage)

		const systemMessageForContext: ChatCompletionRequestMessage = {
			role: 'system',
			content: `Imagine the following texts were written by me and represent my own opinions.   
			${searchResults.map((result: SearchResult) => `${result.name}: ${result.contents}`).join('\n')}`
		}
		newInternalConversation.push(systemMessageForContext)
		newInternalConversation.push({
			role: 'user',
			content: userMessage
		})

		setUserMessage('Loading...')
		setInputDisabled(true)

		const response = await openAIHandler.createChatCompletion(newInternalConversation)

		// be mindful of the 4096 token limit and remove some old context if we're getting close
		const responseTokensTotal = response.usage?.total_tokens
		if (responseTokensTotal) {
			setTokensUsedSoFar(responseTokensTotal)
			if (responseTokensTotal > 3000) {
				const indexOfOldestSystemMessage =
					newInternalConversation.findIndex(message => message.role === 'system')
				newInternalConversation.splice(indexOfOldestSystemMessage, 1)
			}
		}

		const responseMessage = response.choices[0].message?.content
		if (responseMessage) {
			newInternalConversation.push({
				role: 'assistant',
				content: responseMessage
			})
		}

		// don't show system messages to the user
		const newRenderedConversation = newInternalConversation.filter(message => message.role !== 'system')

		setInternalConversation(newInternalConversation)
		setRenderedConversation(newRenderedConversation)
		setUserMessage('')
		setInputDisabled(false)
	}
	return (
		<>
			<h1>Let's chat!</h1>
			<p>
				This conversation is taking place with your ChatGPT assistant.
				You can converse with ChatGPT just as you would normally, however,
				what's cool about this tool is that ChatGPT will be able to use your notes
				as context in the conversation. With that context, you can ask powerful
				questions about the content in your own vault. Try it out!
			</p>
			{ showIndexingBanner && (
				<IndexingNotification/>
			)}
			<ChatGPTConversation conversation={renderedConversation}/>
			<div className={'chat-input-layout'}>
				<input className={'chat-input-input'} type="text" name="user-message" value={userMessage} onChange={userMessageOnChange} onKeyDown={handleKeyDown} disabled={inputDisabled}/>
				<button className={buttonDisabled ? 'button-disabled' : ''} disabled={buttonDisabled} onClick={onClickSubmit}>Submit</button>
			</div>
			<SaveOptions
				conversation={renderedConversation}
				saveToAndOpenNewNote={saveToAndOpenNewNote}
				appendToActiveNote={appendToActiveNote}
			/>
		</>
	)
}
