import * as React from "react";
import { useState } from "react";
import { OpenAIHandler } from "../OpenAIHandler";
import {ChatCompletionRequestMessage, ChatCompletionRequestMessageRoleEnum} from "openai/api";
import { SearchResult } from "../main";
import {SaveOptions} from "./SaveOptions";
import {ChatGPTConversation} from "./ChatGPTConversation";
import {IndexingNotification} from "./IndexingNotification";
import {SearchInput} from "./SearchInput";

interface Props {
	openAIHandler: OpenAIHandler,
	getSearchResultsFiles: (searchTerm: string, includeRedundantBlocks: boolean) => Promise<Array<SearchResult>>,

	isIndexingComplete: Promise<void>,

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
	const [showIndexingBanner, setShowIndexingBanner] = useState(true)

	isIndexingComplete.then(() => {
		if (showIndexingBanner) setShowIndexingBanner(false)
	})
	const userMessageOnChange = (e: { target: { value: React.SetStateAction<string>; }; }) => {
		setButtonDisabled(e.target.value.length === 0)
		setUserMessage(e.target.value)
	}

	const onClickSubmit = async () => {
		setButtonDisabled(true)
		setUserMessage('Loading...')
		setInputDisabled(true)

		// new conversation request will use the internalConversation so the assistant has all necessary history
		const newInternalConversation: Array<ChatCompletionRequestMessage> = Object.assign([], internalConversation);
		const searchResults = await getSearchResultsFiles(userMessage, false)

		const systemMessageForContext: ChatCompletionRequestMessage = {
			role: 'system',
			content: `Imagine the following texts were written by me and represent my own opinions. When I ask you as question, use the texts to inform your answers. Start your answers with "Based on your notes..."   
			${searchResults.map((result: SearchResult) => `${result.name}: ${result.contents}`).join('\n')}`
		}
		newInternalConversation.push(systemMessageForContext)
		newInternalConversation.push({
			role: 'user',
			content: userMessage
		})

		const response = await openAIHandler.createChatCompletion(newInternalConversation)
		if (!response) {
			// don't show system messages to the user
			const newRenderedConversation = newInternalConversation.filter(
				message => message.role !== ChatCompletionRequestMessageRoleEnum.System)
			newRenderedConversation.push({
				role: ChatCompletionRequestMessageRoleEnum.Assistant,
				content: `I've encountered an error and cannot complete your request`
			})
			setInternalConversation(newInternalConversation)
			setRenderedConversation(newRenderedConversation)
			setUserMessage('')
			setInputDisabled(false)
			return
		}

		// be mindful of the 4096 token limit and remove some old context if we're getting close
		const responseTokensTotal = response.usage?.total_tokens
		if (responseTokensTotal) {
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
			<ChatGPTConversation conversation={renderedConversation} className={""}/>
			<SearchInput className={""} buttonDisabled={buttonDisabled} inputDisabled={inputDisabled} userMessage={userMessage} userMessageOnChange={userMessageOnChange} onClickSubmit={onClickSubmit}/>
			<SaveOptions
				conversation={renderedConversation}
				saveToAndOpenNewNote={saveToAndOpenNewNote}
				appendToActiveNote={appendToActiveNote}
			/>
		</>
	)
}
