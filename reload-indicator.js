/*\
title: $:/plugins/rimir/filesystem-watcher/reload-indicator.js
type: application/javascript
module-type: startup

Browser-side module that watches for the reload alert tiddler
and toggles a CSS class on document.body to turn the refresh icon red.
The class is gone after F5 since $:/temp tiddlers don't survive reload.

\*/

"use strict";

exports.name = "filesystem-watcher-reload-indicator";
exports.after = ["startup"];
exports.platforms = ["browser"];
exports.synchronous = true;

exports.startup = function() {
	$tw.wiki.addEventListener("change", function(changes) {
		if(changes["alerts/filesystem-watcher-reload"]) {
			if($tw.wiki.tiddlerExists("alerts/filesystem-watcher-reload")) {
				$tw.wiki.addTiddler({
					title: "$:/temp/filesystem-watcher-reload-needed",
					text: "yes"
				});
				document.body.classList.add("tc-reload-needed");
			}
		}
	});
};
