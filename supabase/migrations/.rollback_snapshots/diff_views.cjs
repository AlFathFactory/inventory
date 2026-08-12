const fs = require("fs");

const oldSql = fs.readFileSync("supabase/migrations/.rollback_snapshots/pre_20260812090000_views_and_triggers.sql", "utf8");
const newSql = fs.readFileSync("supabase/migrations/20260812090000_dynamic_categories_shared_rpcs_and_views.sql", "utf8");

function diffLines(a, b) {
  const al = a.split("\n");
  const bl = b.split("\n");
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

function extractView(sql, startMarker, stopMarkers) {
  const start = sql.indexOf(startMarker);
  let end = sql.length;
  for (const sm of stopMarkers) {
    const idx = sql.indexOf(sm, start + startMarker.length);
    if (idx !== -1 && idx < end) end = idx;
  }
  return sql.slice(start, end).trim();
}

const oldSummary = extractView(
  oldSql,
  "create or replace view public.inventory_category_items_summary_view as",
  ["-- ============================================================\n-- VIEW: inventory_item_movements_view"]
);
const newSummary = extractView(
  newSql,
  "create or replace view public.inventory_category_items_summary_view as",
  ["create or replace view public.inventory_item_movements_view"]
);
console.log("########## inventory_category_items_summary_view diff ##########");
console.log(diffLines(oldSummary, newSummary).join("\n"));

const oldMovements = extractView(
  oldSql,
  "create or replace view public.inventory_item_movements_view as",
  ["-- ============================================================\n-- TRIGGERS"]
);
const newMovements = extractView(
  newSql,
  "create or replace view public.inventory_item_movements_view as",
  ["\n\n"] // end of file after final semicolon, approximate
);
console.log("\n########## inventory_item_movements_view diff ##########");
console.log(diffLines(oldMovements, newMovements).join("\n"));
