// Builds db/catalog.sql from Sefaria's public table of contents (https://www.sefaria.org/api/index).
import fs from 'fs';
const toc = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const q = s => "'" + String(s ?? '').replace(/'/g, "''") + "'";
const ACTIVE = new Set(['Talmud','Mishnah','Halakhah','Tanakh','Midrash','Chasidut','Musar','Responsa']); // admin toggles the rest (Kabbalah, Liturgy, Jewish Thought, Tosefta, Second Temple, Reference)
const out = [];
let sort = 0, books = 0;
for (const top of toc) {
  const sid = top.category;
  out.push(`INSERT OR REPLACE INTO catalog_sections(id,title_he,title_en,active,sort) VALUES(${q(sid)},${q(top.heCategory)},${q(top.category)},${ACTIVE.has(sid) ? 1 : 0},${sort++});`);
  const walk = (nodes, path) => {
    for (const n of nodes) {
      if (n.contents) walk(n.contents, [...path, n.category]);
      else if (n.title) { books++; out.push(`INSERT OR REPLACE INTO catalog_refs(id,section_id,sefaria_ref,title_he,title_en) VALUES(${q(n.title)},${q(sid)},${q(n.title)},${q(n.heTitle)},${q(n.title)});`); }
    }
  };
  walk(top.contents || [], []);
}
fs.writeFileSync('db/catalog.sql', out.join('\n') + '\n');
console.log('sections', toc.length, 'books', books);
