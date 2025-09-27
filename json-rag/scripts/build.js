#!/usr/bin/env node
/**
 * Simple build script for npm publish
 * Creates dist directory with minimal files
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Create dist directory
const distDir = path.join(__dirname, '..', 'dist');
if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
}

// Copy essential files
const filesToCopy = [
    { src: '../index.js', dest: 'index.js' },
    { src: '../core/json-rag-core.js', dest: 'json-rag-core.js' },
    { src: '../core/query-engine.js', dest: 'query-engine.js' },
    { src: '../core/vector-manager.js', dest: 'vector-manager.js' },
    { src: '../core/types.js', dest: 'types.js' }
];

console.log('📦 Building @memoria/json-rag-core for npm...');

filesToCopy.forEach(({ src, dest }) => {
    const srcPath = path.join(__dirname, src);
    const destPath = path.join(distDir, dest);
    
    if (fs.existsSync(srcPath)) {
        // Create subdirectories if needed
        const destDir = path.dirname(destPath);
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }
        
        fs.copyFileSync(srcPath, destPath);
        console.log(`  ✓ Copied ${dest}`);
    } else {
        console.log(`  ⚠ Skipped ${src} (not found)`);
    }
});

// Create a simple index.d.ts for TypeScript support
const dtsContent = `/**
 * @memoria/json-rag-core
 * TypeScript definitions
 */

export interface Doc {
    id: string;
    text: string;
    meta?: Record<string, any>;
}

export interface QueryOptions {
    limit?: number;
    threshold?: number;
    weights?: {
        vector?: number;
        text?: number;
    };
}

export interface SearchResult {
    id: string;
    snippet: string;
    score: number;
    meta?: Record<string, any>;
}

export function index(docs: Doc | Doc[]): Promise<void>;
export function query(q: string, options?: QueryOptions): Promise<SearchResult[]>;
export function clear(): Promise<void>;

export default {
    index,
    query,
    clear
};
`;

fs.writeFileSync(path.join(distDir, 'index.d.ts'), dtsContent);
console.log('  ✓ Generated TypeScript definitions');

// Use npm README for the package
const npmReadmePath = path.join(__dirname, '..', 'README.npm.md');
const readmeDest = path.join(__dirname, '..', 'README.md');
if (fs.existsSync(npmReadmePath)) {
    fs.copyFileSync(npmReadmePath, readmeDest);
    console.log('  ✓ Updated README for npm');
}

console.log('✅ Build complete! Ready for npm publish.');
console.log('');
console.log('Next steps:');
console.log('  1. cd json-rag');
console.log('  2. npm login');
console.log('  3. npm publish --access public --tag alpha');
