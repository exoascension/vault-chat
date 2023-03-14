import * as React from "react";
import { ChatCompletionRequestMessage } from "openai/api";

interface Props {
	conversation: Array<ChatCompletionRequestMessage>,
}
export const ChatGPTConversation: React.FC<Props> = (props: Props) => {
	const { conversation } = props
	return (
		<>
			{conversation.length > 0 && (
				<div className={'chat-box'}>
				{conversation.map((message, index) => (
					<p key={index}><span className={`role-${message.role}`}>{message.role}:</span> {message.content}</p>
				))}
				</div>
			)}
		</>
	)
}
