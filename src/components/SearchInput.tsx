import * as React from "react";

interface Props {
	className: string | undefined;
	buttonDisabled: boolean;
	inputDisabled: boolean;
	userMessage: string;
	userMessageOnChange: (e: { target: { value: React.SetStateAction<string>; }; }) => void;
	onClickSubmit: () => void;
}
export const SearchInput: React.FC<Props> = (props: Props) => {
	const { className, userMessage, userMessageOnChange, onClickSubmit, buttonDisabled, inputDisabled } = props
	const handleKeyDown = (e: { key: string; }) => {
		if (e.key === 'Enter') {
			onClickSubmit()
		}
	}
	return (
		<div className={`chat-input-layout ${className}`}>
			<input autoFocus className={'chat-input-input'} type="text" name="user-message" value={userMessage} onChange={userMessageOnChange} onKeyDown={handleKeyDown} disabled={inputDisabled}/>
			<button className={buttonDisabled ? 'button-disabled' : ''} disabled={buttonDisabled} onClick={onClickSubmit}>Submit</button>
		</div>
	)
}
