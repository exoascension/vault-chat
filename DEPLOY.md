### How to deploy
1. Create a tag locally:
```bash
git pull origin main
git tag <version>
git push origin <version>
```
2. Build the app with `npm run dev`
3. [Create a Github Release](https://github.com/exoascension/vault-chat/releases/new) with the Release Title <version>, uploading the `main.js`, `styles.css`, and `manifest.json`.  Click "Generate Release Notes"
4. Make and merge a PR updating the version in the `manifest.json` to the <version> tagged earlier
