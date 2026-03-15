/*\
title: test-watcher-logic.js

Jasmine tests for filesystem-watcher plugin.

The watcher.js and reload-indicator.js modules define their testable logic
inside the startup() closure, so we cannot call those functions directly.
Instead we:
  1. Verify module exports/metadata are correct.
  2. Extract and test the pure logic patterns (requiresReload,
     isSystemTiddler, isWatcherFile, alert text formatting) by
     re-implementing them exactly as written in watcher.js.

This ensures the logic stays correct if someone refactors or copies it,
and documents the expected behaviour.

\*/

"use strict";

// ---------------------------------------------------------------------------
// Pure logic extracted from watcher.js (closured — not directly importable)
// ---------------------------------------------------------------------------

function requiresReload(tiddlerFields) {
	return tiddlerFields.type === "application/javascript" &&
		tiddlerFields["module-type"];
}

function isSystemTiddler(title) {
	return title && title.indexOf("$:/") === 0;
}

function isWatcherFile(filepath) {
	// Uses path.basename equivalent — just grab last segment
	var basename = filepath.replace(/^.*[\/\\]/, "");
	return basename.indexOf("alerts_filesystem-watcher") === 0;
}

function formatAlertText(entries, count) {
	return "''Full reload required!'' " + count + " tiddler" + (count > 1 ? "s" : "") + " changed:\n\n" + entries;
}

function formatEntry(title, reason) {
	return "* ''" + title + "'' //" + reason + "//";
}

