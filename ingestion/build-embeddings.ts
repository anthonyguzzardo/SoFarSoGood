/**
 * Build content-based similarity edges between NIAC concepts.
 *
 * Replaces the naive keyword-overlap approach with actual TF-IDF cosine
 * similarity computed over each concept's full textual content (title,
 * abstract, keywords, subjects).
 *
 * Run with:  node --experimental-strip-types ingestion/build-embeddings.ts
 * For sentence-transformer embeddings: add --embeddings flag
 *
 * Output: data/concept-similarities.json
 */

import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(HERE, "..", "data");
const CONCEPTS_FILE = join(DATA_DIR, "concepts.json");
const OUT_FILE = join(DATA_DIR, "concept-similarities.json");

const USE_EMBEDDINGS = process.argv.includes("--embeddings");

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

interface RawConcept {
  slug: string;
  title: string;
  abstract: string;
  keywords: string[];
  subjects: string[];
}

interface SimilarityEdge {
  source: string;
  target: string;
  similarity: number;
}

interface SimilarityOutput {
  method: "tfidf" | "sentence-transformer";
  generatedAt: string;
  threshold: number;
  edges: SimilarityEdge[];
}

/* -------------------------------------------------------------------------- */
/* Stop words                                                                  */
/* -------------------------------------------------------------------------- */

const STOP_WORDS = new Set([
  // Common English
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "as", "is", "was", "are", "were", "been",
  "be", "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "need", "must",
  "i", "me", "my", "we", "our", "you", "your", "he", "him", "his",
  "she", "her", "it", "its", "they", "them", "their", "what", "which",
  "who", "whom", "this", "that", "these", "those", "am", "being",
  "about", "above", "after", "again", "against", "all", "also", "any",
  "because", "before", "below", "between", "both", "during", "each",
  "few", "further", "here", "how", "if", "into", "just", "more", "most",
  "no", "nor", "not", "now", "only", "other", "out", "over", "own",
  "same", "so", "some", "such", "than", "then", "there", "through",
  "too", "under", "until", "up", "very", "when", "where", "while",
  "why", "down", "off", "once", "still", "much", "many",
  "however", "therefore", "thus", "although", "though",
  "since", "whether", "yet", "already", "often", "never", "always",
  "even", "every", "either", "neither", "rather", "quite",
  "less", "least", "several", "another",
  "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "first", "second", "third", "new", "old", "high", "low", "long", "large",
  "small", "great", "good", "right", "left", "next", "last", "early", "late",
  "made", "make", "like", "use", "used", "using", "work", "get", "set", "see",
  "also", "well", "back", "way", "take", "give", "given", "go", "went", "come",
  "say", "said", "know", "known", "think", "find", "found", "want", "show",
  "shown", "try", "provide", "include", "including", "allow", "based",
  "result", "results", "within", "without", "along", "among",
  "around", "across", "toward", "towards", "upon", "per", "via", "due",
  "able", "end", "part", "possible", "potential",
  "current", "recent", "present", "future",
  "required", "require", "specific", "different", "similar",
  "various", "significant", "important", "available", "particular",
  "general", "overall", "total", "initial", "existing", "proposed",
  "developed", "development", "order", "number", "time", "year", "years",
  "case", "example", "addition", "key", "major", "previous",
  // Domain-specific noise (appear in nearly all NIAC abstracts)
  "nasa", "niac", "phase", "final", "report", "study", "concept",
  "mission", "project", "program", "research", "technology", "system",
  "systems", "design", "analysis", "advanced", "innovative", "novel",
  "space", "demonstrate", "demonstrated", "enable", "enables", "enabled",
  "develop", "develops", "developing", "approach",
]);

/* -------------------------------------------------------------------------- */
/* Simple suffix stemmer                                                       */
/* -------------------------------------------------------------------------- */

