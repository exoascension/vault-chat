### How to deploy
1. Pull the latest changes: `git pull origin main`
1. Make a branch `git checkout -b release-<version>`
1. Update the version in the `package.json` and `manifest.json`
1. Commit the version changes, open and merge PR.
1. On `main` branch with latest changes, create and push a tag:
	```bash
	git tag <version>
	git push origin <version>
	```
1. Build the app with `npm run dev`
1. [Create a Github Release](https://github.com/exoascension/vault-chat/releases/new) with the Release Title <version>, uploading the `main.js`, `styles.css`, and `manifest.json`.  Click "Generate Release Notes"
