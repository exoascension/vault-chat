import * as React from "react";
import {useApp} from "./useApp";
import {MouseEventHandler, useEffect, useState} from "react";
import {TFile} from "obsidian";

interface Props {
	searchResults: Array<string>
}

type Result = {
	name: string;
	contents: string;
	onClick: MouseEventHandler<HTMLDivElement>;
}
export const SearchResults: React.FC<Props> = (props: Props) => {
	const { searchResults } = props
	const app = useApp()
	const [resultsToRender, setResultsToRender] = useState<Array<Result>>([])
	useEffect(() => {
		const hydrateResults = async () => {
			const hydratedResults = []
			for (const searchResult of searchResults) {
				const abstractFile = app?.vault.getAbstractFileByPath(searchResult) as TFile
				const fileContentsOrEmpty = await app?.vault.read(abstractFile)
				let fileContents: string = fileContentsOrEmpty ? fileContentsOrEmpty : ''
				if (fileContents.length > 120) {
					fileContents = `${fileContents.substring(0, 120)}...`
				}
				const fileName = searchResult.split('/').last()!!
				hydratedResults.push({
					name: fileName,
					contents: fileContents,
					onClick: () => {
						app?.workspace.getLeaf().openFile(abstractFile)
					}
				})
			}
			setResultsToRender(hydratedResults)
		}
		hydrateResults()
	}, [])
	return (
		<>
			{
				resultsToRender.map(result => (
					<div style={{
						width: '100%',
						border: '1px solid #000000',
						marginBottom: '5px',
						color: '#dadada',
						fontFamily: 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Microsoft YaHei Light", sans-serif'
					}} key={result.name} onClick={result.onClick}>
						<div style={{
							width: '100%',
							fontSize: '13px',
							backgroundColor: '#1e1e1e',
							padding: '5px'
						}}>{result.name}</div>
						<div style={{padding: '5px', fontSize: '12px'}}>{result.contents}</div>
					</div>
				))
			}
		</>
	);
};
