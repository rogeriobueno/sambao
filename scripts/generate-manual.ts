import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

type RuleSection = {
  title: string;
  bullets?: string[];
  notes?: string[];
  table?: {
    headers: [string, string];
    rows: [string, string][];
  };
};

type RulesDocument = {
  metadata: {
    title: string;
    subtitle: string;
    objective: string;
    source_of_truth: string;
  };
  material: {
    decks: number;
    include_jokers: boolean;
  };
  supported_modes: Array<{
    id: string;
    label: string;
    players: number;
    teams: number;
    players_per_team: number;
  }>;
  sections: RuleSection[];
};

const root = process.cwd();
const rulesPath = path.join(root, 'rules', 'sambao.yaml');
const readmePath = path.join(root, 'README.md');
const checkMode = process.argv.includes('--check');

const raw = fs.readFileSync(rulesPath, 'utf8');
const parsed = yaml.load(raw) as RulesDocument;

if (!parsed?.metadata || !Array.isArray(parsed.sections)) {
  throw new Error('Arquivo de regras invalido: metadata e sections sao obrigatorios.');
}

function renderTable(headers: [string, string], rows: [string, string][]): string {
  const lines = [
    `| ${headers[0]} | ${headers[1]} |`,
    '| --- | --- |',
    ...rows.map((row) => `| ${row[0]} | ${row[1]} |`),
  ];
  return lines.join('\n');
}

function renderSection(section: RuleSection): string {
  const chunks: string[] = [`## ${section.title}`, ''];

  if (section.bullets?.length) {
    chunks.push(...section.bullets.map((bullet) => `- ${bullet}`), '');
  }

  if (section.table) {
    chunks.push(renderTable(section.table.headers, section.table.rows), '');
  }

  if (section.notes?.length) {
    chunks.push(...section.notes.map((note) => `> ${note}`), '');
  }

  return chunks.join('\n');
}

const manual = [
  '# Manual do Jogo de Cartas Sambao',
  '',
  `> ${parsed.metadata.subtitle}`,
  '',
  `> ${parsed.metadata.source_of_truth}`,
  '',
  '---',
  '',
  '## Formatos da Partida (digital)',
  '',
  renderTable(
    ['Modo', 'Configuracao'],
    parsed.supported_modes.map((mode) => [
      mode.label,
      `${mode.players} jogadores, ${mode.teams} equipes, ${mode.players_per_team} por equipe`,
    ])
  ),
  '',
  ...parsed.sections.map((section) => renderSection(section)).flatMap((value) => [value, '---', '']),
  '## Desenvolvimento',
  '',
  '- O backend MVP suporta uma partida ativa por vez (single match).',
  '- A interface minima local fica em `http://localhost:8787/`.',
  '- Este README e gerado automaticamente de `rules/sambao.yaml`.',
  '- Para editar regras, altere `rules/sambao.yaml` e rode `npm run generate:manual`.',
  '',
  '## Rodar localmente (Docker)',
  '',
  '```bash',
  'docker compose up --build',
  '```',
  '',
  '## Endpoints MVP',
  '',
  '- `GET /health`',
  '- `GET /matches/modes`',
  '- `GET /matches/active`',
  '- `POST /matches` com `{ "mode": "1v1|2v2|3v3" }`',
  '- `POST /matches/active/players` com `{ "name": "Nome", "teamId": "A|B" }`',
  '- `POST /matches/active/draw` com `{ "playerId": "..." }`',
  '- `POST /matches/active/draw-discard` com `{ "playerId": "..." }`',
  '- `POST /matches/active/meld` com `{ "playerId": "...", "cardIds": ["..."] }`',
  '- `POST /matches/active/open-table` com `{ "playerId": "...", "cardGroups": [["..."], ["..."]] }`',
  '- `POST /matches/active/meld/extend` com `{ "playerId": "...", "meldId": "...", "cardIds": ["..."] }`',
  '- `POST /matches/active/discard` com `{ "playerId": "...", "cardId": "..." }`',
  '- `POST /matches/active/go-out` com `{ "playerId": "...", "cardId": "..." }`',
  '- `POST /matches/active/reset`',
  '',
].join('\n');

if (checkMode) {
  const current = fs.readFileSync(readmePath, 'utf8');
  if (current !== manual) {
    console.error('README.md esta desatualizado em relacao ao rules/sambao.yaml');
    process.exit(1);
  }
  console.log('README.md esta sincronizado.');
  process.exit(0);
}

fs.writeFileSync(readmePath, manual, 'utf8');
console.log('README.md gerado com sucesso.');

