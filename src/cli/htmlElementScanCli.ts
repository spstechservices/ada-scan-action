#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════
 * ADA HTML Element Scan — CLI
 * ═══════════════════════════════════════════════════════
 *
 * Standalone Node.js script for scanning HTML/JSX/TSX
 * files for accessibility violations. Designed for:
 *   - GitHub Actions (via the composite action)
 *   - Git pre-commit hooks
 *   - Manual CLI usage
 *
 * Usage:
 *   node out/cli/htmlElementScanCli.js                           # scan git-staged files
 *   node out/cli/htmlElementScanCli.js src/App.tsx index.html     # scan specific files
 *   node out/cli/htmlElementScanCli.js --report                  # write JSON report
 *
 * Exit codes:
 *   0 – No violations found
 *   1 – Violations found
 *   2 – Internal error
 *
 * ═══════════════════════════════════════════════════════
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { scanHtmlElements } from '../htmlElementScanner';
import type { ScanResult } from '../types';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const EXTENSIONS = ['.html', '.htm', '.tsx', '.jsx'];

const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN  = '\x1b[32m';
const CYAN   = '\x1b[36m';
const BOLD   = '\x1b[1m';
const RESET  = '\x1b[0m';

function isScannable(file: string): boolean {
    return EXTENSIONS.includes(path.extname(file).toLowerCase());
}

function getStagedFiles(): string[] {
    try {
        const stdout = execSync('git diff --cached --name-only --diff-filter=ACM', {
            encoding: 'utf-8',
        });
        return stdout
            .split('\n')
            .map(f => f.trim())
            .filter(f => f.length > 0 && isScannable(f));
    } catch {
        return [];
    }
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

function main(): void {
    const args = process.argv.slice(2);
    const writeReport = args.includes('--report');
    const explicitFiles = args.filter(a => !a.startsWith('--'));

    console.log(`${BOLD}${CYAN}═══════════════════════════════════════════════════════${RESET}`);
    console.log(`${BOLD}${CYAN}  ADA HTML Element Accessibility Scanner${RESET}`);
    console.log(`${BOLD}${CYAN}═══════════════════════════════════════════════════════${RESET}\n`);

    let files: string[];
    if (explicitFiles.length > 0) {
        files = explicitFiles.filter(f => {
            if (!fs.existsSync(f)) {
                console.log(`${YELLOW}⚠  Skipping (not found): ${f}${RESET}`);
                return false;
            }
            return isScannable(f);
        });
    } else {
        files = getStagedFiles();
        if (files.length === 0) {
            console.log(`${GREEN}✅ No staged HTML/TSX/JSX files to scan.${RESET}`);
            process.exit(0);
        }
        console.log(`Scanning ${files.length} staged file(s)...\n`);
    }

    if (files.length === 0) {
        console.log(`${GREEN}✅ No matching files to scan.${RESET}`);
        process.exit(0);
    }

    const results: ScanResult[] = [];
    let totalViolations = 0;
    let filesWithViolations = 0;

    for (const filePath of files) {
        try {
            const source = fs.readFileSync(filePath, 'utf-8');
            const result = scanHtmlElements(source, filePath);
            results.push(result);

            if (result.violationCount > 0) {
                filesWithViolations++;
                totalViolations += result.violationCount;
                console.log(`  ${RED}⚠  ${filePath}: ${result.violationCount} rule(s) violated${RESET}`);

                for (const v of result.violations) {
                    console.log(`     ${YELLOW}[${v.impact}]${RESET} ${v.id}: ${v.help}`);
                    for (const node of v.nodes) {
                        console.log(`       → line ${node.target.join(', ')}: ${node.html.substring(0, 120)}`);
                    }
                }
                console.log('');
            } else {
                console.log(`  ${GREEN}✅  ${filePath}: clean${RESET}`);
            }
        } catch (err: any) {
            console.error(`  ${RED}❌  ${filePath}: ${err.message}${RESET}`);
        }
    }

    console.log(`\n${BOLD}───────────────────────────────────────────────────────${RESET}`);
    console.log(`${BOLD}  Files scanned:          ${files.length}${RESET}`);
    console.log(`${BOLD}  Files with violations:  ${filesWithViolations}${RESET}`);
    console.log(`${BOLD}  Total rules violated:   ${totalViolations}${RESET}`);
    console.log(`${BOLD}───────────────────────────────────────────────────────${RESET}\n`);

    if (writeReport) {
        const reportData = {
            scanDate: new Date().toISOString(),
            scanMode: 'html-element-ci',
            totalFilesScanned: files.length,
            filesWithViolations,
            totalViolations,
            files: results,
        };
        const reportPath = path.resolve('accessibility-html-element-report.json');
        fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2), 'utf-8');
        console.log(`📋 Report saved to: ${reportPath}\n`);
    }

    if (totalViolations > 0) {
        console.log(`${RED}${BOLD}✖ Found ${totalViolations} accessibility violation(s). Fix them before merging.${RESET}`);
        console.log(`  Run with --report for a JSON report.\n`);
        process.exit(1);
    } else {
        console.log(`${GREEN}${BOLD}✔ All files passed HTML element accessibility checks.${RESET}\n`);
        process.exit(0);
    }
}

main();
