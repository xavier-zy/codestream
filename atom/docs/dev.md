# CodeStream for Atom

## To get started

1. clone the repo
   `git clone https://github.com/TeamCodeStream/codestream.git`
2. `cd` into `atom`
3. run `apm link --dev`, which tells atom to use this directory as the package source for atom windows running in dev mode.
4. open atom in dev mode (`atom --dev path/to/project`) to debug the extension
5. run `npm install`
6. run `npm run build`
7. run `npm run watch`

## For development

1. install the prettier-atom package in atom
2. in the settings for prettier-atom, enable the following settings

- 'Format Files on Save'
- 'Only format if Prettier is found in your project's dependencies'

## NPM scripts

- `build`: builds both the extension and webview
- `watch`: watches both the extension and webview
- `extension:build`
- `extension:watch`
- `webview:build`
- `webview:watch`. webview changes don't require a reload of the debugging window. just kill and reopen the codestream view
- `bundle`: create production versions of everything
- `pack [currently released package version]`: copy everything into the public repo to be published

**Pro-tip** `apm install teamcodestream/codestream-atom-toolbar` for a toolbar with buttons to easily change environments, reload the window, and signout
