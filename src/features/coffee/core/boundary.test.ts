import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';

// The point of ./core is that every line in it runs unmodified under Node, jsdom, or a native
// runtime — no DOM, no OPFS, no bundler. That property is invisible: nothing breaks today if
// someone adds `import { listMovements } from '../db'` to stats.ts, and the app keeps working right
// up until the day it needs to be reused somewhere without a browser. This test makes the boundary
// a build failure instead of a code-review convention.
//
// It is also how this directory came to exist: backup.ts declared itself "Pure and node-safe — no
// DB, no DOM" in a comment while importing the SQLocal-backed db.ts on line 3. Comments don't hold.

// Resolved from the project root rather than import.meta.url: under Vitest's module runner
// import.meta.url is not a file: URL, so fileURLToPath throws. Vitest always runs from the config
// root, and if that ever stops being true the "core has source files" test below fails loudly
// rather than letting this suite pass on an empty directory.
const CORE_DIR = join(process.cwd(), 'src', 'features', 'coffee', 'core');

// Portable dependencies core is allowed to reach for. drizzle-orm is here because the schema is the
// one shared artifact between clients — the same table definition backs sqlite-proxy on the web and
// would back drizzle-orm/expo-sqlite on native.
const ALLOWED_PACKAGES = ['drizzle-orm'];

// Platform globals that don't exist off the web. Absence of an import is not proof of purity —
// these arrive for free in a browser and would throw everywhere else.
const BANNED_GLOBALS = [
  'window',
  'document',
  'navigator',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'caches',
  'fetch',
];

// Test files are excluded: importing vitest says nothing about whether the SOURCE is portable.
function coreSourceFiles(): string[] {
  return readdirSync(CORE_DIR).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
}

// ponytail: regex, not a TS parser. Good enough because it only has to catch what a human would
// plausibly type; if core ever grows something this can't read, reach for ts-morph then.
function importsOf(source: string): string[] {
  const specifiers: string[] = [];
  for (const m of source.matchAll(/(?:\bfrom|^\s*import)\s+'([^']+)'/gm)) {
    const specifier = m[1];
    if (specifier !== undefined) specifiers.push(specifier);
  }
  return specifiers;
}

// Comments describe the world; code touches it. Strip comments so a banned word in prose (this file
// is full of them) doesn't read as a violation.
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

test('core has source files to check', () => {
  // Guards against the regex/readdir silently matching nothing and the suite passing vacuously.
  expect(coreSourceFiles().length).toBeGreaterThan(0);
});

test('core imports nothing outside core but its allowed packages', () => {
  const violations: string[] = [];

  for (const file of coreSourceFiles()) {
    const source = readFileSync(join(CORE_DIR, file), 'utf8');
    for (const specifier of importsOf(source)) {
      if (specifier.startsWith('../')) {
        violations.push(`${file} escapes core: '${specifier}'`);
        continue;
      }
      if (specifier.startsWith('./')) continue;
      const allowed = ALLOWED_PACKAGES.some(
        (pkg) => specifier === pkg || specifier.startsWith(`${pkg}/`),
      );
      if (!allowed) violations.push(`${file} imports non-portable package: '${specifier}'`);
    }
  }

  expect(violations).toEqual([]);
});

test('core touches no browser-only globals', () => {
  const violations: string[] = [];

  for (const file of coreSourceFiles()) {
    const code = stripComments(readFileSync(join(CORE_DIR, file), 'utf8'));
    for (const global of BANNED_GLOBALS) {
      if (new RegExp(`\\b${global}\\b`).test(code)) {
        violations.push(`${file} uses browser-only global: ${global}`);
      }
    }
  }

  expect(violations).toEqual([]);
});
