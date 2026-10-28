// Split migration statements without splitting trigger bodies or quoted policy text.
export function sqlStatements(sql: string) {
  const statements: string[] = [];
  let start = 0,
    depth = 0,
    quote = '',
    comment = false,
    word = '';
  const finishWord = () => {
    const key = word.toUpperCase();
    if (key === 'BEGIN' || key === 'CASE') depth++;
    else if (key === 'END') depth--;
    word = '';
  };
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i]!,
      next = sql[i + 1];
    if (comment) {
      if (c === '\n') comment = false;
      continue;
    }
    if (quote) {
      if (c === quote) {
        if (next === quote) i++;
        else quote = '';
      }
      continue;
    }
    if (c === '-' && next === '-') {
      finishWord();
      comment = true;
      i++;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      finishWord();
      quote = c;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      word += c;
      continue;
    }
    finishWord();
    if (c === ';' && depth === 0) {
      const statement = sql.slice(start, i + 1).trim();
      if (statement) statements.push(statement);
      start = i + 1;
    }
  }
  const tail = sql.slice(start).trim();
  if (tail) statements.push(tail);
  return statements;
}
