UUID=restart-menu@ndfsa.github.io

.PHONY: all pack install clean

all: compile

node_modules: package.json
	@npm install

compile: node_modules src/*.ts
	@tsc

build: compile
	@cp -r schemas dist/
	@cp metadata.json dist/

pack: build
	@(cd dist && gnome-extensions pack -f)

install: pack
	@gnome-extensions install -f dist/$(UUID).shell-extension.zip

clean:
	@rm -rf dist node_modules
