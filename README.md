# filesystem watcher

> Watches the tiddlers directory for external filesystem changes and syncs them into the wiki

Watches the tiddlers directory for external filesystem changes (created, modified, deleted by tools like Claude Code) and syncs them into the running wiki in real time.

## Key features

* **Live file sync** -- detects file changes via chokidar and updates the wiki store automatically
* **Reload alerts** -- yellow alert + red refresh icon for changes requiring a browser reload (module tiddlers, system tiddlers)
* **Loop prevention** -- hooks TW's save/delete functions to ignore its own filesystem writes
* **CLI mode skip** -- exits immediately when `TIDDLYWIKI_CLI_MODE=1` so CLI imports don't hang
* **Configurable poll interval** -- set sync frequency in settings

## Prerequisites

* chokidar (npm dependency, installed with the wiki)

## Quick start

Install plugin. Configure the poll interval in ControlPanel > Settings > filesystem watcher. External file changes in the tiddlers directory sync automatically into the running wiki.

## Plugin Library

Install from the [rimir plugin library](https://rimir-cc.github.io/tw-plugin-library/) via *Control Panel → Plugins → Get more plugins*.

## License

MIT -- see [LICENSE.md](LICENSE.md)
