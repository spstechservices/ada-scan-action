/**
 * ═══════════════════════════════════════════════════════
 * HTML Element Scanner Service
 * ═══════════════════════════════════════════════════════
 *
 * A lightweight, static-analysis scanner that checks raw
 * HTML elements (table, div, label, span, tr, td, img,
 * input, button, a, form, select, textarea, etc.) for
 * common WCAG 2.1 AA accessibility violations.
 *
 * No browser is required — files are parsed with regex
 * so the scanner is fast enough to run in CI / pre-commit.
 *
 * ═══════════════════════════════════════════════════════
 */

import * as fs from 'fs';
import type { ScanResult, ViolationEntry, ViolationNodeEntry } from './types';

export type { ScanResult, ViolationEntry, ViolationNodeEntry } from './types';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface ElementMatch {
    tag: string;
    fullMatch: string;
    attributes: Record<string, string | true>;
    line: number;
}

interface RuleViolation {
    ruleId: string;
    impact: 'critical' | 'serious' | 'moderate' | 'minor';
    help: string;
    description: string;
    helpUrl: string;
    wcagTags: string[];
}

// ─────────────────────────────────────────────────────────────
// Element parser
// ─────────────────────────────────────────────────────────────

function parseElements(source: string): ElementMatch[] {
    const elements: ElementMatch[] = [];
    const tagRegex = /<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*?)\s*\/?>/gs;
    let match: RegExpExecArray | null;

    while ((match = tagRegex.exec(source)) !== null) {
        const tag = match[1].toLowerCase();
        const attrString = match[2];
        const fullMatch = match[0];
        const line = source.substring(0, match.index).split('\n').length;
        const attributes = parseAttributes(attrString);
        elements.push({ tag, fullMatch, attributes, line });
    }

    return elements;
}

function parseAttributes(attrStr: string): Record<string, string | true> {
    const attrs: Record<string, string | true> = {};
    const attrRegex = /([a-zA-Z_][\w\-.:]*)\ s*(?:=\s*(?:"([^"]*)"|'([^']*)'|\{([^}]*)\}))?/g;
    let m: RegExpExecArray | null;

    while ((m = attrRegex.exec(attrStr)) !== null) {
        const name = m[1].toLowerCase();
        const value = m[2] ?? m[3] ?? m[4] ?? true;
        attrs[name] = typeof value === 'string' ? value : true;
    }

    return attrs;
}

function hasAttr(attrs: Record<string, string | true>, ...names: string[]): boolean {
    return names.some(n => {
        const v = attrs[n];
        return v === true || (typeof v === 'string' && v.trim().length > 0);
    });
}

function getInnerText(source: string, tagStart: number, tag: string): string {
    const afterOpen = source.indexOf('>', tagStart);
    if (afterOpen === -1) { return ''; }
    const closeTag = `</${tag}`;
    const closeIdx = source.toLowerCase().indexOf(closeTag, afterOpen + 1);
    if (closeIdx === -1) { return ''; }
    const inner = source.substring(afterOpen + 1, closeIdx);
    return inner.replace(/<[^>]*>/g, '').trim();
}

// ─────────────────────────────────────────────────────────────
// Accessibility rules
// ─────────────────────────────────────────────────────────────

type RuleChecker = (
    el: ElementMatch,
    allElements: ElementMatch[],
    source: string
) => RuleViolation | null;

