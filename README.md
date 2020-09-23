# Package Template

[![Known Vulnerabilities](https://snyk.io/test/github/5app/region-sync/badge.svg)](https://snyk.io/test/github/5app/region-sync)
[![CircleCI](https://circleci.com/gh/5app/package-template.svg?style=shield)](https://circleci.com/gh/5app/package-template)

This is a template for starting new JS projects at 5app.

## What now

1. Run `npm init` to configure [./package.json](./package.json]).
1. You also need to manually update [./package.json](./package.json]) for `name`, `version` and `description` and all repository links.
1. Implement tests (or `npm test` will fail).
1. Replace this file with real information about your package.
1. Write your code and commit/push.
1. Configure in [Circle CI](https://app.circleci.com/projects/project-dashboard/github/5app/).

### For packages to be posted to NPM

1. Remove the setting `private: true` from [./package.json](./package.json]).
   This protects accidentally publishing to _npm_. If you want to publish to npm then this will prevent it until removed.

### Notes

1. Changelog will be automatically populated during CI process.
