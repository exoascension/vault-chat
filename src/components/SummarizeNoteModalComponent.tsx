import * as React from "react";
import {useEffect, useState} from "react";
import { OpenAIHandler } from "../OpenAIHandler";
import { ChatCompletionRequestMessage } from "openai/api";
import {SaveOptions} from "./SaveOptions";
import {ChatGPTConversation} from "./ChatGPTConversation";

interface Props {
	openAIHandler: OpenAIHandler,

	saveToAndOpenNewNote: (text: string) => never,

	appendToActiveNote: (text: string) => never,

	fileName: string,

	fileContents: string
}
export const SummarizeNoteModalComponent: React.FC<Props> = (props: Props) => {
	const { openAIHandler, saveToAndOpenNewNote, appendToActiveNote, fileName, fileContents } = props;
	const [renderedConversation, setRenderedConversation] = useState<Array<ChatCompletionRequestMessage>>([])

	useEffect(() => {
		const getSummary = async () => {
			const requestMessages: Array<ChatCompletionRequestMessage> = []
			requestMessages.push({
				role: 'user',
				content: `Please summarize this note, which is titled "${fileName}": "${fileContents.substring(0,3000)}"`
			})
			const response = await openAIHandler.createChatCompletion(requestMessages)
			const summaryMessage = response.choices.first()?.message
			if (summaryMessage) {
				setRenderedConversation([summaryMessage])
			}
		}
		getSummary()
	}, [])

	return (
		<>
			<h1>Summarize my note, ChatGPT!</h1>
			<p>
				Assistant has been given your note "{fileName}", to summarize.
			</p>
			{ renderedConversation.length > 0 ? (
				<><ChatGPTConversation conversation={renderedConversation}/></>
			) : (
				<>Loading...</>
			)}
			<SaveOptions
				conversation={renderedConversation}
				saveToAndOpenNewNote={saveToAndOpenNewNote}
				appendToActiveNote={appendToActiveNote}
			/>
		</>
	)
}
