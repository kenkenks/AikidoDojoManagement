// Nodeローカル検証用。文字列中の括弧に依存せず、実ソースの宣言を抽出する。
import vm from "node:vm";
const box = { exports: {}, module: {} };
vm.runInNewContext(process.binding("natives")["internal/deps/acorn/acorn/dist/acorn"], box);
export function declaration(html, name) {
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
  for (const source of scripts) {
    const ast = box.exports.parse(source, { ecmaVersion: "latest" });
    for (const node of ast.body) {
      if (node.type === "FunctionDeclaration" && node.id.name === name) return source.slice(node.start, node.end);
      if (node.type === "VariableDeclaration" && node.declarations.some(d => d.id.name === name)) return source.slice(node.start, node.end);
    }
  }
  throw new Error(`Source declaration not found: ${name}`);
}
