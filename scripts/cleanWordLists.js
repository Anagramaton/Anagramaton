#!/usr/bin/env node
/**
 * cleanWordLists.js
 *
 * Reads all wordList_N.js files in the repo root, applies the jargon filter,
 * and writes the cleaned arrays back in-place.
 *
 * Run with: npm run clean-words
 */

import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Jargon filter — copied verbatim from scripts/buildWordList.js
// ---------------------------------------------------------------------------

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

const SAFE_JARGON_PREFIXES = [
  'glyco', 'phospho', 'nucleo', 'ribonucleo', 'deoxyribonucleo',
  'hemato', 'haemato', 'leuko', 'lympho', 'thrombo', 'erythro',
  'hepato', 'nephro', 'chondro', 'myelo',
  'cyto', 'adeno', 'cholecysto', 'lapar',
];

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
const files = readdirSync(ROOT).filter(f => /^wordList_\d+\.js$/.test(f)).sort();

if (files.length === 0) {
  console.error('No wordList_N.js files found in repo root!');
  process.exit(1);
}

let grandBefore = 0;
let grandRemoved = 0;

for (const filename of files) {
  const filePath = resolve(ROOT, filename);
  const content = readFileSync(filePath, 'utf8');

  // Extract the JSON array from `export default [...]`
  const match = content.match(/export default (\[[\s\S]*\])/);
  if (!match) {
    console.warn(`⚠️  Skipping ${filename} — could not parse export default array`);
    continue;
  }

  const words = JSON.parse(match[1]);
  const before = words.length;

  const seen = new Set();
  const cleaned = [];
  for (const word of words) {
    if (!/^[a-z]+$/.test(word)) continue;
    if (isJargon(word)) continue;
    if (seen.has(word)) continue;
    seen.add(word);
    cleaned.push(word);
  }
  cleaned.sort();

  const removed = before - cleaned.length;
  grandBefore += before;
  grandRemoved += removed;

  writeFileSync(filePath, `export default ${JSON.stringify(cleaned)}\n`, 'utf8');
  console.log(`✅ ${filename}: ${before} → ${cleaned.length} words (removed ${removed})`);
}

console.log(`\n🎉 Done! Total: ${grandBefore} → ${grandBefore - grandRemoved} words (removed ${grandRemoved})`);
