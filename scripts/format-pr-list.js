#!/usr/bin/env node

const { execSync } = require('child_process');

// DEFAULT LAST TWO WEEKS: node scripts/format-pr-list.js
// ALL PRS: node scripts/format-pr-list.js --all
// SPECIFIC RANGE: node scripts/format-pr-list.js --range 2024-01-01 2024-01-31

function formatPRList(options = {}) {
  try {
    let command;

    if (options.all) {
      command = 'gh pr list --json url,title,number,baseRefName';
    } else if (options.startDate && options.endDate) {
      command = `gh pr list --search "created:${options.startDate}..${options.endDate}" --state all --json url,title,number,baseRefName`;
    } else {
      // Default: last 14 days
      const numDays = 14;
      const startDate = new Date(Date.now() - numDays * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];
      const endDate = new Date().toISOString().split('T')[0];
      command = `gh pr list --search "created:${startDate}..${endDate}" --state all --json url,title,number,baseRefName`;
    }

    // Execute the gh command and get JSON output
    const output = execSync(command, {
      encoding: 'utf-8',
      stdio: ['inherit', 'pipe', 'inherit'],
    });

    // Parse the JSON
    const prs = JSON.parse(output);

    // Format each PR for Slack markup: "title [url](#number)"
    const formattedPRs = prs.reduce(
      (acc, pr) => {
        if (!pr.title.startsWith('chore(deps):') && !pr.title.startsWith('Update dependency')) {
          if (pr.baseRefName === 'master') {
            acc.master.push(pr);
          } else if (pr.baseRefName === 'staging') {
            acc.staging.push(pr);
          }
        }
        return acc;
      },
      { master: [], staging: [] },
    );

    console.log('_*Bundle*_');
    formattedPRs.master.forEach(pr => console.log(`${pr.title} [#${pr.number}](${pr.url})`));

    console.log('\n_*Preview_*');
    formattedPRs.staging.forEach(pr => console.log(`${pr.title} [#${pr.number}](${pr.url})`));
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error:', error.message);
    } else {
      console.error('Unknown error:', error);
    }
    process.exit(1);
  }
}

// If this script is run directly (not imported)
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {};

  if (args.includes('--all')) {
    options.all = true;
  } else if (args.includes('--range')) {
    const startIdx = args.indexOf('--range');
    if (args[startIdx + 1] && args[startIdx + 2]) {
      options.startDate = args[startIdx + 1];
      options.endDate = args[startIdx + 2];
    }
  }

  formatPRList(options);
}

module.exports = { formatPRList };
