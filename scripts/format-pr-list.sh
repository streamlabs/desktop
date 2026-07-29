#!/bin/bash

# Format GitHub PR list as "title #number url"
gh pr list --json url,title,number | jq -r '.[] | "\(.title) #\(.number) \(.url)"'
