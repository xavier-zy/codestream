## Usage

1.  clone the repo
2.  `cd` into it
3.  run `npm install --no-save` (On Windows 10, install npm from https://nodejs.org/en/)

### Workflow

Follow the workflow for the extension you're using. Right now, building the webview is a task the extension initiates.

### Utils

#### build-png-icons

This is a utility to convert SVGs into PNGs

`codestream\shared\ui\utilities> node .\build-png-icons.ts -c "#898F9E"`

On Windows (uses current directory as the output)

`codestream\shared\ui\utilities> node .\build-png-icons.ts -c "#898F9E" -o ".\"`

Convert a single icon

`codestream\shared\ui\utilities> node .\build-png-icons.ts -c "#898F9E" -o ".\" -n "clubhouse"`
