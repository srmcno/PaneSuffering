// Repackage the production build as a page fragment for a host that supplies
// its own <html>/<head>/<body> skeleton (a claude.ai Artifact): keep the title,
// styles and body, move Vite's module script to the end of the body, and copy
// the hashed assets alongside.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const html = readFileSync('dist/index.html', 'utf8');
const pick = (re) => [...html.matchAll(re)].map((m) => m[0]);

const title = pick(/<title>[\s\S]*?<\/title>/g)[0] ?? '';
const styles = pick(/<style>[\s\S]*?<\/style>/g).join('\n');
const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'));
const moduleScripts = [...head.matchAll(/<script type="module"[\s\S]*?<\/script>/g)].map((m) => m[0]).join('\n');
const body = html.slice(html.indexOf('<body>') + '<body>'.length, html.indexOf('</body>')).trim();

if (!title || !moduleScripts) throw new Error('dist/index.html is missing its title or entry script');

rmSync('artifact', { recursive: true, force: true });
mkdirSync('artifact', { recursive: true });
writeFileSync('artifact/index.html', [title, styles, body, moduleScripts].join('\n') + '\n');
cpSync('dist/assets', 'artifact/assets', { recursive: true });
console.log('artifact/ ready');
