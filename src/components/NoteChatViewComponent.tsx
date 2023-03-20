import * as React from "react";
import {OpenAIHandler} from "../OpenAIHandler";
import {ChatGPTConversation} from "./ChatGPTConversation";
import {useState} from "react";
import {ChatCompletionRequestMessage, ChatCompletionRequestMessageRoleEnum} from "openai/api";
import {SearchInput} from "./SearchInput";

interface Props {
	openAIHandler: OpenAIHandler,
	fileContents: string
}

export const NoteChatViewComponent: React.FC<Props> = (props: Props) => {
	const { openAIHandler, fileContents } = props
	const [userMessage, setUserMessage] = useState('')
	const [buttonDisabled, setButtonDisabled] = useState(true)
	const [inputDisabled, setInputDisabled] = useState(false)
	const [internalConversation, setInternalConversation] = useState<Array<ChatCompletionRequestMessage>>([])
	const [renderedConversation, setRenderedConversation] = useState<Array<ChatCompletionRequestMessage>>([])

	const userMessageOnChange = (e: { target: { value: React.SetStateAction<string>; }; }) => {
		setButtonDisabled(e.target.value.length === 0)
		setUserMessage(e.target.value)
	}

	const onClickSubmit = async () => {
		setButtonDisabled(true)
		setInputDisabled(true)
		setUserMessage('Loading...')

		// new conversation request will use the internalConversation so the assistant has all necessary history
		const newInternalConversation: Array<ChatCompletionRequestMessage> = Object.assign([], internalConversation);

		if (newInternalConversation.length === 0) {
			// the conversation should start with the note for context
			const systemMessageForContext: ChatCompletionRequestMessage = {
				role: 'system',
				content: `You are an assistant that helps humans write notes in their Obsidian.md vaults. I have written the following markdown note in Obsidian.md. When I ask you questions, I want you to respond as if the questions are about this note. If I ask you to complete a task, execute the task with this note as the input. Anytime I refer to a note, assume I am talking about this note. Here is the note:\n\n${fileContents}`
			}
			newInternalConversation.push(systemMessageForContext)
		}

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
				content: `I've encountered an error and could not complete your request`
			})
			setInternalConversation(newInternalConversation)
			setRenderedConversation(newRenderedConversation)
			setUserMessage('')
			setInputDisabled(false)
			return
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
		<div className={"note-chat-container"}>
			<p className={"note-chat-header"}>Ask questions about your active note!</p>
			<ChatGPTConversation className={"note-chat-body"} conversation={renderedConversation}/>
			<SearchInput className={"note-chat-footer"} buttonDisabled={buttonDisabled} inputDisabled={inputDisabled} userMessage={userMessage} userMessageOnChange={userMessageOnChange} onClickSubmit={onClickSubmit}/>
		</div>
	)
}
