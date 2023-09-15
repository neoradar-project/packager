# NeoRadar Packager
## Description
Utility for packaging GNG ATC bundle into a NeoRadar ATC package.
This is a prelimanary version of the packager. It is not yet ready for production use.
Aims to be converted later into a node.js module/dependency and refractored depending on the needs.

## Requirements
Install tippenacoe globally
> npm install tippecanoe

## Usage

WARNING : not tested on Windows yet.

Duplicate input json file in src/data/example and edit fields with absolute paths to your data.
Please pay attention to define a writable outputDir.

execute the app using :
> npm run start -- 'PATH_TO_YOUR_JSON_FILE'

You can use this command for live coding if needed :
> npm run build:live -- 'PATH_TO_YOUR_JSON_FILE'
