const fs = require("fs");
const raw = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const text = raw[0].text;
const start = text.indexOf("[{");
const end = text.lastIndexOf("]") + 1;
const jsonStr = text.slice(start, end);
try {
  // This slice is itself an escaped JSON string (one extra layer of
  // JSON.stringify was applied upstream). Decode it by parsing it as
  // the body of a JSON string literal.
  const unescaped = JSON.parse('"' + jsonStr.replace(/\r?\n/g, "\\n") + '"');
  const rows = JSON.parse(unescaped);
  fs.writeFileSync(process.argv[3], JSON.stringify(rows, null, 2));
  for (const r of rows) {
    console.log("=== " + (r.proname || r.viewname || r.tgname) + " ===");
    if (r.identity_args !== undefined) console.log("ARGS: " + r.identity_args);
  }
  console.log("TOTAL ROWS: " + rows.length);
} catch (e) {
  console.log("PARSE ERROR: " + e.message);
  fs.writeFileSync(process.argv[3] + ".debug.txt", jsonStr);
}