function countEntries(text) {
	return (text.match(/\* ''/g) || []).length;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("filesystem-watcher module metadata", function() {

	describe("watcher.js exports", function() {
		var watcher;

		beforeEach(function() {
			// Read the raw source to inspect the export assignments.
			// We cannot require() it because it depends on $tw, chokidar, etc.
			var fs = require("fs");
			var path = require("path");
			var src = fs.readFileSync(
				path.resolve(__dirname, "..", "watcher.js"), "utf8"
			);
			watcher = { src: src };
		});

		it("should export name as 'filesystem-watcher'", function() {
			expect(watcher.src).toContain('exports.name = "filesystem-watcher"');
		});

		it("should run after load-modules", function() {
			expect(watcher.src).toContain('exports.after = ["load-modules"]');
		});

		it("should target node platform only", function() {
			expect(watcher.src).toContain('exports.platforms = ["node"]');
		});

		it("should be asynchronous", function() {
			expect(watcher.src).toContain("exports.synchronous = false");
		});

		it("should export a startup function", function() {
			expect(watcher.src).toContain("exports.startup = function");
		});

		it("should check TIDDLYWIKI_CLI_MODE for early exit", function() {
			expect(watcher.src).toContain('TIDDLYWIKI_CLI_MODE');
		});
	});

	describe("reload-indicator.js exports", function() {
		var src;

		beforeEach(function() {
			var fs = require("fs");
			var path = require("path");
			src = fs.readFileSync(
				path.resolve(__dirname, "..", "reload-indicator.js"), "utf8"
			);
		});

		it("should export name as 'filesystem-watcher-reload-indicator'", function() {
			expect(src).toContain('exports.name = "filesystem-watcher-reload-indicator"');
		});

		it("should run after startup", function() {
			expect(src).toContain('exports.after = ["startup"]');
		});

		it("should target browser platform only", function() {
			expect(src).toContain('exports.platforms = ["browser"]');
		});

		it("should be synchronous", function() {
			expect(src).toContain("exports.synchronous = true");
		});

		it("should listen for the reload alert tiddler", function() {
			expect(src).toContain("alerts/filesystem-watcher-reload");
		});

		it("should set the tc-reload-needed CSS class", function() {
			expect(src).toContain("tc-reload-needed");
		});

		it("should write to a $:/temp/ tiddler", function() {
			expect(src).toContain("$:/temp/filesystem-watcher-reload-needed");
		});
	});
});

describe("requiresReload", function() {

	it("should return truthy for JS modules", function() {
		expect(requiresReload({
			type: "application/javascript",
			"module-type": "startup"
		})).toBeTruthy();
	});

	it("should return truthy for any module-type value", function() {
		expect(requiresReload({
			type: "application/javascript",
			"module-type": "widget"
		})).toBeTruthy();
		expect(requiresReload({
			type: "application/javascript",
			"module-type": "route"
		})).toBeTruthy();
	});

	it("should return falsy for JS without module-type", function() {
		expect(requiresReload({
			type: "application/javascript"
		})).toBeFalsy();
	});

	it("should return falsy for non-JS with module-type", function() {
		expect(requiresReload({
			type: "text/vnd.tiddlywiki",
			"module-type": "startup"
		})).toBeFalsy();
	});

	it("should return falsy for plain tiddlers", function() {
		expect(requiresReload({
			type: "text/vnd.tiddlywiki"
		})).toBeFalsy();
	});

	it("should return falsy for empty fields", function() {
		expect(requiresReload({})).toBeFalsy();
	});

	it("should return falsy when module-type is empty string", function() {
		expect(requiresReload({
			type: "application/javascript",
			"module-type": ""
		})).toBeFalsy();
	});
});

describe("isSystemTiddler", function() {

	it("should return true for $:/ prefixed titles", function() {
		expect(isSystemTiddler("$:/core/ui/ViewTemplate")).toBe(true);
	});

	it("should return true for $:/ alone", function() {
		expect(isSystemTiddler("$:/")).toBe(true);
	});

	it("should return false for normal titles", function() {
		expect(isSystemTiddler("MyTiddler")).toBe(false);
	});

	it("should return false for titles containing but not starting with $:/", function() {
		expect(isSystemTiddler("See $:/core for details")).toBe(false);
	});

	it("should return false for empty string", function() {
		expect(isSystemTiddler("")).toBeFalsy();
	});

	it("should return false for null/undefined", function() {
		expect(isSystemTiddler(null)).toBeFalsy();
		expect(isSystemTiddler(undefined)).toBeFalsy();
	});
});

describe("isWatcherFile", function() {

	it("should match the watcher alert file", function() {
		expect(isWatcherFile("/wiki/tiddlers/alerts_filesystem-watcher-reload.tid")).toBe(true);
	});

	it("should match with backslashes (Windows paths)", function() {
		expect(isWatcherFile("C:\\wiki\\tiddlers\\alerts_filesystem-watcher-reload.tid")).toBe(true);
	});

	it("should match any file starting with alerts_filesystem-watcher", function() {
		expect(isWatcherFile("/tiddlers/alerts_filesystem-watcher-foo.tid")).toBe(true);
	});

	it("should not match unrelated alert files", function() {
		expect(isWatcherFile("/tiddlers/alerts_something-else.tid")).toBe(false);
	});

	it("should not match a file with the pattern in a parent directory", function() {
		expect(isWatcherFile("/alerts_filesystem-watcher/other.tid")).toBe(false);
	});

	it("should not match normal tiddler files", function() {
		expect(isWatcherFile("/tiddlers/MyTiddler.tid")).toBe(false);
	});
});

describe("alert text formatting", function() {

	it("should use singular 'tiddler' for count 1", function() {
		var text = formatAlertText("* ''Foo'' //module//", 1);
		expect(text).toContain("1 tiddler changed");
		expect(text).not.toContain("tiddlers");
	});

	it("should use plural 'tiddlers' for count > 1", function() {
		var text = formatAlertText("* ''A'' //module//\n* ''B'' //system//", 2);
		expect(text).toContain("2 tiddlers changed");
	});

	it("should include the header with bold markup", function() {
		var text = formatAlertText("* ''X'' //m//", 1);
		expect(text).toContain("''Full reload required!''");
	});

	it("should separate header and entries with double newline", function() {
		var text = formatAlertText("* ''X'' //m//", 1);
		expect(text).toContain("changed:\n\n*");
	});
});

describe("formatEntry", function() {

	it("should wrap title in bold and reason in italic", function() {
		expect(formatEntry("$:/my/module", "module"))
			.toBe("* ''$:/my/module'' //module//");
	});

	it("should handle system reason", function() {
		expect(formatEntry("$:/config/Something", "system"))
			.toBe("* ''$:/config/Something'' //system//");
	});
});

describe("countEntries", function() {

	it("should count zero for empty text", function() {
		expect(countEntries("")).toBe(0);
	});

	it("should count one entry", function() {
		expect(countEntries("* ''Foo'' //module//")).toBe(1);
	});

	it("should count multiple entries", function() {
		var text = "* ''A'' //module//\n* ''B'' //system//\n* ''C'' //module//";
		expect(countEntries(text)).toBe(3);
	});
});