function stem(word: string): string {
  if (word.length < 4) return word;
  const suffixes: [string, string][] = [
    ["ational", "ate"], ["tional", "tion"], ["ization", "ize"],
    ["fulness", "ful"], ["ousness", "ous"], ["iveness", "ive"],
    ["ically", "ic"], ["ation", "ate"], ["iness", "y"],
    ["ities", "ity"], ["ously", "ous"], ["ively", "ive"],
    ["ating", "ate"], ["izing", "ize"], ["ional", "ion"],
    ["ment", ""], ["ness", ""], ["ence", ""], ["ance", ""],
    ["ings", ""], ["tion", ""], ["sion", ""], ["ally", "al"],
    ["ies", "y"], ["ing", ""], ["ful", ""], ["ous", ""],
    ["ive", ""], ["ity", ""], ["ted", "t"], ["ed", ""],
    ["ly", ""], ["es", ""], ["er", ""], ["al", ""], ["s", ""],
  ];
  for (const [suffix, replacement] of suffixes) {
    if (word.endsWith(suffix) && (word.length - suffix.length + replacement.length) >= 3) {
      return word.slice(0, word.length - suffix.length) + replacement;
    }
  }
  return word;
}

/* -------------------------------------------------------------------------- */
/* Tokenization                                                                */
/* -------------------------------------------------------------------------- */

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w))
    .map(stem);
}

/* -------------------------------------------------------------------------- */
/* TF-IDF computation                                                          */
/* -------------------------------------------------------------------------- */

interface TfIdfVector {
  slug: string;
  terms: Map<string, number>;
  magnitude: number;
}

function buildTfIdfVectors(concepts: RawConcept[]): TfIdfVector[] {
  const N = concepts.length;

  const docs = concepts.map((c) => {
    const text = [
      c.title, c.title, // double-weight title
      c.abstract,
      c.keywords.join(" "),
      c.subjects.join(" "),
    ].join(" ");
    return { slug: c.slug, tokens: tokenize(text) };
  });

  // Document frequencies
  const df = new Map<string, number>();
  for (const doc of docs) {
    const seen = new Set<string>();
    for (const token of doc.tokens) {
      if (!seen.has(token)) {
        df.set(token, (df.get(token) ?? 0) + 1);
        seen.add(token);
      }
    }
  }

  // Build vectors
  return docs.map((doc) => {
    if (doc.tokens.length === 0) {
      return { slug: doc.slug, terms: new Map(), magnitude: 0 };
    }
    const totalTerms = doc.tokens.length;
    const tf = new Map<string, number>();
    for (const token of doc.tokens) {
      tf.set(token, (tf.get(token) ?? 0) + 1);
    }
    const terms = new Map<string, number>();
    let magnitudeSq = 0;
    for (const [term, count] of tf) {
      const tfidf = (count / totalTerms) * Math.log(N / (df.get(term) ?? 1));
      if (tfidf > 0) {
        terms.set(term, tfidf);
        magnitudeSq += tfidf * tfidf;
      }
    }
    return { slug: doc.slug, terms, magnitude: Math.sqrt(magnitudeSq) };
  });
}

function cosineSimilarity(a: TfIdfVector, b: TfIdfVector): number {
  if (a.magnitude === 0 || b.magnitude === 0) return 0;
  let dot = 0;
  const [smaller, larger] = a.terms.size <= b.terms.size ? [a, b] : [b, a];
  for (const [term, valA] of smaller.terms) {
    const valB = larger.terms.get(term);
    if (valB !== undefined) dot += valA * valB;
  }
  return dot / (a.magnitude * b.magnitude);
}

/* -------------------------------------------------------------------------- */
/* Sentence Transformer embeddings (optional, --embeddings flag)               */
/* -------------------------------------------------------------------------- */

const HF_API_URL =
  "https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2";

async function fetchEmbeddings(texts: string[]): Promise<number[][]> {
  const token = process.env.HF_TOKEN ?? "";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const resp = await fetch(HF_API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ inputs: texts, options: { wait_for_model: true } }),
  });
  if (!resp.ok) throw new Error(`HF API ${resp.status}: ${await resp.text()}`);
  return resp.json() as Promise<number[][]>;
}

