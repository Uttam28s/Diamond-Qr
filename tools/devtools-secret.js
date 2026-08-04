#!/usr/bin/env node
/**
 * Prints the hash to paste into public/main/devtools.js.
 *
 *   npm run devtools:secret -- "your new word"
 *
 * Only the hash goes into the app, so unpacking the installer does not reveal
 * the word. Choose something nobody would try: it is the only thing standing
 * between a curious employee and the app's internals.
 */

const crypto = require("crypto");

const word = process.argv.slice(2).join(" ").trim();

if (!word) {
  console.error('Usage: npm run devtools:secret -- "your new word"');
  process.exit(1);
}

if (word.length < 8) {
  console.error("Too short - use at least 8 characters.");
  process.exit(1);
}

const hash = crypto.createHash("sha256").update(word, "utf8").digest("hex");

console.log(`\n  word:  ${word}`);
console.log(`  hash:  ${hash}\n`);
console.log("Paste that hash over SECRET_SHA256 in public/main/devtools.js,");
console.log("then rebuild with `npm run dist`.\n");
