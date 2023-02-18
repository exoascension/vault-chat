#!/bin/bash

# Verify the VAULT_PATH is set
if [[ -z "$VAULT_PATH" ]]; then
    echo "Must provide VAULT_PATH in environment to deploy plugin" 1>&2
    exit 1
fi

# Strip any trailing / in case someone set the variable wrong
VAULT_PATH_FORMATTED=${VAULT_PATH%/}

PLUGIN_PATH=$VAULT_PATH/.obsidian/plugins/obsidian-semantic-search

# Make folder if it doesn't exist
mkdir -p "$PLUGIN_PATH"

# Deploy the plugin
cp {main.js,styles.css,manifest.json} "$PLUGIN_PATH/"