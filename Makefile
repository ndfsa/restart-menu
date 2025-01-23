NAME=restart-menu
UUID=$(NAME)@ndfsa.github.io

.PHONY: all pack install clean

all: dist/extension.js

node_modules: package.json
	npm install

dist/extension.js: node_modules
	tsc

build: dist/extension.js
	@cp -r schemas dist/
	@cp metadata.json dist/

pack: build
	@(cd dist && gnome-extensions pack -f \
		--schema=./schemas/org.gnome.shell.extensions.restart-menu.gschema.xml \
		-o ../)


install: pack
	gnome-extensions install -f $(UUID).shell-extension.zip

clean:
	@rm -rf dist node_modules $(UUID).shell-extension.zip schemas/gschemas.compiled
