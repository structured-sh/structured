/**
 * Template: SQL Report Generator
 * ─────────────────────────────────────────────────────────────
 * Run a set of SQL queries against your memories and output
 * a formatted report — to terminal, markdown file, or Slack.
 *
 * Usage:
 *   node query-report.js            # print to terminal
 *   node query-report.js --md       # save as report.md
 *   node query-report.js --slack    # post to Slack webhook
 */

import fs from 'fs';

const API_URL  = process.env.STRUCTURED_API_URL || 'http://localhost:3001';
const API_KEY  = process.env.STRUCTURED_API_KEY  || 'sk_structured_dev';
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_URL || '';

// ── Define your report sections ───────────────────────────────────
// Each section has a title and a SQL query.
// Adapt these to your actual memory names and schema.
const REPORT = {
    title: 'Weekly Product Report',
    sections: [
        {
            title: '📱 Installs (last 7 days)',
            sql: `
                SELECT platform, COUNT(*) as installs
                FROM app_events
                WHERE event = 'install'
                  AND timestamp > now() - INTERVAL '7 days'
                GROUP BY platform ORDER BY installs DESC
            `,
        },
        {
            title: '🔥 Top Events (last 7 days)',
            sql: `
                SELECT event, COUNT(*) as n, COUNT(DISTINCT user_id) as unique_users
                FROM app_events
                WHERE timestamp > now() - INTERVAL '7 days'
                GROUP BY event ORDER BY n DESC LIMIT 10
            `,
        },
        {
            title: '💰 Revenue (last 30 days)',
            sql: `
                SELECT DATE_TRUNC('day', to_timestamp(timestamp / 1000)) as day,
                       COUNT(*) as purchases
                FROM app_events
                WHERE event = 'purchase'
                  AND timestamp > now() - INTERVAL '30 days'
                GROUP BY day ORDER BY day
            `,
        },
        {
            title: '📊 Retention — D1 (install → next day active)',
            sql: `
                WITH installs AS (
                    SELECT user_id, MIN(timestamp) as install_ts
                    FROM app_events WHERE event = 'install'
                    GROUP BY user_id
                ),
                d1 AS (
                    SELECT e.user_id
                    FROM app_events e
                    JOIN installs i ON e.user_id = i.user_id
                    WHERE e.timestamp BETWEEN i.install_ts + 86400000
                                          AND i.install_ts + 172800000
                )
                SELECT
                    COUNT(DISTINCT i.user_id) as total_installs,
                    COUNT(DISTINCT d1.user_id) as d1_retained,
                    ROUND(100.0 * COUNT(DISTINCT d1.user_id) / COUNT(DISTINCT i.user_id), 1) as d1_pct
                FROM installs i
                LEFT JOIN d1 ON i.user_id = d1.user_id
            `,
        },
    ],
};

// ── API helper ──────────────────────────────────────────────────
async function query(sql) {
    const res = await fetch(`${API_URL}/query`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ sql: sql.trim() }),
    });
    return res.json();
}

// ── Formatters ───────────────────────────────────────────────────
function formatTable(result) {
    if (result.error) return `  Error: ${result.error}\n`;
    if (!result.rows?.length) return '  No data\n';

    const cols = result.columns;
    const rows = result.rows;

    const widths = cols.map(c =>
        Math.max(c.length, ...rows.map(r => String(r[c] ?? '').length))
    );

    const header = cols.map((c, i) => c.padEnd(widths[i])).join('  ');
    const divider = widths.map(w => '─'.repeat(w)).join('  ');
    const body = rows.map(r =>
        cols.map((c, i) => String(r[c] ?? '').padEnd(widths[i])).join('  ')
    ).join('\n  ');

    return `  ${header}\n  ${divider}\n  ${body}\n`;
}

function formatMarkdownTable(result) {
    if (result.error) return `> Error: ${result.error}\n`;
    if (!result.rows?.length) return '_No data_\n';

    const cols = result.columns;
    const rows = result.rows;
    const header = `| ${cols.join(' | ')} |`;
    const divider = `| ${cols.map(() => '---').join(' | ')} |`;
    const body = rows.map(r => `| ${cols.map(c => r[c] ?? '').join(' | ')} |`).join('\n');
    return `${header}\n${divider}\n${body}\n`;
}

// ── Run report ───────────────────────────────────────────────────
async function runReport(mode = 'terminal') {
    const now = new Date().toLocaleString();
    const lines = [];

    lines.push(`\n${'═'.repeat(60)}`);
    lines.push(`  ${REPORT.title}`);
    lines.push(`  Generated: ${now}`);
    lines.push('═'.repeat(60));

    const mdLines = [`# ${REPORT.title}`, `_${now}_\n`];

    for (const section of REPORT.sections) {
        console.log(`Running: ${section.title}...`);
        const result = await query(section.sql);

        lines.push(`\n${section.title}`);
        lines.push(formatTable(result));

        mdLines.push(`## ${section.title}`);
        mdLines.push(formatMarkdownTable(result));
        mdLines.push('');
    }

    if (mode === 'terminal' || mode === 'md') {
        console.log(lines.join('\n'));
    }

    if (mode === 'md') {
        const filename = `report-${new Date().toISOString().split('T')[0]}.md`;
        fs.writeFileSync(filename, mdLines.join('\n'));
        console.log(`\nSaved: ${filename}`);
    }

    if (mode === 'slack' && SLACK_WEBHOOK) {
        const text = `*${REPORT.title}* — ${now}\n\`\`\`${lines.join('\n')}\`\`\``;
        await fetch(SLACK_WEBHOOK, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
        });
        console.log('Posted to Slack');
    }
}

// ── CLI ──────────────────────────────────────────────────────────
const mode = process.argv.includes('--md') ? 'md'
    : process.argv.includes('--slack') ? 'slack'
    : 'terminal';

runReport(mode);
