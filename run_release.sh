#!/bin/bash

set -e

npm_version_params=$*

current_branch=$(git rev-parse --abbrev-ref HEAD)
if [[ "$current_branch" != "master" ]]; then
    echo 'Not in git master. Aborting release';
    exit 1;
fi

new_tag=$(npm version $npm_version_params)
npm run docs:publish
git push
git push origin $new_tag
npm publish
echo "libingester $new_tag Released!"
