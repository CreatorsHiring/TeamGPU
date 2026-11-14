/**
 * TeamGPU Markdown and Syntax Highlighting Renderer
 *
 * Parses Markdown tokens (headings, paragraphs, lists, blockquotes, code blocks,
 * inline code, tables) and formats them for clean terminal output with exact
 * VS Code Dark+ syntax highlighting matching OpenCode.
 */

import { marked } from "marked";
import wrapAnsi from "wrap-ansi";
import { highlight, supportsLanguage } from "cli-highlight";

/**
 * VS Code Dark+ Color Palette
 */
export const PALETTE = {
    keyword: "\x1b[38;2;86;156;214m",      // Blue #569CD6
    controlFlow: "\x1b[38;2;197;134;192m",  // Purple #C586C0
    type: "\x1b[38;2;78;201;176m",         // Teal #4EC9B0
    function: "\x1b[38;2;220;220;170m",     // Yellow #DCDCAA
    variable: "\x1b[38;2;156;220;254m",     // Light blue #9CDCFE
    string: "\x1b[38;2;206;145;120m",       // Orange #CE9178
    number: "\x1b[38;2;181;206;168m",       // Light green #B5CEA8
    comment: "\x1b[38;2;106;153;85m",       // Green #6A9955
    punctuation: "\x1b[38;2;212;212;212m",   // Light grey #D4D4D4
    dim: "\x1b[38;2;140;140;150m",          // Dim grey #8C8C96
    white: "\x1b[38;2;235;235;235m",        // Soft white
    orange: "\x1b[38;2;255;168;108m",       // TeamGPU accent orange
    border: "\x1b[38;2;70;70;80m",          // Card/divider border
    reset: "\x1b[0m"
};

/**
 * Reserved control flow keywords across major languages (C-like, Python, JS, Java, Rust, Go)
 */
export const CONTROL_FLOW_WORDS = new Set([
    "if", "else", "elif", "then", "endif",
    "for", "while", "do", "repeat", "until", "loop",
    "switch", "case", "break", "continue", "fallthrough",
    "return", "yield", "await", "async",
    "try", "catch", "except", "finally", "throw", "throws", "raise",
    "goto", "with", "pass", "import", "from", "as", "export", "default"
]);

/**
 * Common primitive types and standard class names
 */
export const TYPE_WORDS = new Set([
    "int", "long", "short", "byte", "float", "double", "char", "boolean", "bool", "void",
    "string", "number", "any", "never", "unknown", "object", "symbol", "bigint",
    "String", "Integer", "Long", "Boolean", "Double", "Float", "Character", "Object",
    "List", "Map", "Set", "ArrayList", "HashMap", "HashSet", "Array", "Vector", "Queue", "Deque",
    "dict", "list", "tuple", "set", "str", "bytes",
    "true", "false", "null", "undefined", "nil", "None"
]);

/**
 * Aliases for language identifiers recognized by highlight.js
 */
export const LANGUAGE_ALIASES = {
    js: "javascript",
    ts: "typescript",
    py: "python",
    sh: "bash",
    zsh: "bash",
    shell: "bash",
    cs: "csharp",
    "c#": "csharp",
    "c++": "cpp",
    rb: "ruby",
    yml: "yaml",
    golang: "go",
    docker: "dockerfile",
    md: "markdown"
};

/**
 * Theme configuration for cli-highlight matching VS Code Dark+
 */
