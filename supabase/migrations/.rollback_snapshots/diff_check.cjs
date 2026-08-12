const fs = require("fs");

const oldRows = JSON.parse(fs.readFileSync("supabase/migrations/.rollback_snapshots/pre_20260812090000_functions.json", "utf8"));
const migrationText = fs.readFileSync("supabase/migrations/20260812090000_dynamic_categories_shared_rpcs_and_views.sql", "utf8");

// Split migration into top-level "create or replace function ... $function$;" blocks,
// bounding each block at its own "$function$;" (or "end $$;" for the $$-quoted one)
// terminator rather than the next CREATE, so overloaded functions don't bleed into
// each other.
const blocks = [];
const re = /create or replace function public\.([a-zA-Z_]+)\(/g;
let m;
const starts = [];
while ((m = re.exec(migrationText))) {
  starts.push({ name: m[1], idx: m.index });
}
for (let i = 0; i < starts.length; i++) {
  const startIdx = starts[i].idx;
  let endIdx = migrationText.indexOf("$function$;", startIdx);
  if (endIdx === -1) endIdx = migrationText.indexOf("end $$;", startIdx);
  endIdx = endIdx === -1 ? migrationText.length : endIdx + (migrationText.slice(endIdx).startsWith("$function$;") ? "$function$;".length : "end $$;".length);
  const block = migrationText.slice(startIdx, endIdx);
  blocks.push({ name: starts[i].name, text: block.trim() });
}

function normalize(sql) {
  return sql
    .replace(/create or replace function/gi, "CREATE OR REPLACE FUNCTION")
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .join("\n")
    .trim();
}

function diffLines(a, b) {
  const al = a.split("\n");
  const bl = b.split("\n");
  // simple LCS-based diff
  const n = al.length, p = bl.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(p + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = p - 1; j >= 0; j--) {
      dp[i][j] = al[i] === bl[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < p) {
    if (al[i] === bl[j]) { i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push("- " + al[i]); i++; }
    else { out.push("+ " + bl[j]); j++; }
  }
  while (i < n) { out.push("- " + al[i]); i++; }
  while (j < p) { out.push("+ " + bl[j]); j++; }
  return out;
}

const targets = [
  "apply_inventory_operation_rpc",
  "apply_inventory_operation_transactional_rpc",
  "delete_inventory_operation_rpc",
  "delete_inventory_record_permanently_rpc",
  "match_inventory_item_rpc",
  "return_inventory_item_rpc",
  "update_inventory_item_details_rpc",
  "update_inventory_item_details_with_version_rpc",
  "get_used_project_names",
  "prevent_used_project_rename",
  "record_new_stock_item_as_add_movement",
];

for (const name of targets) {
  const oldMatches = oldRows.filter((r) => r.proname === name);
  const newMatches = blocks.filter((b) => b.name === name);
  console.log("\n########## " + name + " ##########");
  console.log("old overloads: " + oldMatches.length + " | new blocks in migration: " + newMatches.length);

  if (oldMatches.length === 1 && newMatches.length === 1) {
    const diff = diffLines(normalize(oldMatches[0].definition), normalize(newMatches[0].text));
    console.log(diff.length ? diff.join("\n") : "(byte-identical)");
  } else {
    // pair up overloads by whether they contain p_request_id
    for (const nb of newMatches) {
      const hasReq = /p_request_id/.test(nb.text);
      const ob = oldMatches.find((o) => /p_request_id/.test(o.identity_args) === hasReq);
      console.log("--- overload " + (hasReq ? "WITH p_request_id" : "WITHOUT p_request_id") + " ---");
      if (!ob) { console.log("NO MATCHING OLD OVERLOAD FOUND"); continue; }
      const diff = diffLines(normalize(ob.definition), normalize(nb.text));
      console.log(diff.length ? diff.join("\n") : "(byte-identical)");
    }
  }
}
