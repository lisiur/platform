/**
 * Split an assistant text part into reasoning vs answer.
 *
 * Models that emit `think...` blocks intersperse the user's-facing answer
 * with the model's internal reasoning. We extract:
 *
 * - `thinking`: the concatenated contents of every `think` block (closed
 *   + currently open). If a `think` is unterminated, the suffix from the
 *   last open tag is included and `thinkingOpen` is true.
 * - `thinkingOpen`: true while there's an open `think` tag without a
 *   matching close. The renderer uses this to show a live caret.
 * - `answer`: the text outside any `think` block, trimmed. May be empty
 *   while the model is mid-thought.
 */
export function splitReasoning(input: string): {
  thinking: string | null;
  thinkingOpen: boolean;
  answer: string;
} {
  if (!input) return { thinking: null, thinkingOpen: false, answer: input };

  const blockRe = /<think\b[^>]*>([\s\S]*?)<\/think\s*>/gi;
  const openTagRe = /<think\b[^>]*>/gi;

  // 1) Collect closed-block reasoning.
  const thinkingParts: string[] = [];
  blockRe.lastIndex = 0;
  for (let m = blockRe.exec(input); m !== null; m = blockRe.exec(input)) {
    const inner = m[1]?.trim();
    if (inner) thinkingParts.push(inner);
  }

  // 2) Detect an unterminated `<think` at the tail (mid-stream).
  const opens = [...input.matchAll(openTagRe)];
  const closes = [...input.matchAll(/<\/think\s*>/gi)];
  const thinkingOpen = opens.length > closes.length;
  if (thinkingOpen) {
    // Take the suffix after the LAST unclosed `<think...>` tag.
    const lastOpen = opens[opens.length - 1];
    const openEnd = input.indexOf(">", lastOpen.index ?? 0) + 1;
    const tail = input.slice(openEnd).trim();
    if (tail) thinkingParts.push(`…${tail}`);
  }

  // 3) Build the answer: strip every `<think...>...</think>` and any
  //    trailing unclosed `<think...>tail`.
  const closedBlocksReplaced = input.replace(blockRe, "");
  let answer = closedBlocksReplaced;
  if (thinkingOpen && opens.length > 0) {
    const lastOpen = opens[opens.length - 1];
    answer = answer.slice(0, lastOpen.index ?? 0);
  }

  const thinking = thinkingParts.length > 0 ? thinkingParts.join("\n\n") : null;
  return { thinking, thinkingOpen, answer: answer.trim() };
}
