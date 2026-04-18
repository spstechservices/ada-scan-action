/**
 * Shared types for the ADA HTML Element Scanner.
 * Standalone — no external dependencies.
 */

export interface ScanResult {
    file: string;
    violationCount: number;
    violations: ViolationEntry[];
}

export interface ViolationEntry {
    id: string;
    impact: string;
    help: string;
    description: string;
    helpUrl: string;
    wcagTags: string[];
    nodes: ViolationNodeEntry[];
}

export interface ViolationNodeEntry {
    html: string;
    target: string[];
    failureSummary: string;
}