export const vsCodeDarkPlusTheme = {
    keyword: (s) => {
        const trimmed = s.trim();
        if (CONTROL_FLOW_WORDS.has(trimmed)) {
            return `${PALETTE.controlFlow}${s}${PALETTE.reset}`;
        }
        if (TYPE_WORDS.has(trimmed)) {
            return `${PALETTE.type}${s}${PALETTE.reset}`;
        }
        return `${PALETTE.keyword}${s}${PALETTE.reset}`;
    },
    built_in: (s) => {
        const trimmed = s.trim();
        if (TYPE_WORDS.has(trimmed) || /^[A-Z]/.test(trimmed)) {
            return `${PALETTE.type}${s}${PALETTE.reset}`;
        }
        return `${PALETTE.function}${s}${PALETTE.reset}`;
    },
    type: (s) => `${PALETTE.type}${s}${PALETTE.reset}`,
    class: (s) => s,
    function: (s) => s,
    title: (s) => {
        const trimmed = s.trim();
        if (/^[A-Z]/.test(trimmed)) {
            return `${PALETTE.type}${s}${PALETTE.reset}`;
        }
        return `${PALETTE.function}${s}${PALETTE.reset}`;
    },
    params: (s) => s,
    variable: (s) => `${PALETTE.variable}${s}${PALETTE.reset}`,
    attr: (s) => `${PALETTE.variable}${s}${PALETTE.reset}`,
    property: (s) => `${PALETTE.variable}${s}${PALETTE.reset}`,
    string: (s) => `${PALETTE.string}${s}${PALETTE.reset}`,
    number: (s) => `${PALETTE.number}${s}${PALETTE.reset}`,
    regexp: (s) => `${PALETTE.string}${s}${PALETTE.reset}`,
    literal: (s) => `${PALETTE.keyword}${s}${PALETTE.reset}`,
    comment: (s) => `${PALETTE.comment}${s}${PALETTE.reset}`,
    doctag: (s) => `${PALETTE.comment}${s}${PALETTE.reset}`,
    meta: (s) => `${PALETTE.controlFlow}${s}${PALETTE.reset}`,
    "meta-keyword": (s) => `${PALETTE.controlFlow}${s}${PALETTE.reset}`,
    "meta-string": (s) => `${PALETTE.string}${s}${PALETTE.reset}`,
    addition: (s) => `${PALETTE.number}${s}${PALETTE.reset}`,
    deletion: (s) => `${PALETTE.string}${s}${PALETTE.reset}`,
    tag: (s) => `${PALETTE.keyword}${s}${PALETTE.reset}`,
    name: (s) => `${PALETTE.keyword}${s}${PALETTE.reset}`,
    default: (s) => `${PALETTE.punctuation}${s}${PALETTE.reset}`
};

/**
 * Returns a clean uppercase display label for detected language
 */
export function getLanguageLabel(lang) {
    if (!lang) return "CODE";
    const clean = lang.trim();
    const lower = clean.toLowerCase();
    const map = {
        js: "JAVASCRIPT",
        ts: "TYPESCRIPT",
        py: "PYTHON",
        sh: "BASH",
        bash: "BASH",
        csharp: "C#",
        cpp: "C++",
        yml: "YAML",
        yaml: "YAML",
        json: "JSON",
        html: "HTML",
        css: "CSS",
        sql: "SQL",
        java: "JAVA",
        go: "GO",
        rust: "RUST",
        markdown: "MARKDOWN",
        md: "MARKDOWN"
    };
    return map[lower] || clean.toUpperCase();
}

/**
 * Syntax-highlights code using cli-highlight with fallback to plain text
 */
export function highlightCode(code, lang) {
    if (!code) return "";
    const rawLang = (lang || "").toLowerCase().trim();
    const resolvedLang = LANGUAGE_ALIASES[rawLang] || rawLang;
    if (resolvedLang && supportsLanguage(resolvedLang)) {
        try {
            return highlight(code, {
                language: resolvedLang,
                theme: vsCodeDarkPlusTheme,
                ignoreIllegals: true
            });
        } catch {
            // fallback to plain text below
        }
    }
    return `${PALETTE.punctuation}${code}${PALETTE.reset}`;
}

/**
 * Virtually closes any open code fence in streaming markdown text for live parsing.
 * Does not mutate the raw conversation text.
 */
