#!/usr/bin/env node
/**
 * buildWordList.js
 *
 * Reads words.js/words.txt, applies filtering rules, and writes one JS module
 * per word length: wordList_4.js, wordList_5.js … wordList_10.js, wordList_11plus.js.
 * Words shorter than 4 letters are dropped (they are never valid in-game).
 *
 * Filtering rules:
 * 1. Minimum length 4 characters
 * 2. Only lowercase a–z letters (no hyphens, digits, spaces, etc.)
 * 3. Not science/tech jargon
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Jargon filter helpers
// ---------------------------------------------------------------------------

// Suffixes that almost exclusively appear on scientific/technical jargon.
// Carefully chosen to avoid false positives on common English words.
const JARGON_SUFFIXES = [
  // Medical / surgical procedures
  'ectomy', 'otomy', 'ostomy', 'plasty', 'rrhaphy', 'desis', 'pexy',
  // Diagnostic / measurement
  'oscopy', 'ography', 'ometry', 'oscopic', 'ographic',
  // Inflammation / disease
  'itis',
  // Cell / tissue biology
  'cyte', 'blastic', 'poiesis', 'genesis', 'plasia',
  // Chemical compound classes (very long forms only)
  'aldehyde', 'ketone',
  // Drug / pharmacology suffixes
  'cillin', 'mycin', 'cycline', 'azole', 'olone', 'ipine', 'sartan',
  'prazole', 'statin', 'mab', 'kinase', 'ptase', 'lyase', 'ferase',
  'reductase', 'oxidase', 'dehydrogenase', 'synthase', 'synthetase',
  'peptidase', 'protease', 'lipase', 'nuclease', 'glycosidase',
  // Taxonomy / Latin biology
  'optera', 'iformes', 'oidea', 'aceae', 'phyta', 'mycota', 'zoa',
  // Computing
  'algorithmic', 'polymorphism', 'encapsulation',
  // Medical discharge / flow conditions
  'rhoea', 'rrhoea', 'rrhoeas', 'rrhea', 'rrheas',
  // Anatomical joint/structural states
  'throsis', 'throses',
];

// Prefixes almost exclusively found in scientific terms.
const JARGON_PREFIXES = [
  'glyco', 'phospho', 'nucleo', 'ribonucleo', 'deoxyribonucleo',
  'hemato', 'haemato', 'leuko', 'lympho', 'thrombo', 'erythro',
  'hepato', 'nephro', 'osteo', 'chondro', 'neuro', 'dermo',
  'myelo', 'cardio',        // too broad — removed; kept here just for reference
  'cyto',                   // cytochrome, cytoplasm, etc.
  'adeno', 'cholecysto', 'lapar',
  'hydro',                  // also used in everyday: removed below
  'xeno', 'iso',            // also everyday words — keep out of prefix list
];

// Safer prefix set (only prefixes that very rarely appear in everyday words):
const SAFE_JARGON_PREFIXES = [
  'glyco', 'phospho', 'nucleo', 'ribonucleo', 'deoxyribonucleo',
  'hemato', 'haemato', 'leuko', 'lympho', 'thrombo', 'erythro',
  'hepato', 'nephro', 'chondro', 'myelo',
  'cyto', 'adeno', 'cholecysto', 'lapar',
];

// Specific blocklisted words / stems — known jargon that doesn't match
// the suffix / prefix patterns above.
const BLOCKLIST = new Set([
  // Amino acids
  'alanine', 'arginine', 'asparagine', 'aspartate', 'aspartic',
  'cysteine', 'glutamine', 'glutamate', 'glutamic', 'glycine',
  'histidine', 'isoleucine', 'leucine', 'lysine', 'methionine',
  'phenylalanine', 'proline', 'serine', 'threonine', 'tryptophan',
  'tyrosine', 'valine',
  // Common biochemical molecules
  'adenosine', 'guanosine', 'cytidine', 'thymidine', 'uridine',
  'adenine', 'guanine', 'cytosine', 'thymine', 'uracil',
  'nucleotide', 'nucleoside', 'nucleotides', 'nucleosides',
  'ribose', 'deoxyribose',
  'adenosinetriphosphate', 'atp', 'adp', 'amp', 'gtp', 'gdp', 'gmp',
  'coenzyme', 'cofactor',
  // Enzymes / proteins
  'cytochrome', 'cytochromes',
  'glycoprotein', 'glycoproteins', 'lipoprotein', 'lipoproteins',
  'phosphorylation', 'phosphorylate', 'phosphorylated',
  'glycolysis', 'gluconeogenesis', 'gluconeogenic',
  'photosynthesis', 'photosynthetic', 'photosynthesize',
  'mitochondria', 'mitochondrion', 'mitochondrial',
  'ribosome', 'ribosomes', 'ribosomal',
  'chromosome', 'chromosomes', 'chromosomal',
  'centromere', 'centromeres', 'telomere', 'telomeres',
  'nucleosome', 'nucleosomes',
  'transcription', 'translation', 'replication',
  'promoter', // keep? common English too, keep it
  'splicing', 'spliceosome', 'intron', 'introns', 'exon', 'exons',
  'polymerase', 'polymerases', 'topoisomerase', 'topoisomerases',
  'helicase', 'helicases',
  // Medical / anatomical jargon
  'thrombocyte', 'thrombocytes', 'thrombocytopenia',
  'eosinophil', 'eosinophils', 'eosinophilia',
  'leukocyte', 'leukocytes', 'leukocytosis',
  'lymphocyte', 'lymphocytes', 'lymphocytosis',
  'erythrocyte', 'erythrocytes', 'erythrocytosis',
  'fibrinogen', 'fibrinogens',
  'immunoglobulin', 'immunoglobulins',
  'haematopoiesis', 'haematopoietic', 'hematopoiesis', 'hematopoietic',
  'granulocyte', 'granulocytes', 'granulocytosis',
  'monocyte', 'monocytes', 'monocytosis',
  'basophil', 'basophils', 'basophilia',
  'neutrophil', 'neutrophils', 'neutrophilia',
  'phagocyte', 'phagocytes', 'phagocytosis',
  'macrophage', 'macrophages',
  'dendritic',
  'epithelium', 'epithelial', 'epithelia',
  'endothelium', 'endothelial', 'endothelia',
  'mesenchyme', 'mesenchymal',
  'fibroblast', 'fibroblasts',
  'osteoblast', 'osteoblasts', 'osteoclast', 'osteoclasts',
  'chondrocyte', 'chondrocytes',
  'myocyte', 'myocytes',
  'hepatocyte', 'hepatocytes',
  'adipocyte', 'adipocytes',
  // Taxonomic names
  'lepidoptera', 'coleoptera', 'diptera', 'hymenoptera', 'hemiptera',
  'orthoptera', 'neuroptera', 'siphonaptera', 'trichoptera',
  'blattodea', 'phasmatodea', 'mantodea', 'isoptera', 'dermaptera',
  'thysanoptera', 'anoplura', 'mallophaga', 'phthiraptera',
  'lepidopteran', 'coleopteran', 'dipteran',
  // Programming / computing
  'boolean', 'booleans',
  'integer', 'integers',
  'subroutine', 'subroutines',
  'hexadecimal', 'hexadecimals',
  'algorithmic',
  'polymorphism', 'polymorphisms',
  'encapsulation', 'encapsulations',
  'recursion', 'recursions', 'recursive',
  'pseudocode',
  'bitwise', 'bitmask', 'bitmasks',
  'bytecode', 'bytecodes',
  'preprocessor', 'preprocessors',
  'instantiate', 'instantiates', 'instantiation',
  'refactoring', 'refactorings',
  'monomorphic', 'polymorphic',
  'serialization', 'deserialization', 'serializations',
  'tokenizer', 'tokenizers', 'tokenization',
  'microcontroller', 'microcontrollers',
  'microprocessor', 'microprocessors',
  // Physics / chemistry jargon
  'isothermal', 'isothermally',
  'adiabatic', 'adiabatically',
  'thermodynamic', 'thermodynamics', 'thermodynamical',
  'isentropic', 'isobaric', 'isochoric', 'isotopic',
  'stoichiometry', 'stoichiometric', 'stoichiometries',
  'spectroscopy', 'spectroscopic', 'spectrometry', 'spectrometric',
  'chromatography', 'chromatographic',
  'electrophoresis', 'electrophoretic',
  'centrifugation', 'centrifuge', 'centrifuges',
  'titration', 'titratable',
  'dielectric',
  'magnetometer', 'magnetometers',
  'oscilloscope', 'oscilloscopes',
  'voltmeter', 'voltmeters', 'ammeter', 'ammeters',
  // Diarrhoea forms
  'diarrhoea', 'diarrhoeic', 'diarrheal', 'diarrheas', 'diarrheic',
  // Anatomical / medical
  'diastema', 'diastemata',
  'diarthrosis', 'diarthroses',
  'diastasis', 'diastases',
  'diplegia', 'diplegias',
  'diphylla',
  'diencephalon', 'diencephalons', 'diencephala',
  'diasterism', 'diasterisms',
  // Taxonomy / biology
  'dibranchiata', 'dibranchiate', 'dibranchiates',
  'dictyopteran', 'dictyopterans',
  'dictyosome', 'dictyosomes',
  'dicynodont', 'dicynodonts',
  'diplococci', 'diplococcus',
  'diplodocus', 'diplodocuses', 'diplodoci',
  'dimorphotheca', 'dimorphothecas',
  // Chemistry compounds
  'dihydrostreptomycin',
  'diethylmalonylurea',
  'diethylstilbestrol', 'diethylstilboestrol',
]);

// Substrings that, when found anywhere in a word, mark it as jargon.
// Only include substrings that do NOT appear in common everyday English words.
const JARGON_SUBSTRINGS = [
  'glyco', 'phospho', 'nucleo',
  'hemato', 'haemato',
  'thrombo', 'erythro',
  'hepato', 'nephro', 'chondro', 'myelo',
  'cyto',       // cytochrome, cytology, cytoplasm
  'adeno',      // adenosine, adenoma
  'lympho',
  'leuko', 'leuco',
  // Enzyme class names (as substrings)
  'kinase', 'ptase', 'lyase', 'ferase',
  // Very long chemical/biological pattern fragments
  'nucleotid', 'nucleosid',
  'ribosom', 'chromos', 'mitochond',
  'telomer', 'centrom',
  'spliceosom',
  // Taxonomic fragments
  'optera', 'iformes', 'oidea', 'aceae', 'phyta', 'mycota',
  'encephalon',  // diencephalon, telencephalon, mesencephalon
  'diplococ',    // diplococcus, diplococci
  'diplodoc',    // diplodocus, diplodoci
];

// ---------------------------------------------------------------------------
// Utility: check if a word is jargon
// ---------------------------------------------------------------------------
function isJargon(word) {
  if (BLOCKLIST.has(word)) return true;

  for (const suffix of JARGON_SUFFIXES) {
    if (word.endsWith(suffix)) return true;
  }

  for (const prefix of SAFE_JARGON_PREFIXES) {
    if (word.startsWith(prefix)) return true;
  }

  for (const sub of JARGON_SUBSTRINGS) {
    if (word.includes(sub)) return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
// Note: the old monolithic wordList.js / wordList.json is no longer generated
// here. Words are now written to per-length chunk files (wordList_4.js …
// wordList_10.js, wordList_11plus.js) so that callers can import only what they
// need. wordList.js can be safely deleted once all imports reference the chunks.
const inputPath = resolve(ROOT, 'words.js', 'words.txt');

const raw = readFileSync(inputPath, 'utf8');
const lines = raw.split('\n');

const seen = new Set();
// Map from bucket key → word array
const buckets = {};
for (let len = 4; len <= 10; len++) buckets[String(len)] = [];
buckets['11plus'] = [];

for (const raw of lines) {
  const word = raw.trim();
  if (!word) continue;

  // Rule 1: minimum length 4 (words shorter than 4 are never valid in-game)
  if (word.length < 4) continue;

  // Rule 2: only lowercase a–z
  if (!/^[a-z]+$/.test(word)) continue;

  // Rule 3: not jargon
  if (isJargon(word)) continue;

  // Deduplicate
  if (seen.has(word)) continue;
  seen.add(word);

  // Bucket by length
  const key = word.length <= 10 ? String(word.length) : '11plus';
  buckets[key].push(word);
}

// Write one JS module per bucket
let total = 0;
for (const [key, words] of Object.entries(buckets)) {
  words.sort();
  const fileName = key === '11plus' ? 'wordList_11plus.js' : `wordList_${key}.js`;
  const outputPath = resolve(ROOT, fileName);
  const output = `export default ${JSON.stringify(words)};\n`;
  writeFileSync(outputPath, output, 'utf8');
  console.log(`Wrote ${words.length} words to ${fileName}`);
  total += words.length;
}
console.log(`Total: ${total} words across all chunks.`);
