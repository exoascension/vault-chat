import * as React from "react";

export const SearchResults = () => {
	const results = [
		{
			name: 'The first result.md',
			content: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, ' +
				'sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ' +
				'Mi proin sed libero enim sed faucibus.',
			score: 75
		},
		{
			name: 'The second result.md',
			content: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, ' +
				'sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ' +
				'Mi proin sed libero enim sed faucibus.',
			score: 63
		},
		{
			name: 'The third result.md',
			content: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, ' +
				'sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ' +
				'Mi proin sed libero enim sed faucibus.',
			score: 15
		}
	]
	return (
		<>
			{
				results.map(result => (
					<div style={{
						width: '100%',
						border: '1px solid #000000',
						marginBottom: '5px',
						color: '#dadada',
						fontFamily: 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Microsoft YaHei Light", sans-serif'
					}} key={result.name}>
						<div style={{
							width: '100%',
							fontSize: '13px',
							backgroundColor: '#1e1e1e',
							padding: '5px'
						}}>{result.name}</div>
						<div style={{padding: '5px', fontSize: '12px'}}>{result.content}</div>
					</div>
				))
			}
		</>
	);
};
