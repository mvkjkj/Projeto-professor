const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const SECRET = process.env.JWT_SECRET || 'DEV_ONLY_troque_esta_chave_antes_de_publicar_EPT_TASKS_2026';
const dbPath = path.join(__dirname, '..', 'database.db');

if (SECRET.startsWith('DEV_ONLY') && process.env.NODE_ENV === 'production') {
  console.error('Defina JWT_SECRET com uma chave forte nas variáveis de ambiente.');
  process.exit(1);
}

app.disable('x-powered-by');
app.use(cors({ origin: (origin, callback) => {
  // Live Server e aplicações locais. Em produção, configure a origem exata.
  const allowed = !origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) || (process.env.FRONTEND_ORIGIN && origin === process.env.FRONTEND_ORIGIN);
  callback(allowed ? null : new Error('Origem não autorizada.'), allowed);
} }));
app.use(express.json({ limit: '20kb' }));

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('Erro ao abrir banco:', err.message);
  else console.log(`Banco conectado: ${dbPath}`);
});
db.run('PRAGMA foreign_keys = ON');

function run(sql, params = []) { return new Promise((resolve, reject) => db.run(sql, params, function (err) { if (err) reject(err); else resolve({ id: this.lastID, changes: this.changes }); })); }
function get(sql, params = []) { return new Promise((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row))); }
function all(sql, params = []) { return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows))); }

async function initDatabase() {
  await run(`CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL, senha TEXT NOT NULL, tipo TEXT NOT NULL
  )`);
  await run(`CREATE TABLE IF NOT EXISTS atividades (
    id INTEGER PRIMARY KEY AUTOINCREMENT, aluno TEXT NOT NULL,
    atividade TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Pendente',
    professor_id INTEGER, FOREIGN KEY(professor_id) REFERENCES usuarios(id)
  )`);
  const columns = await all('PRAGMA table_info(atividades)');
  const names = columns.map(c => c.name);
  if (!names.includes('aluno_id')) await run('ALTER TABLE atividades ADD COLUMN aluno_id INTEGER REFERENCES usuarios(id)');
  if (!names.includes('descricao')) await run('ALTER TABLE atividades ADD COLUMN descricao TEXT');
  if (!names.includes('prazo')) await run('ALTER TABLE atividades ADD COLUMN prazo TEXT');
  if (!names.includes('criada_em')) await run('ALTER TABLE atividades ADD COLUMN criada_em TEXT');
  await run("UPDATE atividades SET status = 'Pendente' WHERE lower(status) IN ('pendente','pending')");
  await run("UPDATE atividades SET status = 'Concluída' WHERE lower(status) IN ('concluída','concluida','concluido','completed')");
}

function autenticar(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ erro: 'Faça login para continuar.' });
  try { req.usuario = jwt.verify(token, SECRET); next(); }
  catch { return res.status(401).json({ erro: 'Sessão expirada ou inválida. Entre novamente.' }); }
}
function exigirTipo(tipo) { return (req, res, next) => req.usuario?.tipo === tipo ? next() : res.status(403).json({ erro: 'Você não tem permissão para acessar esta função.' }); }
const emailValido = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

app.get('/api/health', (req, res) => res.json({ status: 'ok', sistema: 'EPT TASKS' }));
app.get('/', (req, res) => res.json({ mensagem: 'API EPT TASKS funcionando.' }));

app.post('/cadastro', async (req, res) => {
  try {
    const nome = String(req.body.nome || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const senha = String(req.body.senha || '');
    const tipo = String(req.body.tipo || '').trim().toLowerCase();
    if (!nome || nome.length < 3 || nome.length > 100) return res.status(400).json({ erro: 'Informe um nome entre 3 e 100 caracteres.' });
    if (!emailValido(email)) return res.status(400).json({ erro: 'Informe um e-mail válido.' });
    if (senha.length < 8) return res.status(400).json({ erro: 'A senha precisa ter pelo menos 8 caracteres.' });
    if (!['professor', 'aluno'].includes(tipo)) return res.status(400).json({ erro: 'Selecione um perfil válido.' });
    const hash = await bcrypt.hash(senha, 12);
    await run('INSERT INTO usuarios (nome,email,senha,tipo) VALUES (?,?,?,?)', [nome, email, hash, tipo]);
    return res.status(201).json({ mensagem: 'Conta criada com sucesso.' });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ erro: 'Este e-mail já está cadastrado.' });
    console.error(err); return res.status(500).json({ erro: 'Não foi possível criar a conta.' });
  }
});

app.post('/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const senha = String(req.body.senha || '');
    if (!email || !senha) return res.status(400).json({ erro: 'Informe e-mail e senha.' });
    const usuario = await get('SELECT id,nome,email,senha,tipo FROM usuarios WHERE email = ?', [email]);
    if (!usuario || !(await bcrypt.compare(senha, usuario.senha))) return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
    const token = jwt.sign({ id: usuario.id, nome: usuario.nome, email: usuario.email, tipo: usuario.tipo }, SECRET, { expiresIn: '8h' });
    return res.json({ mensagem: 'Login realizado.', token, nome: usuario.nome, tipo: usuario.tipo });
  } catch (err) { console.error(err); return res.status(500).json({ erro: 'Erro ao realizar login.' }); }
});

