import { describe, expect, it } from 'vitest';
// If this project uses NodeNext/node16 module resolution, change to './release.js'.
import {
  AUTO_FIX_STEPS,
  DEFAULT_CHANGELOG_HEADER,
  insertChangelogEntry,
  parseConventionalCommit,
  parseReleaseArgs,
  QUALITY_GATES,
} from './release';

describe('QUALITY_GATES', () => {
  it('runs verification-only gates in release order', () => {
    // Keep this in sync with the QUALITY_GATES array after pruning to the project's scripts.
    expect(QUALITY_GATES.map((gate) => gate.name)).toEqual([
      'typecheck',
      'lint',
      'format:check',
      'test',
      'build',
    ]);
  });
});

describe('AUTO_FIX_STEPS', () => {
  it('runs lint and format auto-fixes only when requested', () => {
    expect(AUTO_FIX_STEPS.map((step) => step.name)).toEqual(['lint:fix', 'format']);
  });
});

describe('parseReleaseArgs', () => {
  it('parses a version type without fix mode', () => {
    expect(parseReleaseArgs(['patch'])).toEqual({ versionTypeArg: 'patch', fix: false });
  });

  it('parses --fix before the version type', () => {
    expect(parseReleaseArgs(['--fix', 'minor'])).toEqual({ versionTypeArg: 'minor', fix: true });
  });

  it('parses --fix after the version type', () => {
    expect(parseReleaseArgs(['major', '--fix'])).toEqual({ versionTypeArg: 'major', fix: true });
  });

  it('supports interactive mode with only --fix', () => {
    expect(parseReleaseArgs(['--fix'])).toEqual({ fix: true });
  });

  it('rejects unknown flags', () => {
    expect(() => parseReleaseArgs(['--wat'])).toThrow('Unknown option: --wat');
  });

  it('rejects two version types', () => {
    expect(() => parseReleaseArgs(['patch', 'minor'])).toThrow('Multiple version types');
  });
});

describe('parseConventionalCommit', () => {
  it('classifies scoped feat commits as Added', () => {
    expect(parseConventionalCommit('feat(shell): prefer git bash on Windows')).toEqual({
      section: 'Added',
      text: 'prefer git bash on Windows',
    });
  });

  it('classifies scoped fix commits as Fixed', () => {
    expect(parseConventionalCommit('fix(packaging): remove native dependency')).toEqual({
      section: 'Fixed',
      text: 'remove native dependency',
    });
  });

  it('classifies docs and other maintenance commits as Other', () => {
    expect(parseConventionalCommit('docs(shell): update troubleshooting')).toEqual({
      section: 'Other',
      text: 'update troubleshooting',
    });
  });

  it('ignores non-conventional commit messages', () => {
    expect(parseConventionalCommit('Merge branch main into feature')).toBeNull();
  });

  it('ignores release bookkeeping commits', () => {
    expect(parseConventionalCommit('chore: release v1.2.3')).toBeNull();
  });
});

describe('insertChangelogEntry', () => {
  it('creates a valid changelog when no file exists yet', () => {
    const entry = '## [1.2.3] - 2026-04-17\n\n### Fixed\n\n- patch release bug\n';
    const result = insertChangelogEntry('', entry);

    expect(result).toContain(DEFAULT_CHANGELOG_HEADER);
    expect(result.indexOf('# Changelog')).toBeLessThan(result.indexOf('## [1.2.3]'));
  });

  it('inserts the newest entry below the changelog header and above older entries', () => {
    const existing = `${DEFAULT_CHANGELOG_HEADER}

## [1.2.2] - 2026-04-16

### Fixed

- old fix
`;
    const result = insertChangelogEntry(
      existing,
      '## [1.2.3] - 2026-04-17\n\n### Fixed\n\n- new fix',
    );

    expect(result.indexOf('# Changelog')).toBeLessThan(result.indexOf('## [1.2.3]'));
    expect(result.indexOf('## [1.2.3]')).toBeLessThan(result.indexOf('## [1.2.2]'));
  });
});
