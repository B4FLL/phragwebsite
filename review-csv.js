// Spreadsheet round trip for the expert dashboard: build a CSV, and read one back.
// Kept separate from review.js because it handles untrusted text and is easy to test on its own.
(function () {
  // Report notes and names are typed by the public. A spreadsheet would run a cell starting with
  // = + - or @ as a formula, so such text gets a leading apostrophe. Real numbers are left alone.
  const looksLikeFormula = (s) => /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s);

  function cell(value) {
    let s = value == null ? "" : String(value);
    if (looksLikeFormula(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }

  // columns: array of names. rows: array of objects. Starts with a BOM so Excel reads UTF-8.
  function build(columns, rows) {
    const lines = [columns.map(cell).join(",")];
    for (const r of rows) lines.push(columns.map((c) => cell(r[c])).join(","));
    return "﻿" + lines.join("\r\n") + "\r\n";
  }

  // Returns an array of objects keyed by the header row. Accepts commas, semicolons or tabs
  // (Excel uses semicolons in some countries), quoted cells and line breaks inside quotes.
  function parse(text) {
    const src = text.replace(/^﻿/, "");
    const header = src.split(/\r?\n/, 1)[0];
    const count = (d) => header.split(d).length - 1;
    const delim = [",", ";", "\t"].sort((a, b) => count(b) - count(a))[0];

    const table = [];
    let row = [], field = "", quoted = false;
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (quoted) {
        if (ch === '"') {
          if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false;
        } else field += ch;
      } else if (ch === '"' && field === "") quoted = true;
      else if (ch === delim) { row.push(field); field = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && src[i + 1] === "\n") i++;
        row.push(field); table.push(row); row = []; field = "";
      } else field += ch;
    }
    if (field !== "" || row.length) { row.push(field); table.push(row); }
    if (!table.length) return [];

    const names = table[0].map((n) => n.trim().toLowerCase());
    return table.slice(1)
      .filter((r) => r.some((v) => v.trim() !== ""))
      .map((r) => Object.fromEntries(names.map((n, i) => {
        let v = r[i] == null ? "" : r[i];
        if (v[0] === "'" && looksLikeFormula(v.slice(1))) v = v.slice(1); // undo the safety apostrophe
        return [n, v];
      })));
  }

  const DECISIONS = {
    verify: "verified", verified: "verified",
    reject: "rejected", rejected: "rejected",
    undo: "unverified", unverified: "unverified",
  };

  // Compares an uploaded sheet with the reports as they are now. Nothing is saved here.
  function plan(sheetRows, reports) {
    const byId = new Map(reports.map((r) => [String(r.id), r]));
    const out = { changes: [], blank: 0, same: 0, problems: [] };
    const seen = new Set();
    sheetRows.forEach((s, i) => {
      const line = i + 2; // row number as the spreadsheet shows it
      const word = (s.decision || "").trim().toLowerCase();
      if (!word) { out.blank++; return; }
      const status = DECISIONS[word];
      const id = (s.id || "").trim();
      const r = byId.get(id);
      if (!status) { out.problems.push(`Row ${line}: "${word.slice(0, 30)}" isn't a decision. Use verify, reject or undo.`); return; }
      if (!r) { out.problems.push(`Row ${line}: this report no longer exists, or its id was changed.`); return; }
      if (seen.has(id)) { out.problems.push(`Row ${line}: the same report appears twice.`); return; }
      seen.add(id);
      const was = (s.current_status || "").trim().toLowerCase();
      if (was && was !== r.status) { out.problems.push(`Row ${line}: someone changed this report after the download (it's now ${r.status}). Skipped.`); return; }
      // An empty note cell keeps the existing note; "undo" clears it, like the buttons do.
      const typed = (s.expert_note || "").trim().slice(0, 1000);
      const note = status === "unverified" ? null : typed || r.expert_note || null;
      if (status === r.status && note === (r.expert_note || null)) { out.same++; return; }
      out.changes.push({ report: r, status, note });
    });
    return out;
  }

  window.phragCsv = { build, parse, plan };
})();
