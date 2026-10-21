// D1 de mentira para os testes: a mesma interface que o Worker usa (prepare/bind/first/all/run/batch),
// rodando as migrações de verdade num SQLite em memória (node:sqlite, Node 22+).
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';

export function criarD1(pastaMigracoes) {
  const banco = new DatabaseSync(':memory:');
  banco.exec('PRAGMA foreign_keys = ON'); // como no D1
  readdirSync(pastaMigracoes).filter((f) => f.endsWith('.sql')).sort()
    .forEach((f) => banco.exec(readFileSync(new URL(f, pastaMigracoes), 'utf8')));

  function comando(sql, valores) {
    const exec = () => banco.prepare(sql);
    return {
      bind: (...v) => comando(sql, v),
      first: async () => exec().get(...(valores || [])) ?? null,
      all: async () => ({ results: exec().all(...(valores || [])), success: true }),
      run: async () => { const r = exec().run(...(valores || [])); return { success: true, meta: { changes: Number(r.changes) } }; },
      _rodar: () => { const r = exec().run(...(valores || [])); return { success: true, meta: { changes: Number(r.changes) } }; }
    };
  }
  return {
    banco,
    prepare: (sql) => comando(sql, []),
    // batch do D1 é uma transação: tudo ou nada
    batch: async (lista) => {
      banco.exec('BEGIN');
      try { const r = lista.map((c) => c._rodar()); banco.exec('COMMIT'); return r; }
      catch (e) { banco.exec('ROLLBACK'); throw e; }
    }
  };
}
