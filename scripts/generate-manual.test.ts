import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('manual source of truth', () => {
  it('keeps rules file available for manual generation', () => {
    const rulesPath = path.join(process.cwd(), 'rules', 'sambao.yaml');
    const raw = fs.readFileSync(rulesPath, 'utf8');

    expect(raw).toContain('source_of_truth');
    expect(raw).toContain('supported_modes');
    expect(raw).toContain('sections:');
  });
});

