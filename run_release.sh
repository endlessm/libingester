#!/bin/bash -e

usage="Usage: npm run release -- SEMVER"

if [ $# -ne 1 ]; then
    echo 'One single argument is needed'
    echo $usage
    exit 1
fi

npm_version_params=$*

read -p "Are you sure you want to release? (y/n) " -n 1 -r
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 0;
fi
echo

current_branch=$(git rev-parse --abbrev-ref HEAD)
if [[ "$current_branch" != "master" ]]; then
    echo 'Not in git master. Aborting release';
    exit 1;
fi

new_tag=$(npm version $npm_version_params)
npm run docs:publish
git push origin --tags master
npm publish
echo "libingester $new_tag Released!"
