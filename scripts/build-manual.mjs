// scripts/build-manual.mjs — generates docs/USER_MANUAL.md (EN + NL) and CHANGELOG.md from core/manual.js.
// Run with `npm run manual` after changing the manual; commit the generated files together with it.
import { writeFileSync } from 'node:fs';
import { CHAPTERS, CHANGES } from '../core/manual.js';

const md = (body) => String(body)
  .replace(/^## /gm, '### ')
  .replace(/\[\[([a-z0-9-]+)\|(.+?)\]\]/g, (m, id, label) => `[${label}](#${id})`);
const slug = (lang, id) => `${id}${lang === 'nl' ? '-nl' : ''}`;
const linkFix = (lang, s) => s.replace(/\]\(#([a-z0-9-]+)\)/g, (m, id) => `](#${slug(lang, id)})`);

function section(lang){
  const title = lang === 'nl' ? 'Handleiding (Nederlands)' : 'User manual (English)';
  const toc = CHAPTERS.map(c => `- [${c.title[lang]}](#${slug(lang, c.id)})`).join('\n');
  const body = CHAPTERS.map(c => `<a id="${slug(lang, c.id)}"></a>\n## ${c.title[lang]}\n\n${linkFix(lang, md(c[lang]))}`).join('\n\n');
  return `# ${title}\n\n${toc}\n\n${body}`;
}
const head = `<!-- Generated from core/manual.js by scripts/build-manual.mjs — do not edit by hand, run \`npm run manual\`. -->\n\n`;
const intro = `# DimCity PatchLab — User Manual / Handleiding\n\nThe same manual is built into the app: press **?** or **F1**, or click **Help** in the toolbar, and it opens on the chapter for the page you are on.\n\nDezelfde handleiding zit in de app: druk op **?** of **F1**, of klik op **Help** in de werkbalk, en hij opent op het hoofdstuk van de pagina waar je bent.\n\n- [English](#user-manual-english)\n- [Nederlands](#handleiding-nederlands)\n\n---\n\n`;
writeFileSync(new URL('../docs/USER_MANUAL.md', import.meta.url), head + intro + section('en') + '\n\n---\n\n' + section('nl') + '\n');

const changelog = CHANGES.map(c => `## ${c.version}${c.date === 'unreleased' ? ' (unreleased)' : ` — ${c.date}`}\n\n${c.en.map(l => `- ${l}`).join('\n')}\n\n<details><summary>Nederlands</summary>\n\n${c.nl.map(l => `- ${l}`).join('\n')}\n\n</details>`).join('\n\n');
writeFileSync(new URL('../CHANGELOG.md', import.meta.url), head + `# Changelog\n\nAll notable changes to DimCity PatchLab. The entry of a version is also the text of its GitHub release.\n\n${changelog}\n`);

// Release notes for one version (used by `npm run release-notes 0.3.0`)
const want = process.argv[2];
if(want){
  const c = CHANGES.find(x => x.version === want);
  if(!c){ console.error(`No changelog entry for ${want}`); process.exit(1); }
  const notes = `${c.en.map(l => `- ${l}`).join('\n')}\n\n**Nederlands**\n${c.nl.map(l => `- ${l}`).join('\n')}\n`;
  writeFileSync(new URL(`../dist/release-notes-${want}.md`, import.meta.url), notes);
  console.log(notes);
}
console.log('docs/USER_MANUAL.md and CHANGELOG.md written');