app.get('/perfil', autenticar, async (req, res) => {
  const usuario = await get('SELECT id,nome,email,tipo FROM usuarios WHERE id = ?', [req.usuario.id]);
  if (!usuario) return res.status(404).json({ erro: 'Conta não encontrada.' });
  res.json({ usuario });
});

// O professor atribui a atividade ao e-mail de uma conta de aluno existente.
app.post('/atividades', autenticar, exigirTipo('professor'), async (req, res) => {
  try {
    const alunoEmail = String(req.body.alunoEmail || '').trim().toLowerCase();
    const atividade = String(req.body.atividade || '').trim();
    const descricao = String(req.body.descricao || '').trim();
    const prazo = String(req.body.prazo || '').trim();
    if (!emailValido(alunoEmail)) return res.status(400).json({ erro: 'Informe o e-mail cadastrado do aluno.' });
    if (atividade.length < 3 || atividade.length > 140) return res.status(400).json({ erro: 'O título deve ter entre 3 e 140 caracteres.' });
    if (descricao.length > 2000) return res.status(400).json({ erro: 'A descrição pode ter no máximo 2.000 caracteres.' });
    if (prazo && !/^\d{4}-\d{2}-\d{2}$/.test(prazo)) return res.status(400).json({ erro: 'Informe um prazo válido.' });
    const aluno = await get("SELECT id,nome FROM usuarios WHERE email = ? AND tipo = 'aluno'", [alunoEmail]);
    if (!aluno) return res.status(404).json({ erro: 'Não encontramos um aluno cadastrado com esse e-mail.' });
    const result = await run(`INSERT INTO atividades (aluno,atividade,status,professor_id,aluno_id,descricao,prazo,criada_em)
      VALUES (?,?, 'Pendente', ?,?,?,?,datetime('now'))`, [aluno.nome, atividade, req.usuario.id, aluno.id, descricao, prazo || null]);
    res.status(201).json({ mensagem: 'Atividade atribuída ao aluno.', id: result.id });
  } catch (err) { console.error(err); res.status(500).json({ erro: 'Erro ao cadastrar atividade.' }); }
});

app.get('/atividades', autenticar, exigirTipo('professor'), async (req, res) => {
  try {
    const rows = await all(`SELECT a.id,a.aluno,a.atividade,a.status,a.descricao,a.prazo,a.criada_em,u.email AS aluno_email
      FROM atividades a LEFT JOIN usuarios u ON u.id = a.aluno_id
      WHERE a.professor_id = ? ORDER BY a.id DESC`, [req.usuario.id]);
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ erro: 'Erro ao carregar atividades.' }); }
});

app.get('/minhas-atividades', autenticar, exigirTipo('aluno'), async (req, res) => {
  try {
    const rows = await all(`SELECT a.id,a.aluno,a.atividade,a.status,a.descricao,a.prazo,a.criada_em,u.nome AS professor
      FROM atividades a LEFT JOIN usuarios u ON u.id = a.professor_id
      WHERE a.aluno_id = ? ORDER BY CASE WHEN a.status = 'Pendente' THEN 0 ELSE 1 END, a.id DESC`, [req.usuario.id]);
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ erro: 'Erro ao carregar suas atividades.' }); }
});

app.patch('/atividades/:id/concluir', autenticar, exigirTipo('aluno'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ erro: 'Atividade inválida.' });
    const result = await run("UPDATE atividades SET status = 'Concluída' WHERE id = ? AND aluno_id = ? AND status = 'Pendente'", [id, req.usuario.id]);
    if (!result.changes) return res.status(404).json({ erro: 'Atividade não encontrada ou já concluída.' });
    res.json({ mensagem: 'Atividade marcada como concluída.' });
  } catch (err) { console.error(err); res.status(500).json({ erro: 'Não foi possível atualizar a atividade.' }); }
});

app.delete('/atividades/:id', autenticar, exigirTipo('professor'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ erro: 'Atividade inválida.' });
    const result = await run('DELETE FROM atividades WHERE id = ? AND professor_id = ?', [id, req.usuario.id]);
    if (!result.changes) return res.status(404).json({ erro: 'Atividade não encontrada.' });
    res.json({ mensagem: 'Atividade excluída.' });
  } catch (err) { console.error(err); res.status(500).json({ erro: 'Erro ao excluir atividade.' }); }
});

initDatabase().then(() => app.listen(PORT, () => console.log(`EPT TASKS API em http://localhost:${PORT}`)))
  .catch(err => { console.error('Falha ao preparar banco:', err); process.exit(1); });
