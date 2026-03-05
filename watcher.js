/*\
title: $:/plugins/rimir/filesystem-watcher/watcher.js
type: application/javascript
module-type: startup

Watches the wiki tiddlers directory for external changes using chokidar
and syncs them into the in-memory wiki store.

\*/

"use strict";

exports.name = "filesystem-watcher";
exports.after = ["load-modules"];
exports.platforms = ["node"];
exports.synchronous = false;

exports.startup = function(callback) {
	// Option 3: self-aware CLI detection — skip watcher entirely in CLI mode
	if(process.env.TIDDLYWIKI_CLI_MODE === "1") {
		callback();
		return;
	}

	var chokidar = require("chokidar"),
		path = require("path"),
		fs = require("fs");

	var logger = new $tw.utils.Logger("filesystem-watcher", {colour: "green"});
	var tiddlersPath = $tw.boot.wikiTiddlersPath;

	if(!tiddlersPath) {
		logger.log("No tiddlers path found, watcher not started");
		callback();
		return;
	}

	// Clear any stale alert from previous session
	$tw.wiki.deleteTiddler("alerts/filesystem-watcher-reload");

	// Set to track files recently written by TiddlyWiki itself (to avoid re-import loops)
	var recentlyWritten = {};
	var WRITE_LOCK_MS = 1500;

	// Debounce timers per file
	var debounceTimers = {};
	var DEBOUNCE_MS = 200;

	// Hook into TiddlyWiki's file save to track writes we should ignore
	var origSaveTiddlerToFile = $tw.utils.saveTiddlerToFile;
	$tw.utils.saveTiddlerToFile = function(tiddler, fileInfo, cb) {
		var filepath = fileInfo.filepath;
		if(filepath) {
			var normalized = path.resolve(filepath);
			recentlyWritten[normalized] = Date.now();
			// Also mark meta file if applicable
			if(fileInfo.hasMetaFile) {
				recentlyWritten[normalized + ".meta"] = Date.now();
			}
		}
		return origSaveTiddlerToFile.apply(this, arguments);
	};

	// Also hook into delete to ignore unlink events from TW's own deletions
	var origDeleteTiddlerFile = $tw.utils.deleteTiddlerFile;
	$tw.utils.deleteTiddlerFile = function(fileInfo, cb) {
		var filepath = fileInfo.filepath;
		if(filepath) {
			var normalized = path.resolve(filepath);
			recentlyWritten[normalized] = Date.now();
			if(fileInfo.hasMetaFile) {
				recentlyWritten[normalized + ".meta"] = Date.now();
			}
		}
		return origDeleteTiddlerFile.apply(this, arguments);
	};

	function isRecentlyWritten(filepath) {
		var normalized = path.resolve(filepath);
		var timestamp = recentlyWritten[normalized];
		if(timestamp && (Date.now() - timestamp) < WRITE_LOCK_MS) {
			return true;
		}
		delete recentlyWritten[normalized];
		return false;
	}

	// Find tiddler title by filepath in $tw.boot.files
	function findTitleByPath(filepath) {
		var normalized = path.resolve(filepath);
		for(var title in $tw.boot.files) {
			if($tw.boot.files[title].filepath && path.resolve($tw.boot.files[title].filepath) === normalized) {
				return title;
			}
		}
		return null;
	}

	// Alert tiddler title for reload notifications
	var ALERT_TITLE = "alerts/filesystem-watcher-reload";

	// Update the syncer's tiddlerInfo so it doesn't re-save tiddlers we just loaded from disk
	function updateSyncerInfo(title) {
		if($tw.syncer) {
			var tiddler = $tw.wiki.getTiddler(title);
			$tw.syncer.tiddlerInfo[title] = {
				changeCount: $tw.wiki.getChangeCount(title),
				adaptorInfo: $tw.syncer.syncadaptor ? $tw.syncer.syncadaptor.getTiddlerInfo(tiddler) : {},
				revision: $tw.wiki.getChangeCount(title)
			};
		}
	}

	function requiresReload(tiddlerFields) {
		return tiddlerFields.type === "application/javascript" &&
			tiddlerFields["module-type"];
	}

	function isSystemTiddler(title) {
		return title && title.indexOf("$:/") === 0;
	}

	function setReloadAlert(changedTitle, reason) {
		var existing = $tw.wiki.getTiddler(ALERT_TITLE);
		var entries;
		if(existing) {
			entries = existing.fields.text.replace(/^.*?:\n\n/,"");
			if(entries.indexOf("* ''" + changedTitle + "''") === -1) {
				entries = entries + "\n* ''" + changedTitle + "'' //" + reason + "//";
			}
		} else {
			entries = "* ''" + changedTitle + "'' //" + reason + "//";
		}
		var count = (entries.match(/\* ''/g) || []).length;
		$tw.wiki.addTiddler(new $tw.Tiddler({
			title: ALERT_TITLE,
			tags: "$:/tags/Alert",
			component: "filesystem-watcher",
			modified: $tw.utils.stringifyDate(new Date()),
			text: "''Full reload required!'' " + count + " tiddler" + (count > 1 ? "s" : "") + " changed:\n\n" + entries
		}));
		updateSyncerInfo(ALERT_TITLE);
		logger.log("Reload required for:", changedTitle, "(" + reason + ")");
	}

	function isWatcherFile(filepath) {
		return path.basename(filepath).indexOf("alerts_filesystem-watcher") === 0;
	}

	function handleFileChange(filepath) {
		if(isWatcherFile(filepath) || isRecentlyWritten(filepath)) {
			return;
		}
		try {
			if(!fs.existsSync(filepath)) {
				return;
			}
			var tiddlers = $tw.loadTiddlersFromFile(filepath);
			if(tiddlers && tiddlers.tiddlers) {
				$tw.utils.each(tiddlers.tiddlers, function(tiddlerFields) {
					var title = tiddlerFields.title;
					if(title) {
						// Update boot.files mapping
						$tw.boot.files[title] = {
							filepath: filepath,
							type: tiddlers.type || "application/x-tiddler",
							hasMetaFile: tiddlers.hasMetaFile || false
						};
						$tw.wiki.addTiddler(new $tw.Tiddler(tiddlerFields));
						updateSyncerInfo(title);
						logger.log("Reloaded:", title);
						// Check if this tiddler requires a full browser reload
						if(requiresReload(tiddlerFields)) {
							setReloadAlert(title, "module");
						} else if(isSystemTiddler(title)) {
							setReloadAlert(title, "system");
						}
					}
				});
			}
		} catch(e) {
			logger.log("Error loading file " + filepath + ": " + e.message);
		}
	}

	function handleFileDelete(filepath) {
		if(isWatcherFile(filepath) || isRecentlyWritten(filepath)) {
			return;
		}
		var title = findTitleByPath(filepath);
		if(title) {
			delete $tw.boot.files[title];
			$tw.wiki.deleteTiddler(title);
			if($tw.syncer) {
				delete $tw.syncer.tiddlerInfo[title];
			}
			logger.log("Deleted:", title);
		}
	}

	function debouncedChange(filepath) {
		var key = path.resolve(filepath);
		if(debounceTimers[key]) {
			clearTimeout(debounceTimers[key]);
		}
		debounceTimers[key] = setTimeout(function() {
			delete debounceTimers[key];
			handleFileChange(filepath);
		}, DEBOUNCE_MS);
	}

	function debouncedDelete(filepath) {
		var key = path.resolve(filepath);
		if(debounceTimers[key]) {
			clearTimeout(debounceTimers[key]);
		}
		debounceTimers[key] = setTimeout(function() {
			delete debounceTimers[key];
			handleFileDelete(filepath);
		}, DEBOUNCE_MS);
	}

	// Start watching
	var watcher = chokidar.watch(tiddlersPath, {
		ignored: /(^|[\/\\])\./,  // ignore dotfiles
		persistent: true,
		ignoreInitial: true,       // don't fire for existing files on startup
		awaitWriteFinish: {
			stabilityThreshold: 200,
			pollInterval: 50
		}
	});

	watcher
		.on("add", function(filepath) {
			debouncedChange(filepath);
		})
		.on("change", function(filepath) {
			debouncedChange(filepath);
		})
		.on("unlink", function(filepath) {
			debouncedDelete(filepath);
		})
		.on("ready", function() {
			logger.log("Watching for external changes in:", tiddlersPath);
			callback();
		})
		.on("error", function(error) {
			logger.log("Watcher error:", error.message);
		});
};
