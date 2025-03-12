# Packager

## Overview

Packager is a utility for processing and preparing radar data packages from EuroScope, with primary support for GNG formatted sector files. This is a preliminary version that is not yet ready for production use.

## Quick Start

1. `git clone https://github.com/neoradar-project/packager.git`
2. `npm install`
3. `npm run start -- 'PATH_TO_YOUR_JSON_FILE'`

## Example Configuration

- An example `input_example.json` can be found in `src/data/example` alongside the `base-package`

```json
{
  "id": "LFXX_AIRAC_2307_1",
  "name": "LFXX - AIRAC 2307 Rev 1",
  "description": "Sample package description",
  "namespace": "lfxx",
  "sctPath": "/path/to/sector-file.sct",
  "esePath": "/path/to/ese-file.ese",
  "loginProfilesPath": "/absolute/path/to/profiles.txt",
  "icaoAircraftPath": "/absolute/path/to/aircraft.txt",
  "icaoAirlinesPath": "/absolute/path/to/airlines.txt",
  "recatDefinitionPath": "/absolute/path/to/recat.json",
  "aliasPath": "/absolute/path/to/alias.txt",
  "outputDir": "/absolute/path/to/output/directory/",
  "asrPath": "/absolute/path/to/asr-directory",
  "packageOverride": "",
  "useSctLabels": false,
  "isGNG": true
}
```
