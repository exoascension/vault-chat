import * as React from "react";
import { useState } from "react";
import { ChatCompletionRequestMessage } from "openai/api";

interface Props {
	conversation: Array<ChatCompletionRequestMessage>,

	saveToAndOpenNewNote: Function,

	appendToActiveNote: Function
}
export const SaveOptions: React.FC<Props> = (props: Props) => {
	const { saveToAndOpenNewNote, appendToActiveNote, conversation } = props;
	const [showSaveOptions, setShowSaveOptions] = useState(false)

	const formatText = () => {
		return conversation.map(message => `${message.role}: ${message.content}`).join(`\n`)
	}

	const onClickCopy = () => {
		navigator.clipboard.writeText(formatText())
	}

	const onClickNewNote = () => {
		saveToAndOpenNewNote(formatText())
	}

	const onClickAppendNote = () => {
		appendToActiveNote(formatText())
	}

	return (
		<>
			<p onClick={() => setShowSaveOptions(prev => !prev)}>{showSaveOptions ? '-' : '+'} Save options</p>
			{ showSaveOptions && (
				<div className={"save-options-panel"}>
					<button onClick={onClickCopy}>Copy</button>
					<button onClick={onClickNewNote}>New note</button>
					<button onClick={onClickAppendNote}>Append to note</button>
				</div>
			)}
		</>
	)
}
