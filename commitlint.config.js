module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',     // New features
        'fix',      // Bug fixes
        'docs',     // Documentation
        'style',    // Formatting, missing semi colons, etc; no code change
        'refactor', // Refactoring production code
        'test',     // Adding tests, refactoring test; no production code change
        'chore',    // Updating build tasks, package manager configs, etc; no production code change
        'perf',     // Performance improvements
        'ci',       // CI/CD changes
        'build',    // Build system changes
        'revert',   // Revert previous commit
      ],
    ],
    'subject-max-length': [2, 'always', 100],
    'subject-case': [2, 'always', 'lower-case'],
    'body-max-line-length': [2, 'always', 100],
  },
}
