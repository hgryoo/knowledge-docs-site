/**
 * Rewrite ```mermaid fenced blocks from the standard rehype output
 *   <pre><code class="language-mermaid">…</code></pre>
 * into the marker the client-side mermaid.js looks for:
 *   <pre class="mermaid">…</pre>
 *
 * Zero deps. The full `rehype-mermaid` package would do this for us but
 * its transitive `mermaid-isomorphic` always pulls in playwright (even
 * for the pre-mermaid strategy that doesn't actually need it).
 */
export default function rehypeMermaidPre() {
  return (tree) => walk(tree);
}

function walk(node) {
  if (!node) return;
  if (
    node.type === 'element' &&
    node.tagName === 'pre' &&
    Array.isArray(node.children)
  ) {
    const code = node.children.find(
      (c) => c.type === 'element' && c.tagName === 'code',
    );
    const classList = code?.properties?.className;
    if (code && Array.isArray(classList) && classList.includes('language-mermaid')) {
      const text = (code.children || [])
        .map((c) => (c.type === 'text' ? c.value : ''))
        .join('');
      node.properties = { className: ['mermaid'] };
      node.children = [{ type: 'text', value: text }];
      return;
    }
  }
  if (Array.isArray(node.children)) {
    for (const child of node.children) walk(child);
  }
}