const rules: RuleChecker[] = [
    // <img> must have alt
    (el) => {
        if (el.tag !== 'img') { return null; }
        if (hasAttr(el.attributes, 'alt', 'aria-label', 'aria-labelledby', 'role')) { return null; }
        return {
            ruleId: 'image-alt',
            impact: 'critical',
            help: 'Images must have alternate text',
            description: '<img> elements must have an alt attribute, aria-label, or aria-labelledby.',
            helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/image-alt',
            wcagTags: ['wcag2a', 'wcag111'],
        };
    },

    // <input> must have a label
    (el) => {
        if (el.tag !== 'input') { return null; }
        if (el.attributes['type'] === 'hidden') { return null; }
        if (hasAttr(el.attributes, 'aria-label', 'aria-labelledby', 'title', 'id')) { return null; }
        return {
            ruleId: 'input-label',
            impact: 'critical',
            help: 'Form inputs must have labels',
            description: '<input> must have an associated <label>, aria-label, aria-labelledby, or title.',
            helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/label',
            wcagTags: ['wcag2a', 'wcag111', 'wcag131', 'wcag412'],
        };
    },

    // <select> must have a label
    (el) => {
        if (el.tag !== 'select') { return null; }
        if (hasAttr(el.attributes, 'aria-label', 'aria-labelledby', 'title', 'id')) { return null; }
        return {
            ruleId: 'select-label',
            impact: 'critical',
            help: '<select> elements must have labels',
            description: '<select> must have an associated <label>, aria-label, aria-labelledby, or title.',
            helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/select-name',
            wcagTags: ['wcag2a', 'wcag111', 'wcag131', 'wcag412'],
        };
    },

    // <textarea> must have a label
    (el) => {
        if (el.tag !== 'textarea') { return null; }
        if (hasAttr(el.attributes, 'aria-label', 'aria-labelledby', 'title', 'id')) { return null; }
        return {
            ruleId: 'textarea-label',
            impact: 'critical',
            help: '<textarea> elements must have labels',
            description: '<textarea> must have an associated <label>, aria-label, aria-labelledby, or title.',
            helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/label',
            wcagTags: ['wcag2a', 'wcag111', 'wcag131', 'wcag412'],
        };
    },

    // <button> must have discernible text
    (el, _all, source) => {
        if (el.tag !== 'button') { return null; }
        if (hasAttr(el.attributes, 'aria-label', 'aria-labelledby', 'title')) { return null; }
        const inner = getInnerText(source, source.indexOf(el.fullMatch), 'button');
        if (inner.length > 0) { return null; }
        return {
            ruleId: 'button-name',
            impact: 'critical',
            help: 'Buttons must have discernible text',
            description: '<button> must have inner text, aria-label, aria-labelledby, or title.',
            helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/button-name',
            wcagTags: ['wcag2a', 'wcag412'],
        };
    },

    // <a> must have discernible text
    (el, _all, source) => {
        if (el.tag !== 'a') { return null; }
        if (hasAttr(el.attributes, 'aria-label', 'aria-labelledby', 'title')) { return null; }
        const inner = getInnerText(source, source.indexOf(el.fullMatch), 'a');
        if (inner.length > 0) { return null; }
        return {
            ruleId: 'link-name',
            impact: 'serious',
            help: 'Links must have discernible text',
            description: '<a> must have inner text, aria-label, aria-labelledby, or title.',
            helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/link-name',
            wcagTags: ['wcag2a', 'wcag412', 'wcag244'],
        };
    },

    // <table> must have a caption or accessible name
    (el) => {
        if (el.tag !== 'table') { return null; }
        if (el.attributes['role'] === 'presentation' || el.attributes['role'] === 'none') { return null; }
        if (hasAttr(el.attributes, 'aria-label', 'aria-labelledby', 'summary')) { return null; }
        return {
            ruleId: 'table-has-name',
            impact: 'serious',
            help: 'Tables must have an accessible name',
            description: '<table> should have a <caption>, aria-label, aria-labelledby, or summary attribute.',
            helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/table-fake-caption',
            wcagTags: ['wcag2a', 'wcag131'],
        };
    },

    // <th> should have scope
    (el) => {
        if (el.tag !== 'th') { return null; }
        if (hasAttr(el.attributes, 'scope', 'id')) { return null; }
        return {
            ruleId: 'th-has-data-cells',
            impact: 'serious',
            help: 'Table header cells should have a scope attribute',
            description: '<th> should use scope="col" or scope="row" to associate with data cells.',
            helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/th-has-data-cells',
            wcagTags: ['wcag2a', 'wcag131'],
        };
    },

    // <label> should have a for attribute
    (el) => {
        if (el.tag !== 'label') { return null; }
        if (hasAttr(el.attributes, 'for', 'htmlfor')) { return null; }
        return {
            ruleId: 'label-has-for',
            impact: 'moderate',
            help: '<label> should have a "for" attribute pointing to an input',
            description: '<label> elements should use the for (or htmlFor in JSX) attribute to explicitly associate with a form control.',
            helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/label',
            wcagTags: ['wcag2a', 'wcag111', 'wcag131'],
        };
    },

    // Interactive <div>/<span> must have role + keyboard
    (el) => {
        if (el.tag !== 'div' && el.tag !== 'span') { return null; }
        const hasClick = hasAttr(el.attributes, 'onclick', 'onClick');
        if (!hasClick) { return null; }
        if (hasAttr(el.attributes, 'role') && hasAttr(el.attributes, 'tabindex')) { return null; }
        return {
            ruleId: 'interactive-element-role',
            impact: 'serious',
            help: 'Interactive elements must have an explicit role and be keyboard accessible',
            description: '<div>/<span> with click handlers must have role="button" (or similar) and tabindex for keyboard access.',
            helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/aria-role',
            wcagTags: ['wcag2a', 'wcag211', 'wcag412'],
        };
    },

    // <html> must have lang
    (el) => {
        if (el.tag !== 'html') { return null; }
        if (hasAttr(el.attributes, 'lang', 'xml:lang')) { return null; }
        return {
            ruleId: 'html-has-lang',
            impact: 'serious',
            help: '<html> element must have a lang attribute',
            description: 'The <html> element must have a valid lang attribute for screen readers.',
            helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/html-has-lang',
            wcagTags: ['wcag2a', 'wcag311'],
        };
    },

    // <form> should have accessible name
    (el) => {
        if (el.tag !== 'form') { return null; }
        if (hasAttr(el.attributes, 'aria-label', 'aria-labelledby', 'title', 'name')) { return null; }
        return {
            ruleId: 'form-has-name',
            impact: 'moderate',
            help: 'Forms should have an accessible name',
            description: '<form> should have aria-label, aria-labelledby, or title for assistive technologies.',
            helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/region',
            wcagTags: ['wcag2a', 'wcag131'],
        };
    },

    // <td> with scope should be <th>
    (el) => {
        if (el.tag !== 'td') { return null; }
        if (!hasAttr(el.attributes, 'scope')) { return null; }
        return {
            ruleId: 'td-has-scope',
            impact: 'moderate',
            help: 'Use <th> instead of <td scope="...">',
            description: 'Table cells with scope should be <th> elements, not <td>.',
            helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/th-has-data-cells',
            wcagTags: ['wcag2a', 'wcag131'],
        };
    },

    // Headings (h1-h6) must have content
    (el, _all, source) => {
        if (!/^h[1-6]$/.test(el.tag)) { return null; }
        if (hasAttr(el.attributes, 'aria-label', 'aria-labelledby')) { return null; }
        const inner = getInnerText(source, source.indexOf(el.fullMatch), el.tag);
        if (inner.length > 0) { return null; }
        return {
            ruleId: 'empty-heading',
            impact: 'moderate',
            help: 'Headings must have content',
            description: `<${el.tag}> must have visible text or an aria-label for screen readers.`,
            helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/empty-heading',
            wcagTags: ['wcag2a', 'wcag131'],
        };
    },

    // <iframe>/<frame> must have title
    (el) => {
        if (el.tag !== 'iframe' && el.tag !== 'frame') { return null; }
        if (hasAttr(el.attributes, 'title', 'aria-label', 'aria-labelledby')) { return null; }
        return {
            ruleId: 'frame-title',
            impact: 'serious',
            help: 'Frames must have a title attribute',
            description: '<iframe>/<frame> must have a title attribute describing its content.',
            helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/frame-title',
            wcagTags: ['wcag2a', 'wcag412'],
        };
    },
];

// ─────────────────────────────────────────────────────────────
// Core scanner
// ─────────────────────────────────────────────────────────────

export function scanHtmlElements(source: string, filePath: string): ScanResult {
    const elements = parseElements(source);

    const violationMap = new Map<string, { rule: RuleViolation; nodes: ViolationNodeEntry[] }>();

    for (const el of elements) {
        for (const check of rules) {
            const violation = check(el, elements, source);
            if (!violation) { continue; }

            const key = violation.ruleId;
            if (!violationMap.has(key)) {
                violationMap.set(key, { rule: violation, nodes: [] });
            }
            violationMap.get(key)!.nodes.push({
                html: el.fullMatch,
                target: [`line ${el.line}`],
                failureSummary: violation.help,
            });
        }
    }

    const violations: ViolationEntry[] = [];
    for (const [, { rule, nodes }] of violationMap) {
        violations.push({
            id: rule.ruleId,
            impact: rule.impact,
            help: rule.help,
            description: rule.description,
            helpUrl: rule.helpUrl,
            wcagTags: rule.wcagTags,
            nodes,
        });
    }

    return {
        file: filePath,
        violationCount: violations.length,
        violations,
    };
}