export function normalizeStreamingMarkdown(markdown) {
    if (!markdown) return "";
    const lines = markdown.split(/\r?\n/);
    let inFence = false;
    let fenceChar = "";
    let fenceLen = 0;
    for (const line of lines) {
        const match = line.match(/^(\s*)(`{3,}|~{3,})(.*)$/);
        if (match) {
            const char = match[2][0];
            const len = match[2].length;
            if (!inFence) {
                inFence = true;
                fenceChar = char;
                fenceLen = len;
            } else if (char === fenceChar && len >= fenceLen) {
                inFence = false;
            }
        }
    }
    if (inFence) {
        return markdown + "\n" + fenceChar.repeat(fenceLen);
    }
    return markdown;
}

/**
 * Recursively renders inline Markdown tokens (strong, em, codespan, link, text) to ANSI text.
 */
export function renderInlineTokens(tokens) {
    if (!tokens || tokens.length === 0) return "";
    let out = "";
    for (const t of tokens) {
        switch (t.type) {
            case "strong":
                out += `\x1b[1m${renderInlineTokens(t.tokens || [{ type: "text", text: t.text }])}\x1b[22m`;
                break;
            case "em":
                out += `\x1b[3m${renderInlineTokens(t.tokens || [{ type: "text", text: t.text }])}\x1b[23m`;
                break;
            case "del":
                out += `\x1b[9m${renderInlineTokens(t.tokens || [{ type: "text", text: t.text }])}\x1b[29m`;
                break;
            case "codespan":
                out += `${PALETTE.string}${t.text}${PALETTE.reset}`;
                break;
            case "link":
                out += `\x1b[4;38;2;86;156;214m${renderInlineTokens(t.tokens || [{ type: "text", text: t.text }])}\x1b[24;39m`;
                break;
            case "br":
                out += "\n";
                break;
            case "text":
            default:
                out += t.text || "";
                break;
        }
    }
    return out;
}

/**
 * Strips ANSI escape sequences to compute raw visible cell length
 */
function stripAnsi(str) {
    if (!str) return "";
    return str.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "");
}

/**
 * Formats a Markdown AST into terminal lines.
 *
 * @param {string} markdown - Raw Markdown text to render
 * @param {object} options
 * @param {number} options.maxWidth - Available width for left-pane content
 * @param {boolean} options.isStreaming - True if token streaming is active (virtually closes open fences)
 * @param {string} options.indent - Left indent prefix (default "   ")
 * @returns {string[]} Formatted lines ready for left-pane display
 */
export function renderMarkdownToLines(markdown, { maxWidth = 70, isStreaming = false, indent = "   " } = {}) {
    if (!markdown) return [];

    const normalized = isStreaming ? normalizeStreamingMarkdown(markdown) : normalizeStreamingMarkdown(markdown);
    let tokens = [];
    try {
        tokens = marked.lexer(normalized);
    } catch {
        tokens = [{ type: "paragraph", text: markdown, tokens: [{ type: "text", text: markdown }] }];
    }

    const lines = [];
    const pushLine = (line) => {
        // Collapse multiple consecutive empty lines
        if (line === "" && (lines.length === 0 || lines[lines.length - 1] === "")) {
            return;
        }
        lines.push(line);
    };

    const contentWidth = Math.max(10, maxWidth - indent.length);

    const renderList = (token, depth = 0) => {
        let idx = token.start || 1;
        const baseIndent = indent + "  ".repeat(depth);
        for (const item of token.items) {
            const bullet = token.ordered
                ? `${idx++}. `
                : (depth === 0 ? `${PALETTE.orange}•${PALETTE.reset} ` : `${PALETTE.dim}◦${PALETTE.reset} `);

            // Extract primary item text
            let primaryText = "";
            const subLists = [];
            if (item.tokens) {
                for (const sub of item.tokens) {
                    if (sub.type === "list") {
                        subLists.push(sub);
                    } else if (sub.type === "text" || sub.type === "paragraph") {
                        if (primaryText) primaryText += "\n";
                        primaryText += renderInlineTokens(sub.tokens || [{ type: "text", text: sub.text }]);
                    }
                }
            } else {
                primaryText = item.text || "";
            }

            const itemWidth = Math.max(5, contentWidth - 4 - depth * 2);
            const wrapped = wrapAnsi(primaryText, itemWidth, { hard: true, trim: false }).split("\n");
            if (wrapped.length > 0) {
                pushLine(`${baseIndent}${bullet}${PALETTE.white}${wrapped[0]}${PALETTE.reset}`);
                const hangingPad = " ".repeat(stripAnsi(bullet).length);
                for (let k = 1; k < wrapped.length; k++) {
                    pushLine(`${baseIndent}${hangingPad}${PALETTE.white}${wrapped[k]}${PALETTE.reset}`);
                }
            }

            for (const subList of subLists) {
                renderList(subList, depth + 1);
            }
        }
    };

    for (const token of tokens) {
        switch (token.type) {
            case "heading": {
                const text = renderInlineTokens(token.tokens || [{ type: "text", text: token.text }]);
                const prefix = "#".repeat(Math.max(1, Math.min(6, token.depth))) + " ";
                const styled = `\x1b[1;38;2;255;255;255m${prefix}${text}\x1b[0m`;
                const wrapped = wrapAnsi(styled, contentWidth, { hard: true, trim: false }).split("\n");
                for (const w of wrapped) {
                    pushLine(`${indent}${w}`);
                }
                pushLine("");
                break;
            }

            case "paragraph": {
                const text = renderInlineTokens(token.tokens || [{ type: "text", text: token.text }]);
                const wrapped = wrapAnsi(text, contentWidth, { hard: true, trim: false }).split("\n");
                for (const w of wrapped) {
                    pushLine(`${indent}${PALETTE.white}${w}${PALETTE.reset}`);
                }
                pushLine("");
                break;
            }

            case "code": {
                const label = getLanguageLabel(token.lang);
                // Language indicator line above the code
                pushLine(`${indent}${PALETTE.dim}${label}${PALETTE.reset}`);

                const highlighted = highlightCode(token.text, token.lang);
                const codeLines = highlighted.split("\n");
                // Remove trailing empty line if text ended with newline
                if (codeLines.length > 1 && codeLines[codeLines.length - 1] === "") {
                    codeLines.pop();
                }
                for (const cl of codeLines) {
                    pushLine(`${indent}${cl}`);
                }
                pushLine("");
                break;
            }

            case "list": {
                renderList(token, 0);
                pushLine("");
                break;
            }

            case "blockquote": {
                let quoteText = "";
                if (token.tokens) {
                    for (const sub of token.tokens) {
                        if (quoteText) quoteText += "\n";
                        quoteText += renderInlineTokens(sub.tokens || [{ type: "text", text: sub.text }]);
                    }
                } else {
                    quoteText = token.text || "";
                }
                const quoteWidth = Math.max(5, contentWidth - 4);
                const wrapped = wrapAnsi(quoteText, quoteWidth, { hard: true, trim: false }).split("\n");
                for (const w of wrapped) {
                    pushLine(`${indent}${PALETTE.orange}│${PALETTE.reset} \x1b[3m${w}\x1b[23m`);
                }
                pushLine("");
                break;
            }

            case "table": {
                // Header cells
                const headers = token.header.map((h) => renderInlineTokens(h.tokens || [{ type: "text", text: h.text }]));
                const rows = token.rows.map((row) =>
                    row.map((cell) => renderInlineTokens(cell.tokens || [{ type: "text", text: cell.text }]))
                );

                // Compute column widths
                const colWidths = headers.map((h) => Math.max(3, stripAnsi(h).length));
                for (const r of rows) {
                    r.forEach((cell, idx) => {
                        colWidths[idx] = Math.max(colWidths[idx] || 3, stripAnsi(cell).length);
                    });
                }

                const padCell = (cell, width) => {
                    const vis = stripAnsi(cell).length;
                    return cell + " ".repeat(Math.max(0, width - vis));
                };

                const headerRow = headers.map((h, i) => padCell(h, colWidths[i])).join(` ${PALETTE.border}│${PALETTE.reset} `);
                const dividerRow = colWidths.map((w) => "─".repeat(w)).join(`─${PALETTE.border}┼${PALETTE.reset}─`);

                pushLine(`${indent}\x1b[1m${headerRow}\x1b[22m`);
                pushLine(`${indent}${PALETTE.border}${dividerRow}${PALETTE.reset}`);

                for (const r of rows) {
                    const rowStr = r.map((cell, i) => padCell(cell, colWidths[i])).join(` ${PALETTE.border}│${PALETTE.reset} `);
                    pushLine(`${indent}${PALETTE.white}${rowStr}${PALETTE.reset}`);
                }
                pushLine("");
                break;
            }

            case "hr": {
                pushLine(`${indent}${PALETTE.border}${"─".repeat(Math.min(contentWidth, 40))}${PALETTE.reset}`);
                pushLine("");
                break;
            }

            case "space": {
                // Ignore raw space tokens since block switches manage natural vertical spacing
                break;
            }

            default: {
                if (token.text) {
                    const text = renderInlineTokens(token.tokens || [{ type: "text", text: token.text }]);
                    const wrapped = wrapAnsi(text, contentWidth, { hard: true, trim: false }).split("\n");
                    for (const w of wrapped) {
                        pushLine(`${indent}${PALETTE.white}${w}${PALETTE.reset}`);
                    }
                    pushLine("");
                }
                break;
            }
        }
    }

    // Trim trailing empty lines
    while (lines.length > 0 && lines[lines.length - 1] === "") {
        lines.pop();
    }

    return lines;
}

/**
 * Default export
 */
export default {
    renderMarkdownToLines,
    highlightCode,
    normalizeStreamingMarkdown,
    getLanguageLabel,
    PALETTE,
    vsCodeDarkPlusTheme
};
