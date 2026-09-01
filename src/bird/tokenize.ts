// Shared question tokenizer for schema pruning and few-shot matching.
// The stop-word list is the union of the two lists that previously drifted apart.
const STOP_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "need", "dare", "ought",
  "to", "of", "in", "for", "on", "with", "at", "by", "from", "as",
  "into", "through", "during", "before", "after", "above", "below",
  "and", "but", "or", "not", "no", "nor", "so", "yet", "both",
  "each", "all", "any", "few", "more", "most", "other", "some",
  "such", "than", "too", "very", "just", "about",
  "me", "my", "i", "you", "your", "we", "our", "they", "their",
  "it", "its", "this", "that", "these", "those", "what", "which",
  "who", "whom", "how", "where", "when", "why",
  "show", "give", "tell", "get", "find", "list", "display", "many", "much",
  "select", "count", "sum", "avg", "every",
  "의", "가", "이", "은", "는", "을", "를", "에", "에서", "와", "과",
  "도", "로", "으로", "만", "까지", "부터", "에게", "한테", "께",
  "좀", "해줘", "알려줘", "보여줘", "해", "하는", "된", "인", "수",
  "총", "전체", "모든", "몇", "얼마나",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}