function cosineSimVec(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

async function buildEmbeddingVectors(concepts: RawConcept[]) {
  const texts = concepts.map((c) => `${c.title}. ${c.abstract.slice(0, 400)}`);
  const BATCH = 8;
  const embeddings: number[][] = [];
  const total = Math.ceil(texts.length / BATCH);
  for (let i = 0; i < texts.length; i += BATCH) {
    const n = Math.floor(i / BATCH) + 1;
    process.stdout.write(`  Batch ${n}/${total}...\r`);
    embeddings.push(...await fetchEmbeddings(texts.slice(i, i + BATCH)));
    if (i + BATCH < texts.length) await new Promise((r) => setTimeout(r, 200));
  }
  console.log(`  Fetched ${embeddings.length} embeddings (${embeddings[0]?.length ?? 0} dims)`);
  return { slugs: concepts.map((c) => c.slug), embeddings };
}

/* -------------------------------------------------------------------------- */
/* Edge extraction                                                             */
/* -------------------------------------------------------------------------- */

function extractEdges(
  slugs: string[],
  simFn: (i: number, j: number) => number,
  threshold: number,
  topK: number,
): SimilarityEdge[] {
  const N = slugs.length;
  const totalPairs = (N * (N - 1)) / 2;
  console.log(`  Computing ${totalPairs.toLocaleString()} pairs...`);

  const neighbors = new Map<string, { slug: string; similarity: number }[]>();
  for (const s of slugs) neighbors.set(s, []);

  let computed = 0;
  const interval = Math.max(1, Math.floor(totalPairs / 20));

  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const sim = simFn(i, j);
      computed++;
      if (computed % interval === 0) {
        process.stdout.write(`  Progress: ${Math.round((computed / totalPairs) * 100)}%\r`);
      }
      if (sim < threshold) continue;
      neighbors.get(slugs[i])!.push({ slug: slugs[j], similarity: sim });
      neighbors.get(slugs[j])!.push({ slug: slugs[i], similarity: sim });
    }
  }
  console.log("  Progress: 100%");

  // Deduplicate, keep top-K per concept
  const edgeSet = new Set<string>();
  const edges: SimilarityEdge[] = [];
  for (const [slug, nbs] of neighbors) {
    nbs.sort((a, b) => b.similarity - a.similarity);
    for (const nb of nbs.slice(0, topK)) {
      const key = slug < nb.slug ? `${slug}|${nb.slug}` : `${nb.slug}|${slug}`;
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);
      const [source, target] = slug < nb.slug ? [slug, nb.slug] : [nb.slug, slug];
      edges.push({ source, target, similarity: Math.round(nb.similarity * 1000) / 1000 });
    }
  }
  return edges.sort((a, b) => b.similarity - a.similarity);
}

/* -------------------------------------------------------------------------- */
/* Main                                                                        */
/* -------------------------------------------------------------------------- */

async function main(): Promise<void> {
  console.log(USE_EMBEDDINGS ? "Mode: Sentence Transformer" : "Mode: TF-IDF");
  console.log("");

  const raw = await readFile(CONCEPTS_FILE, "utf-8");
  const concepts: RawConcept[] = JSON.parse(raw);
  const valid = concepts.filter((c) => c.abstract?.length > 20);
  console.log(`Processing ${valid.length} concepts (skipped ${concepts.length - valid.length} with empty abstracts)...`);

  const THRESHOLD = 0.15;
  const TOP_K = 8;
  let method: "tfidf" | "sentence-transformer";
  let edges: SimilarityEdge[];

  if (USE_EMBEDDINGS) {
    method = "sentence-transformer";
    console.log("\nFetching sentence embeddings from Hugging Face...");
    const { slugs, embeddings } = await buildEmbeddingVectors(valid);
    console.log("\nComputing similarity edges...");
    edges = extractEdges(slugs, (i, j) => cosineSimVec(embeddings[i], embeddings[j]), THRESHOLD, TOP_K);
  } else {
    method = "tfidf";
    console.log("\nBuilding TF-IDF vectors...");
    const vectors = buildTfIdfVectors(valid);
    console.log(`  ${vectors.filter((v) => v.magnitude > 0).length} non-zero vectors`);
    console.log("\nComputing similarity edges...");
    edges = extractEdges(vectors.map((v) => v.slug), (i, j) => cosineSimilarity(vectors[i], vectors[j]), THRESHOLD, TOP_K);
  }

  console.log(`\nFound ${edges.length} edges above threshold ${THRESHOLD}`);
  if (edges.length > 0) {
    const sims = edges.map((e) => e.similarity);
    console.log(`  Range: ${Math.min(...sims).toFixed(3)} – ${Math.max(...sims).toFixed(3)}`);
    console.log(`  Mean: ${(sims.reduce((a, b) => a + b, 0) / sims.length).toFixed(3)}`);
  }

  const output: SimilarityOutput = { method, generatedAt: new Date().toISOString(), threshold: THRESHOLD, edges };
  await writeFile(OUT_FILE, JSON.stringify(output, null, 2));
  console.log(`\n✓ Wrote ${edges.length} edges to ${OUT_FILE}`);
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
