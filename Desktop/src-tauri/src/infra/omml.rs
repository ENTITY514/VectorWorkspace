//! Формулы: LaTeX (`$…$` в тексте КСП) ↔ OMML.
//!
//! `latex_to_omml` возвращает фрагмент `<m:oMath>…</m:oMath>` с префиксом `m:`;
//! пространство имён объявляет корень документа. Поддерживается ограниченное
//! LaTeX-подмножество (design §1), всё остальное — ошибка разбора.
//! `omml_to_latex` — обратное преобразование при чтении docx; неизвестные
//! узлы превращаются в текст узлов.

use crate::infra::xml_tree::{build_tree, XNode};

/// Часть строки: обычный текст или формула (содержимое между `$`, без них).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Segment {
    Text(String),
    Math(String),
}

/// Закрывающая `$` (или `$$`, если `double`) с учётом экранирования `\$`.
fn find_dollar_close(chars: &[char], from: usize, double: bool) -> Option<usize> {
    let mut j = from;
    while j < chars.len() {
        if chars[j] == '\\' && j + 1 < chars.len() {
            j += 2;
            continue;
        }
        if chars[j] == '$' && (!double || (j + 1 < chars.len() && chars[j + 1] == '$')) {
            return Some(j);
        }
        j += 1;
    }
    None
}

/// Делит строку на текст и формулы. `\$` — литеральный доллар,
/// незакрытый `$` остаётся обычным текстом. `$$…$$` тоже формула:
/// сначала ищется закрывающий `$$`, затем одиночный `$`.
pub fn split_math(text: &str) -> Vec<Segment> {
    let chars: Vec<char> = text.chars().collect();
    let mut segs = Vec::new();
    let mut buf = String::new();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '\\' && i + 1 < chars.len() {
            if chars[i + 1] == '$' {
                buf.push('$');
            } else {
                buf.push(chars[i]);
                buf.push(chars[i + 1]);
            }
            i += 2;
            continue;
        }
        if chars[i] == '$' {
            let double = i + 1 < chars.len() && chars[i + 1] == '$';
            let body = i + if double { 2 } else { 1 };
            match find_dollar_close(&chars, body, double) {
                Some(end) => {
                    if !buf.is_empty() {
                        segs.push(Segment::Text(std::mem::take(&mut buf)));
                    }
                    let formula: String = chars[body..end].iter().collect();
                    if !formula.is_empty() {
                        segs.push(Segment::Math(formula));
                    }
                    i = end + if double { 2 } else { 1 };
                }
                // незакрытый `$`/`$$` — обычный текст
                None => {
                    if double {
                        buf.push_str("$$");
                        i += 2;
                    } else {
                        buf.push('$');
                        i += 1;
                    }
                }
            }
            continue;
        }
        buf.push(chars[i]);
        i += 1;
    }
    if !buf.is_empty() {
        segs.push(Segment::Text(buf));
    }
    segs
}

// ---------------------------------------------------------------------------
// AST разобранной формулы
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
enum Node {
    /// Простые символы (шрифт math-курсивом по умолчанию).
    Sym(String),
    /// Прямой шрифт: `\text{}`, имена функций.
    Plain(String),
    Frac {
        num: Vec<Node>,
        den: Vec<Node>,
        no_bar: bool,
    },
    Sqrt {
        deg: Option<Vec<Node>>,
        body: Vec<Node>,
    },
    Sub {
        base: Vec<Node>,
        sub: Vec<Node>,
    },
    Sup {
        base: Vec<Node>,
        sup: Vec<Node>,
    },
    SubSup {
        base: Vec<Node>,
        sub: Vec<Node>,
        sup: Vec<Node>,
    },
    /// Скобки `\left…\right` и `\binom`.
    Delim {
        beg: String,
        end: String,
        body: Vec<Node>,
    },
    /// Системы `\begin{cases}`, `\begin{aligned}`.
    EqArr(Vec<Vec<Node>>),
    /// `\begin{matrix}`: строки ячеек.
    Matrix(Vec<Vec<Vec<Node>>>),
    Acc {
        chr: char,
        body: Vec<Node>,
    },
    Bar {
        body: Vec<Node>,
    },
    /// `\underbrace{…}`: подстрочный знак под группой.
    GroupChr {
        body: Vec<Node>,
    },
}

// ---------------------------------------------------------------------------
// Токенизатор
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq)]
enum Tok {
    Char(char),
    /// Команда без бэкслэша; для `\{` — строка "{".
    Cmd(String),
    LBrace,
    RBrace,
    Amp,
    /// `\\`
    NewLine,
    Underscore,
    Caret,
    /// Пробельный символ (вне `\text` игнорируется).
    Space,
}

fn tokenize(src: &str) -> Result<Vec<Tok>, String> {
    let chars: Vec<char> = src.chars().collect();
    let mut out = Vec::new();
    let mut i = 0;
    while i < chars.len() {
        match chars[i] {
            '\\' => {
                i += 1;
                let next = *chars
                    .get(i)
                    .ok_or_else(|| "формула заканчивается одиноким \\".to_string())?;
                if next == '\\' {
                    out.push(Tok::NewLine);
                    i += 1;
                } else if next.is_ascii_alphabetic() {
                    let start = i;
                    while i < chars.len() && chars[i].is_ascii_alphabetic() {
                        i += 1;
                    }
                    out.push(Tok::Cmd(chars[start..i].iter().collect()));
                    // пробел после буквенной команды — разделитель, как в LaTeX
                    while i < chars.len() && chars[i].is_whitespace() {
                        i += 1;
                    }
                } else {
                    out.push(Tok::Cmd(next.to_string()));
                    i += 1;
                }
            }
            '{' => {
                out.push(Tok::LBrace);
                i += 1;
            }
            '}' => {
                out.push(Tok::RBrace);
                i += 1;
            }
            '&' => {
                out.push(Tok::Amp);
                i += 1;
            }
            '_' => {
                out.push(Tok::Underscore);
                i += 1;
            }
            '^' => {
                out.push(Tok::Caret);
                i += 1;
            }
            c if c.is_whitespace() => {
                out.push(Tok::Space);
                i += 1;
            }
            c => {
                out.push(Tok::Char(c));
                i += 1;
            }
        }
    }
    Ok(out)
}

// ---------------------------------------------------------------------------
// Карта команд
// ---------------------------------------------------------------------------

fn symbol_cmd(name: &str) -> Option<char> {
    Some(match name {
        "cdot" => '·',
        "times" => '×',
        "div" => '÷',
        "pm" => '±',
        "mp" => '∓',
        "le" | "leq" | "leqslant" => '≤',
        "ge" | "geq" | "geqslant" => '≥',
        "ne" | "neq" => '≠',
        "approx" => '≈',
        "equiv" => '≡',
        "sim" => '∼',
        "pi" => 'π',
        "alpha" => 'α',
        "beta" => 'β',
        "gamma" => 'γ',
        "lambda" => 'λ',
        "psi" => 'ψ',
        "tau" => 'τ',
        "epsilon" => 'ε',
        "iota" => 'ι',
        "chi" => 'χ',
        "Pi" => 'Π',
        "Sigma" => 'Σ',
        "sum" => '∑',
        "varphi" | "phi" => 'φ',
        "Delta" => 'Δ',
        "angle" => '∠',
        "triangle" => '△',
        "blacksquare" => '■',
        "blacktriangle" => '▲',
        "circ" => '°',
        "dots" | "ldots" => '…',
        "cdots" => '⋯',
        "uparrow" => '↑',
        "downarrow" => '↓',
        "nearrow" => '↗',
        "searrow" => '↘',
        "infty" => '∞',
        "in" => '∈',
        "notin" => '∉',
        "cup" => '∪',
        "cap" => '∩',
        "emptyset" | "varnothing" => '∅',
        "subset" => '⊂',
        "subseteq" => '⊆',
        "forall" => '∀',
        "exists" => '∃',
        "parallel" => '∥',
        "nparallel" => '∦',
        "perp" => '⊥',
        "smile" => '⌣',
        "Rightarrow" | "implies" => '⇒',
        "Leftrightarrow" => '⇔',
        "to" => '→',
        "%" => '%',
        "," => ' ',
        " " => ' ',
        "{" => '{',
        "}" => '}',
        _ => return None,
    })
}

fn function_cmd(name: &str) -> bool {
    matches!(
        name,
        "sin" | "cos" | "tg" | "ctg" | "arcsin" | "arccos" | "arctg" | "arcctg" | "log"
            | "lg" | "ln" | "max" | "min"
    )
}

fn blackboard_char(c: char) -> Option<char> {
    Some(match c {
        'R' => 'ℝ',
        'N' => 'ℕ',
        'Z' => 'ℤ',
        'Q' => 'ℚ',
        _ => return None,
    })
}

/// Обычный символ внутри формулы (буквы, цифры, знаки из таблицы design §1).
fn plain_char_ok(c: char) -> bool {
    c.is_alphanumeric() || "+-=<>()[],.;:!'/|".contains(c)
}

fn delim_from_tok(t: &Tok) -> Option<String> {
    match t {
        Tok::Char(c @ ('(' | ')' | '[' | ']' | '|')) => Some(c.to_string()),
        Tok::Cmd(s) if s == "{" || s == "}" => Some(s.clone()),
        _ => None,
    }
}

// ---------------------------------------------------------------------------
// Рекурсивный спуск по токенам
// ---------------------------------------------------------------------------

/// Контекст разбора: где останавливается последовательность.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Ctx {
    Top,
    Group,
    /// Строка внутри `\begin{cases}`.
    Env,
    /// Между `\left` и `\right`.
    Delim,
}

struct Parser {
    toks: Vec<Tok>,
    pos: usize,
}

impl Parser {
    fn peek(&self) -> Option<&Tok> {
        self.toks.get(self.pos)
    }

    fn bump(&mut self) -> Option<Tok> {
        let t = self.toks.get(self.pos).cloned();
        if t.is_some() {
            self.pos += 1;
        }
        t
    }

    /// Пробелы в формуле игнорируются (вне `\text`).
    fn skip_spaces(&mut self) {
        while matches!(self.peek(), Some(Tok::Space)) {
            self.pos += 1;
        }
    }

    /// Последовательность узлов; стоп-токены остаются нетронутыми.
    fn parse_seq(&mut self, ctx: Ctx) -> Result<Vec<Node>, String> {
        let mut nodes = Vec::new();
        loop {
            self.skip_spaces();
            let stop = match self.peek() {
                None => true,
                Some(Tok::RBrace) => ctx == Ctx::Group,
                Some(Tok::Amp) | Some(Tok::NewLine) => ctx == Ctx::Env,
                Some(Tok::Cmd(c)) if c == "end" => ctx == Ctx::Env,
                Some(Tok::Cmd(c)) if c == "right" => ctx == Ctx::Delim,
                _ => false,
            };
            if stop {
                break;
            }
            let mut part = self.parse_atom_scripts()?;
            nodes.append(&mut part);
        }
        Ok(nodes)
    }

    /// Атом + необязательные `_`/`^`; база скриптов — весь атом.
    fn parse_atom_scripts(&mut self) -> Result<Vec<Node>, String> {
        let mut nodes = self.parse_atom()?;
        let mut sub = None;
        let mut sup = None;
        self.skip_spaces();
        if matches!(self.peek(), Some(Tok::Underscore)) {
            self.bump();
            sub = Some(self.parse_script_arg()?);
            self.skip_spaces();
            if matches!(self.peek(), Some(Tok::Caret)) {
                self.bump();
                sup = Some(self.parse_script_arg()?);
            }
        } else if matches!(self.peek(), Some(Tok::Caret)) {
            self.bump();
            sup = Some(self.parse_script_arg()?);
            self.skip_spaces();
            if matches!(self.peek(), Some(Tok::Underscore)) {
                self.bump();
                sub = Some(self.parse_script_arg()?);
            }
        }
        if sub.is_some() || sup.is_some() {
            let base = nodes;
            nodes = vec![match (sub, sup) {
                (Some(s), Some(p)) => Node::SubSup {
                    base,
                    sub: s,
                    sup: p,
                },
                (Some(s), None) => Node::Sub { base, sub: s },
                (None, Some(p)) => Node::Sup { base, sup: p },
                (None, None) => unreachable!(),
            }];
        }
        Ok(nodes)
    }

    /// Аргумент после `_`/`^`: группа, символ или команда с аргументами.
    fn parse_script_arg(&mut self) -> Result<Vec<Node>, String> {
        self.skip_spaces();
        match self.peek() {
            Some(Tok::LBrace) => self.parse_group_arg(),
            Some(Tok::Char(c)) if plain_char_ok(*c) => {
                let c = *c;
                self.bump();
                Ok(vec![Node::Sym(c.to_string())])
            }
            Some(Tok::Cmd(name)) if name != "left" && name != "begin" => {
                let name = name.clone();
                self.bump();
                self.parse_cmd(&name)
            }
            _ => Err("после _ или ^ ожидался аргумент".into()),
        }
    }

    fn parse_atom(&mut self) -> Result<Vec<Node>, String> {
        match self.bump() {
            Some(Tok::LBrace) => {
                let inner = self.parse_seq(Ctx::Group)?;
                if !matches!(self.bump(), Some(Tok::RBrace)) {
                    return Err("не закрыта группа {".into());
                }
                Ok(inner)
            }
            Some(Tok::Char(c)) => {
                if !plain_char_ok(c) {
                    return Err(format!("недопустимый символ «{c}» в формуле"));
                }
                Ok(vec![Node::Sym(c.to_string())])
            }
            Some(Tok::Cmd(name)) => self.parse_cmd(&name),
            Some(Tok::RBrace) => Err("неожиданная }".into()),
            Some(Tok::Amp) => Err("неожиданный &".into()),
            Some(Tok::NewLine) => Err("неожиданное \\\\".into()),
            Some(Tok::Underscore) => Err("лишний _".into()),
            Some(Tok::Caret) => Err("лишний ^".into()),
            Some(Tok::Space) => Err("неожиданный пробел".into()),
            None => Err("формула неожиданно закончилась".into()),
        }
    }

    fn parse_group_arg(&mut self) -> Result<Vec<Node>, String> {
        self.skip_spaces();
        if !matches!(self.bump(), Some(Tok::LBrace)) {
            return Err("ожидалась группа {…}".into());
        }
        let inner = self.parse_seq(Ctx::Group)?;
        if !matches!(self.bump(), Some(Tok::RBrace)) {
            return Err("не закрыта группа {".into());
        }
        Ok(inner)
    }

    /// `\sqrt[…]` — степень radикала до `]`.
    fn parse_bracket_arg(&mut self) -> Result<Vec<Node>, String> {
        let mut nodes = Vec::new();
        loop {
            self.skip_spaces();
            match self.peek() {
                Some(Tok::Char(']')) => {
                    self.bump();
                    break;
                }
                None => return Err("не закрыта [ у \\sqrt".into()),
                _ => {
                    let mut part = self.parse_atom_scripts()?;
                    nodes.append(&mut part);
                }
            }
        }
        Ok(nodes)
    }

    fn parse_text_arg(&mut self) -> Result<String, String> {
        self.skip_spaces();
        if !matches!(self.bump(), Some(Tok::LBrace)) {
            return Err("\\text требует {…}".into());
        }
        let mut s = String::new();
        loop {
            match self.bump() {
                Some(Tok::RBrace) => break,
                Some(Tok::Space) => s.push(' '),
                Some(Tok::Char(c)) => s.push(c),
                Some(Tok::Amp) => s.push('&'),
                Some(Tok::Cmd(n)) if n.len() == 1 => s.push_str(&n),
                Some(Tok::Cmd(other)) => {
                    s.push('\\');
                    s.push_str(&other);
                }
                None => return Err("не закрыта группа в \\text".into()),
                _ => return Err("недопустимый символ в \\text".into()),
            }
        }
        Ok(s)
    }

    /// Имя окружения в `{…}` после `\begin` / `\end`.
    fn parse_env_name(&mut self) -> Result<String, String> {
        self.skip_spaces();
        if !matches!(self.bump(), Some(Tok::LBrace)) {
            return Err("после \\begin/\\end ожидается {имя}".into());
        }
        let mut name = String::new();
        loop {
            match self.bump() {
                Some(Tok::Char(c)) => name.push(c),
                Some(Tok::RBrace) => break,
                None => return Err("не закрыто имя окружения".into()),
                _ => return Err("некорректное имя окружения".into()),
            }
        }
        Ok(name)
    }

    /// Группа `{…}` как есть (для `\operatorname`, `\tag`).
    fn parse_raw_arg(&mut self, cmd: &str) -> Result<String, String> {
        self.skip_spaces();
        if !matches!(self.bump(), Some(Tok::LBrace)) {
            return Err(format!("\\{cmd} требует {{…}}"));
        }
        let mut s = String::new();
        loop {
            match self.bump() {
                Some(Tok::RBrace) => break,
                Some(Tok::Char(c)) => s.push(c),
                Some(Tok::Space) => s.push(' '),
                Some(Tok::Cmd(n)) => match symbol_cmd(&n) {
                    Some(c) => s.push(c),
                    None => {
                        s.push('\\');
                        s.push_str(&n);
                    }
                },
                None => return Err(format!("не закрыта группа у \\{cmd}")),
                _ => return Err(format!("недопустимый символ в аргументе \\{cmd}")),
            }
        }
        Ok(s)
    }

    /// `\not\in` → ∉, `\not\parallel` → ∦, `\not=` → ≠,
    /// иначе следующий символ + U+0338.
    fn parse_not(&mut self) -> Result<Vec<Node>, String> {
        self.skip_spaces();
        let sym = match self.bump() {
            Some(Tok::Cmd(name)) => match name.as_str() {
                "in" => return Ok(vec![Node::Sym("∉".into())]),
                "parallel" => return Ok(vec![Node::Sym("∦".into())]),
                other => symbol_cmd(other)
                    .map(|c| c.to_string())
                    .ok_or_else(|| format!("после \\not неизвестная команда \\{other}"))?,
            },
            Some(Tok::Char(c)) if plain_char_ok(c) => {
                if c == '=' {
                    return Ok(vec![Node::Sym("≠".into())]);
                }
                c.to_string()
            }
            _ => return Err("после \\not ожидается символ".into()),
        };
        Ok(vec![Node::Sym(format!("{sym}\u{338}"))])
    }

    /// Строки `\begin{cases}` / `\begin{aligned}`: `&` игнорируется,
    /// `\\` — новая строка, до `\end`.
    fn parse_env_rows(&mut self, env: &str) -> Result<Vec<Vec<Node>>, String> {
        Ok(self
            .parse_matrix(env)?
            .into_iter()
            .map(|cells| cells.into_iter().flatten().collect())
            .collect())
    }

    /// Строки и ячейки `\begin{matrix}`: ячейки через `&`, строки через `\\`.
    fn parse_matrix(&mut self, env: &str) -> Result<Vec<Vec<Vec<Node>>>, String> {
        let mut rows: Vec<Vec<Vec<Node>>> = Vec::new();
        let mut row: Vec<Vec<Node>> = Vec::new();
        let mut cell: Vec<Node> = Vec::new();
        loop {
            let mut part = self.parse_seq(Ctx::Env)?;
            cell.append(&mut part);
            match self.bump() {
                Some(Tok::Amp) => row.push(std::mem::take(&mut cell)),
                Some(Tok::NewLine) => {
                    row.push(std::mem::take(&mut cell));
                    rows.push(std::mem::take(&mut row));
                }
                Some(Tok::Cmd(c)) if c == "end" => break,
                Some(t) => return Err(format!("неожиданный токен в {env}: {t:?}")),
                None => return Err(format!("не закрыт \\begin{{{env}}}")),
            }
        }
        let name = self.parse_env_name()?;
        if name != env {
            return Err(format!("\\end{{{name}}} не соответствует \\begin{{{env}}}"));
        }
        if !cell.is_empty() {
            row.push(cell);
        }
        if !row.is_empty() {
            rows.push(row);
        }
        Ok(rows)
    }

    fn parse_cmd(&mut self, name: &str) -> Result<Vec<Node>, String> {
        if let Some(sym) = symbol_cmd(name) {
            return Ok(vec![Node::Sym(sym.to_string())]);
        }
        if function_cmd(name) {
            return Ok(vec![Node::Plain(name.to_string())]);
        }
        match name {
            "frac" | "dfrac" => {
                let num = self.parse_group_arg()?;
                let den = self.parse_group_arg()?;
                Ok(vec![Node::Frac {
                    num,
                    den,
                    no_bar: false,
                }])
            }
            "binom" => {
                let num = self.parse_group_arg()?;
                let den = self.parse_group_arg()?;
                Ok(vec![Node::Delim {
                    beg: "(".into(),
                    end: ")".into(),
                    body: vec![Node::Frac {
                        num,
                        den,
                        no_bar: true,
                    }],
                }])
            }
            "sqrt" => {
                self.skip_spaces();
                let deg = if matches!(self.peek(), Some(Tok::Char('['))) {
                    self.bump();
                    Some(self.parse_bracket_arg()?)
                } else {
                    None
                };
                let body = self.parse_group_arg()?;
                Ok(vec![Node::Sqrt { deg, body }])
            }
            "text" => Ok(vec![Node::Plain(self.parse_text_arg()?)]),
            "vec" | "overrightarrow" => Ok(vec![Node::Acc {
                chr: '⃗',
                body: self.parse_group_arg()?,
            }]),
            "widehat" | "hat" => Ok(vec![Node::Acc {
                chr: '\u{302}',
                body: self.parse_group_arg()?,
            }]),
            "breve" => Ok(vec![Node::Acc {
                chr: '\u{306}',
                body: self.parse_group_arg()?,
            }]),
            "tilde" | "widetilde" => Ok(vec![Node::Acc {
                chr: '\u{303}',
                body: self.parse_group_arg()?,
            }]),
            "overline" => Ok(vec![Node::Bar {
                body: self.parse_group_arg()?,
            }]),
            "underbrace" => Ok(vec![Node::GroupChr {
                body: self.parse_group_arg()?,
            }]),
            "quad" => Ok(vec![Node::Sym("  ".into())]),
            "qquad" => Ok(vec![Node::Sym("    ".into())]),
            "operatorname" => {
                let s = self.parse_raw_arg("operatorname")?;
                let name = s.trim();
                if name.is_empty() {
                    return Err("\\operatorname с пустым именем".into());
                }
                Ok(vec![Node::Plain(name.to_string())])
            }
            "mathbin" => self.parse_group_arg(),
            "phantom" => {
                self.parse_group_arg()?;
                Ok(vec![])
            }
            "tag" => {
                let s = self.parse_raw_arg("tag")?;
                Ok(vec![Node::Plain(format!("({s})"))])
            }
            "eqno" => {
                self.skip_spaces();
                let s = match self.peek() {
                    Some(Tok::LBrace) => self.parse_raw_arg("eqno")?,
                    Some(Tok::Char(c)) if plain_char_ok(*c) => {
                        let c = *c;
                        self.bump();
                        c.to_string()
                    }
                    _ => return Err("\\eqno ожидает {N} или N".into()),
                };
                Ok(vec![Node::Plain(format!("({s})"))])
            }
            "not" => self.parse_not(),
            "mathbb" => {
                let g = self.parse_group_arg()?;
                if let [Node::Sym(s)] = g.as_slice() {
                    let mut it = s.chars();
                    if let (Some(c), None) = (it.next(), it.next()) {
                        if let Some(b) = blackboard_char(c) {
                            return Ok(vec![Node::Sym(b.to_string())]);
                        }
                    }
                }
                Err("\\mathbb поддерживает только R, N, Z, Q".into())
            }
            "left" => {
                self.skip_spaces();
                let t = self
                    .bump()
                    .ok_or_else(|| "после \\left ожидается скобка".to_string())?;
                let beg =
                    delim_from_tok(&t).ok_or_else(|| "после \\left ожидается скобка".to_string())?;
                let body = self.parse_seq(Ctx::Delim)?;
                match self.bump() {
                    Some(Tok::Cmd(c)) if c == "right" => {}
                    _ => return Err("не закрыт \\left … \\right".into()),
                }
                self.skip_spaces();
                let t = self
                    .bump()
                    .ok_or_else(|| "после \\right ожидается скобка".to_string())?;
                let end =
                    delim_from_tok(&t).ok_or_else(|| "после \\right ожидается скобка".to_string())?;
                Ok(vec![Node::Delim { beg, end, body }])
            }
            "begin" => {
                let env = self.parse_env_name()?;
                match env.as_str() {
                    // как в design: m:d (begChr="{", endChr="") + m:eqArr
                    "cases" => {
                        let rows = self.parse_env_rows("cases")?;
                        Ok(vec![Node::Delim {
                            beg: "{".into(),
                            end: String::new(),
                            body: vec![Node::EqArr(rows)],
                        }])
                    }
                    "aligned" => Ok(vec![Node::EqArr(self.parse_env_rows("aligned")?)]),
                    "matrix" => Ok(vec![Node::Matrix(self.parse_matrix("matrix")?)]),
                    other => Err(format!("неподдерживаемое окружение \\begin{{{other}}}")),
                }
            }
            "right" => Err("\\right без \\left".into()),
            "end" => Err("\\end без \\begin".into()),
            other => Err(format!("неизвестная команда \\{other}")),
        }
    }
}

// ---------------------------------------------------------------------------
// Рендер в OMML
// ---------------------------------------------------------------------------

/// Склеивает соседние простые символы в один `m:r`.
fn merge_nodes(nodes: &mut Vec<Node>) {
    let mut merged: Vec<Node> = Vec::with_capacity(nodes.len());
    for node in nodes.drain(..) {
        let mut node = node;
        match &mut node {
            Node::Frac { num, den, .. } => {
                merge_nodes(num);
                merge_nodes(den);
            }
            Node::Sqrt { deg, body } => {
                if let Some(d) = deg {
                    merge_nodes(d);
                }
                merge_nodes(body);
            }
            Node::Sub { base, sub } => {
                merge_nodes(base);
                merge_nodes(sub);
            }
            Node::Sup { base, sup } => {
                merge_nodes(base);
                merge_nodes(sup);
            }
            Node::SubSup { base, sub, sup } => {
                merge_nodes(base);
                merge_nodes(sub);
                merge_nodes(sup);
            }
            Node::Delim { body, .. } => merge_nodes(body),
            Node::EqArr(rows) => rows.iter_mut().for_each(merge_nodes),
            Node::Matrix(rows) => rows.iter_mut().flatten().for_each(merge_nodes),
            Node::Acc { body, .. } | Node::Bar { body } | Node::GroupChr { body } => {
                merge_nodes(body)
            }
            Node::Sym(_) | Node::Plain(_) => {}
        }
        if let Some(Node::Sym(prev)) = merged.last_mut() {
            if let Node::Sym(cur) = &node {
                prev.push_str(cur);
                continue;
            }
        }
        if let Some(Node::Plain(prev)) = merged.last_mut() {
            if let Node::Plain(cur) = &node {
                prev.push_str(cur);
                continue;
            }
        }
        merged.push(node);
    }
    *nodes = merged;
}

fn escape_text(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            _ => out.push(c),
        }
    }
    out
}

fn render_run(s: &str, upright: bool, out: &mut String) {
    out.push_str("<m:r>");
    if upright {
        out.push_str("<m:rPr><m:sty m:val=\"p\"/></m:rPr>");
    }
    out.push_str("<m:t");
    if s.contains(' ') {
        out.push_str(" xml:space=\"preserve\"");
    }
    out.push('>');
    out.push_str(&escape_text(s));
    out.push_str("</m:t></m:r>");
}

fn render_seq(nodes: &[Node], out: &mut String) {
    for n in nodes {
        render_node(n, out);
    }
}

fn render_node(n: &Node, out: &mut String) {
    match n {
        Node::Sym(s) => render_run(s, false, out),
        Node::Plain(s) => render_run(s, true, out),
        Node::Frac { num, den, no_bar } => {
            out.push_str("<m:f>");
            if *no_bar {
                out.push_str("<m:fPr><m:type m:val=\"noBar\"/></m:fPr>");
            }
            out.push_str("<m:num>");
            render_seq(num, out);
            out.push_str("</m:num><m:den>");
            render_seq(den, out);
            out.push_str("</m:den></m:f>");
        }
        Node::Sqrt { deg, body } => {
            out.push_str("<m:rad>");
            match deg {
                None => out.push_str("<m:radPr><m:degHide m:val=\"1\"/></m:radPr><m:deg/>"),
                Some(d) => {
                    out.push_str("<m:deg>");
                    render_seq(d, out);
                    out.push_str("</m:deg>");
                }
            }
            out.push_str("<m:e>");
            render_seq(body, out);
            out.push_str("</m:e></m:rad>");
        }
        Node::Sub { base, sub } => {
            out.push_str("<m:sSub><m:e>");
            render_seq(base, out);
            out.push_str("</m:e><m:sub>");
            render_seq(sub, out);
            out.push_str("</m:sub></m:sSub>");
        }
        Node::Sup { base, sup } => {
            out.push_str("<m:sSup><m:e>");
            render_seq(base, out);
            out.push_str("</m:e><m:sup>");
            render_seq(sup, out);
            out.push_str("</m:sup></m:sSup>");
        }
        Node::SubSup { base, sub, sup } => {
            out.push_str("<m:sSubSup><m:e>");
            render_seq(base, out);
            out.push_str("</m:e><m:sub>");
            render_seq(sub, out);
            out.push_str("</m:sub><m:sup>");
            render_seq(sup, out);
            out.push_str("</m:sup></m:sSubSup>");
        }
        Node::Delim { beg, end, body } => {
            out.push_str("<m:d><m:dPr><m:begChr m:val=\"");
            out.push_str(&escape_text(beg));
            out.push_str("\"/><m:endChr m:val=\"");
            out.push_str(&escape_text(end));
            out.push_str("\"/></m:dPr><m:e>");
            render_seq(body, out);
            out.push_str("</m:e></m:d>");
        }
        Node::EqArr(rows) => {
            out.push_str("<m:eqArr>");
            for row in rows {
                out.push_str("<m:e>");
                render_seq(row, out);
                out.push_str("</m:e>");
            }
            out.push_str("</m:eqArr>");
        }
        Node::Acc { chr, body } => {
            out.push_str("<m:acc><m:accPr><m:chr m:val=\"");
            out.push_str(&escape_text(&chr.to_string()));
            out.push_str("\"/></m:accPr><m:e>");
            render_seq(body, out);
            out.push_str("</m:e></m:acc>");
        }
        Node::Bar { body } => {
            out.push_str("<m:bar><m:barPr><m:pos m:val=\"top\"/></m:barPr><m:e>");
            render_seq(body, out);
            out.push_str("</m:e></m:bar>");
        }
        Node::GroupChr { body } => {
            out.push_str(
                "<m:groupChr><m:groupChrPr><m:chr m:val=\"⏟\"/>\
                 <m:pos m:val=\"bot\"/></m:groupChrPr><m:e>",
            );
            render_seq(body, out);
            out.push_str("</m:e></m:groupChr>");
        }
        Node::Matrix(rows) => {
            out.push_str("<m:m>");
            for row in rows {
                out.push_str("<m:mr>");
                for cell in row {
                    out.push_str("<m:e>");
                    render_seq(cell, out);
                    out.push_str("</m:e>");
                }
                out.push_str("</m:mr>");
            }
            out.push_str("</m:m>");
        }
    }
}

/// LaTeX → фрагмент `<m:oMath>…</m:oMath>` (xmlns объявляет корень документа).
pub fn latex_to_omml(src: &str) -> Result<String, String> {
    let toks = tokenize(src)?;
    let mut parser = Parser { toks, pos: 0 };
    let mut nodes = parser.parse_seq(Ctx::Top)?;
    if parser.pos < parser.toks.len() {
        return Err(format!("неожиданный токен: {:?}", parser.toks[parser.pos]));
    }
    merge_nodes(&mut nodes);
    let mut out = String::from("<m:oMath>");
    render_seq(&nodes, &mut out);
    out.push_str("</m:oMath>");
    Ok(out)
}

// ---------------------------------------------------------------------------
// Обратное преобразование OMML → LaTeX
// ---------------------------------------------------------------------------

/// LaTeX всех дочерних узлов (+ текст вне тегов).
fn inner(node: &XNode) -> String {
    let mut s: String = node.children.iter().map(node_to_latex).collect();
    s.push_str(&node.text);
    s
}

pub(crate) fn node_to_latex(node: &XNode) -> String {
    match node.name.as_str() {
        "f" => {
            let num = node.child("num").map(inner).unwrap_or_default();
            let den = node.child("den").map(inner).unwrap_or_default();
            if node.prop("fPr", "type") == Some("noBar") {
                format!("\\binom{{{num}}}{{{den}}}")
            } else {
                format!("\\frac{{{num}}}{{{den}}}")
            }
        }
        "rad" => {
            let hide = node.prop("radPr", "degHide") == Some("1");
            let deg = node.child("deg").map(inner).unwrap_or_default();
            let body = node.child("e").map(inner).unwrap_or_default();
            if hide || deg.is_empty() {
                format!("\\sqrt{{{body}}}")
            } else {
                format!("\\sqrt[{deg}]{{{body}}}")
            }
        }
        "sSup" => {
            let base = node.child("e").map(inner).unwrap_or_default();
            let sup = node.child("sup").map(inner).unwrap_or_default();
            format!("{base}^{{{sup}}}")
        }
        "sSub" => {
            let base = node.child("e").map(inner).unwrap_or_default();
            let sub = node.child("sub").map(inner).unwrap_or_default();
            format!("{base}_{{{sub}}}")
        }
        "sSubSup" => {
            let base = node.child("e").map(inner).unwrap_or_default();
            let sub = node.child("sub").map(inner).unwrap_or_default();
            let sup = node.child("sup").map(inner).unwrap_or_default();
            format!("{base}_{{{sub}}}^{{{sup}}}")
        }
        "d" => to_latex_delim(node),
        "eqArr" => node
            .children
            .iter()
            .filter(|c| c.name == "e")
            .map(node_to_latex)
            .collect::<Vec<_>>()
            .join("\\\\"),
        "acc" => {
            let body = node.child("e").map(inner).unwrap_or_default();
            // ⃗ (U+20D7) и → (U+2192) — стрелка; U+0302/0306/0303 — акценты
            match node.prop("accPr", "chr").unwrap_or("⃗") {
                "⃗" | "→" => format!("\\vec{{{body}}}"),
                "\u{302}" => format!("\\widehat{{{body}}}"),
                "\u{306}" => format!("\\breve{{{body}}}"),
                "\u{303}" => format!("\\widetilde{{{body}}}"),
                _ => body,
            }
        }
        "groupChr" => {
            let body = node.child("e").map(inner).unwrap_or_default();
            format!("\\underbrace{{{body}}}")
        }
        "m" => {
            let rows: Vec<String> = node
                .children_named("mr")
                .map(|mr| {
                    mr.children_named("e")
                        .map(node_to_latex)
                        .collect::<Vec<_>>()
                        .join("&")
                })
                .collect();
            format!("\\begin{{matrix}}{}\\end{{matrix}}", rows.join("\\\\"))
        }
        "bar" => {
            let body = node.child("e").map(inner).unwrap_or_default();
            if node.prop("barPr", "pos") == Some("bot") {
                body
            } else {
                format!("\\overline{{{body}}}")
            }
        }
        "func" => {
            let name = node.child("fName").map(inner).unwrap_or_default();
            let arg = node.child("e").map(inner).unwrap_or_default();
            if function_cmd(&name) {
                format!("\\{name}{{{arg}}}")
            } else {
                format!("\\text{{{name}}}{arg}")
            }
        }
        "r" => run_to_latex(node),
        // обёртки (oMath, e, num, …) и неизвестные узлы → конкатенация детей
        _ => inner(node),
    }
}

/// Скобки: `\left…\right`, `\binom` и `\begin{cases}`.
fn to_latex_delim(node: &XNode) -> String {
    if let Some(e) = node.child("e") {
        // `\begin{cases}`: внутри ровно одна eqArr
        if e.children.len() == 1 {
            if let Some(eq) = e.child("eqArr") {
                return format!("\\begin{{cases}}{}\\end{{cases}}", node_to_latex(eq));
            }
            // `\binom`: скобки уже учтены в дроби noBar
            if let Some(f) = e.child("f") {
                if f.prop("fPr", "type") == Some("noBar") {
                    return node_to_latex(f);
                }
            }
        }
    }
    let body = node.child("e").map(inner).unwrap_or_default();
    let esc = |s: &str| {
        if s == "{" || s == "}" {
            format!("\\{s}")
        } else {
            s.to_string()
        }
    };
    let beg = esc(node.prop("dPr", "begChr").unwrap_or("("));
    let end = esc(node.prop("dPr", "endChr").unwrap_or(")"));
    format!("\\left{beg}{body}\\right{end}")
}

/// `m:r`: прямой шрифт (`m:sty p`) — имя функции, иначе `\text{…}`.
fn run_to_latex(node: &XNode) -> String {
    let s = match node.child("t") {
        Some(t) => t.text.clone(),
        None => node.text.clone(),
    };
    if node.prop("rPr", "sty") == Some("p") {
        if function_cmd(&s) {
            // пробел после имени, чтобы `\sin x` не слипалось с аргументом
            return format!("\\{s} ");
        }
        if s.chars().any(|c| c.is_alphabetic()) {
            return format!("\\text{{{s}}}");
        }
    }
    s
}

/// OMML-фрагмент → LaTeX для чтения docx; неизвестные узлы → их текст.
pub fn omml_to_latex(omath_xml: &str) -> String {
    let roots = build_tree(omath_xml);
    match roots.iter().position(|n| n.name == "oMath") {
        Some(idx) => node_to_latex(&roots[idx]),
        None => roots.iter().map(node_to_latex).collect(),
    }
}

// ---------------------------------------------------------------------------
// Тесты
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use quick_xml::events::Event;
    use quick_xml::reader::Reader;

    fn omml(src: &str) -> String {
        latex_to_omml(src).unwrap_or_else(|e| panic!("«{src}» должна разбираться: {e}"))
    }

    /// XML разбирается quick-xml, теги совпадают попарно.
    fn assert_well_formed(xml: &str) {
        let mut reader = Reader::from_str(xml);
        let mut buf = Vec::new();
        let mut depth = 0i32;
        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Eof) => break,
                Ok(Event::Start(_)) => depth += 1,
                Ok(Event::End(_)) => depth -= 1,
                Ok(_) => {}
                Err(e) => panic!("XML не парсится: {e} в {xml}"),
            }
            buf.clear();
        }
        assert_eq!(depth, 0, "незакрытые теги в {xml}");
    }

    #[test]
    fn split_math_text_and_formula() {
        assert_eq!(
            split_math("до $x+1$ после"),
            vec![
                Segment::Text("до ".into()),
                Segment::Math("x+1".into()),
                Segment::Text(" после".into()),
            ]
        );
        assert_eq!(split_math("без формул"), vec![Segment::Text("без формул".into())]);
        assert_eq!(split_math(""), vec![]);
    }

    #[test]
    fn split_math_escaped_dollar() {
        assert_eq!(
            split_math("цена 5\\$ и $x$"),
            vec![
                Segment::Text("цена 5$ и ".into()),
                Segment::Math("x".into()),
            ]
        );
    }

    #[test]
    fn split_math_unclosed_dollar_is_text() {
        assert_eq!(split_math("формула $x+y"), vec![Segment::Text("формула $x+y".into())]);
        assert_eq!(
            split_math("$a и $b"),
            vec![Segment::Math("a и ".into()), Segment::Text("b".into())]
        );
    }

    #[test]
    fn frac() {
        assert_eq!(
            omml(r"\frac{a}{b}"),
            "<m:oMath><m:f><m:num><m:r><m:t>a</m:t></m:r></m:num>\
             <m:den><m:r><m:t>b</m:t></m:r></m:den></m:f></m:oMath>"
        );
        assert_eq!(omml(r"\dfrac{a}{b}"), omml(r"\frac{a}{b}"));
        assert_well_formed(&omml(r"\frac{a}{b}"));
    }

    #[test]
    fn sqrt_forms() {
        assert_eq!(
            omml(r"\sqrt{x}"),
            "<m:oMath><m:rad><m:radPr><m:degHide m:val=\"1\"/></m:radPr><m:deg/>\
             <m:e><m:r><m:t>x</m:t></m:r></m:e></m:rad></m:oMath>"
        );
        assert_eq!(
            omml(r"\sqrt[n]{x}"),
            "<m:oMath><m:rad><m:deg><m:r><m:t>n</m:t></m:r></m:deg>\
             <m:e><m:r><m:t>x</m:t></m:r></m:e></m:rad></m:oMath>"
        );
        assert_well_formed(&omml(r"\sqrt{x}"));
        assert_well_formed(&omml(r"\sqrt[n]{x}"));
    }

    #[test]
    fn scripts() {
        assert_eq!(
            omml("x^{2}"),
            "<m:oMath><m:sSup><m:e><m:r><m:t>x</m:t></m:r></m:e>\
             <m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSup></m:oMath>"
        );
        assert_eq!(omml("x^2"), omml("x^{2}"));
        assert_eq!(
            omml("x_{1}"),
            "<m:oMath><m:sSub><m:e><m:r><m:t>x</m:t></m:r></m:e>\
             <m:sub><m:r><m:t>1</m:t></m:r></m:sub></m:sSub></m:oMath>"
        );
        assert_eq!(omml("x_1"), omml("x_{1}"));
        assert_eq!(
            omml("x_{1}^{2}"),
            "<m:oMath><m:sSubSup><m:e><m:r><m:t>x</m:t></m:r></m:e>\
             <m:sub><m:r><m:t>1</m:t></m:r></m:sub>\
             <m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSubSup></m:oMath>"
        );
        assert_eq!(omml("x_1^2"), omml("x_{1}^{2}"));
        // скрипт цепляется только к последнему символу: a — отдельный run
        assert_eq!(
            omml("ab_1"),
            "<m:oMath><m:r><m:t>a</m:t></m:r>\
             <m:sSub><m:e><m:r><m:t>b</m:t></m:r></m:e>\
             <m:sub><m:r><m:t>1</m:t></m:r></m:sub></m:sSub></m:oMath>"
        );
        assert_well_formed(&omml("x_{1}^{2}"));
    }

    #[test]
    fn delims() {
        assert_eq!(
            omml(r"\left(x\right)"),
            "<m:oMath><m:d><m:dPr><m:begChr m:val=\"(\"/><m:endChr m:val=\")\"/></m:dPr>\
             <m:e><m:r><m:t>x</m:t></m:r></m:e></m:d></m:oMath>"
        );
        assert!(omml(r"\left[x\right]").contains("<m:begChr m:val=\"[\"/>"));
        assert!(omml(r"\left\{x\right\}").contains("<m:begChr m:val=\"{\"/>"));
        assert!(omml(r"\left\{x\right\}").contains("<m:endChr m:val=\"}\"/>"));
        assert!(omml(r"\left|x\right|").contains("<m:begChr m:val=\"|\"/>"));
        assert_well_formed(&omml(r"\left\{x\right\}"));
    }

    #[test]
    fn cases() {
        assert_eq!(
            omml(r"\begin{cases}a\\b\end{cases}"),
            "<m:oMath><m:d><m:dPr><m:begChr m:val=\"{\"/><m:endChr m:val=\"\"/></m:dPr>\
             <m:e><m:eqArr><m:e><m:r><m:t>a</m:t></m:r></m:e>\
             <m:e><m:r><m:t>b</m:t></m:r></m:e></m:eqArr></m:e></m:d></m:oMath>"
        );
        assert_well_formed(&omml(r"\begin{cases}a\\b\end{cases}"));
    }

    #[test]
    fn accents_and_bar() {
        assert_eq!(
            omml(r"\vec{a}"),
            "<m:oMath><m:acc><m:accPr><m:chr m:val=\"⃗\"/></m:accPr>\
             <m:e><m:r><m:t>a</m:t></m:r></m:e></m:acc></m:oMath>"
        );
        assert_eq!(omml(r"\overrightarrow{AB}"), omml(r"\vec{AB}"));
        assert_eq!(
            omml(r"\overline{AB}"),
            "<m:oMath><m:bar><m:barPr><m:pos m:val=\"top\"/></m:barPr>\
             <m:e><m:r><m:t>AB</m:t></m:r></m:e></m:bar></m:oMath>"
        );
        assert_well_formed(&omml(r"\overline{AB}"));
    }

    #[test]
    fn binom() {
        assert_eq!(
            omml(r"\binom{n}{k}"),
            "<m:oMath><m:d><m:dPr><m:begChr m:val=\"(\"/><m:endChr m:val=\")\"/></m:dPr>\
             <m:e><m:f><m:fPr><m:type m:val=\"noBar\"/></m:fPr>\
             <m:num><m:r><m:t>n</m:t></m:r></m:num>\
             <m:den><m:r><m:t>k</m:t></m:r></m:den></m:f></m:e></m:d></m:oMath>"
        );
        assert_well_formed(&omml(r"\binom{n}{k}"));
    }

    #[test]
    fn text_and_functions() {
        assert_eq!(
            omml(r"\text{abc}"),
            "<m:oMath><m:r><m:rPr><m:sty m:val=\"p\"/></m:rPr>\
             <m:t>abc</m:t></m:r></m:oMath>"
        );
        assert_eq!(
            omml(r"\sin x"),
            "<m:oMath><m:r><m:rPr><m:sty m:val=\"p\"/></m:rPr><m:t>sin</m:t></m:r>\
             <m:r><m:t>x</m:t></m:r></m:oMath>"
        );
        assert!(omml(r"\arccos x").contains("<m:t>arccos</m:t>"));
        assert!(omml(r"\ln x").contains("<m:t>ln</m:t>"));
        assert_well_formed(&omml(r"\text{abc}"));
    }

    #[test]
    fn table_symbols() {
        let cases = [
            (r"\cdot", "·"),
            (r"\times", "×"),
            (r"\div", "÷"),
            (r"\pm", "±"),
            (r"\mp", "∓"),
            (r"\le", "≤"),
            (r"\leq", "≤"),
            (r"\ge", "≥"),
            (r"\geq", "≥"),
            (r"\ne", "≠"),
            (r"\neq", "≠"),
            (r"\approx", "≈"),
            (r"\equiv", "≡"),
            (r"\sim", "∼"),
            (r"\pi", "π"),
            (r"\alpha", "α"),
            (r"\beta", "β"),
            (r"\gamma", "γ"),
            (r"\varphi", "φ"),
            (r"\phi", "φ"),
            (r"\Delta", "Δ"),
            (r"\angle", "∠"),
            (r"\triangle", "△"),
            (r"\circ", "°"),
            (r"\infty", "∞"),
            (r"\in", "∈"),
            (r"\notin", "∉"),
            (r"\cup", "∪"),
            (r"\cap", "∩"),
            (r"\emptyset", "∅"),
            (r"\varnothing", "∅"),
            (r"\mathbb{R}", "ℝ"),
            (r"\mathbb{N}", "ℕ"),
            (r"\mathbb{Z}", "ℤ"),
            (r"\mathbb{Q}", "ℚ"),
            (r"\parallel", "∥"),
            (r"\perp", "⊥"),
            (r"\Rightarrow", "⇒"),
            (r"\Leftrightarrow", "⇔"),
            (r"\to", "→"),
            (r"\%", "%"),
            (r"\{", "{"),
            (r"\}", "}"),
        ];
        for (src, ch) in cases {
            let expect = format!("<m:oMath><m:r><m:t>{ch}</m:t></m:r></m:oMath>");
            assert_eq!(omml(src), expect, "символ {src}");
        }
        // соседние символы склеиваются в один m:r
        assert_eq!(
            omml(r"\alpha\beta"),
            "<m:oMath><m:r><m:t>αβ</m:t></m:r></m:oMath>"
        );
        // тонкий пробел → пробел
        assert_eq!(
            omml(r"a\,b"),
            "<m:oMath><m:r><m:t xml:space=\"preserve\">a b</m:t></m:r></m:oMath>"
        );
        assert_well_formed(&omml(r"\mathbb{R}\cup\mathbb{N}"));
    }

    #[test]
    fn plain_chars_and_escaping() {
        assert_eq!(
            omml("x+1"),
            "<m:oMath><m:r><m:t>x+1</m:t></m:r></m:oMath>"
        );
        assert_eq!(
            omml("a<b>c"),
            "<m:oMath><m:r><m:t>a&lt;b&gt;c</m:t></m:r></m:oMath>"
        );
        assert_eq!(
            omml("a+b=c"),
            "<m:oMath><m:r><m:t>a+b=c</m:t></m:r></m:oMath>"
        );
        // ^ цепляется к последнему символу (как в LaTeX): 9 — отдельный run
        assert_eq!(
            omml(r"90^{\circ}"),
            "<m:oMath><m:r><m:t>9</m:t></m:r>\
             <m:sSup><m:e><m:r><m:t>0</m:t></m:r></m:e>\
             <m:sup><m:r><m:t>°</m:t></m:r></m:sup></m:sSup></m:oMath>"
        );
        assert_eq!(
            omml(r"\text{a&b}"),
            "<m:oMath><m:r><m:rPr><m:sty m:val=\"p\"/></m:rPr>\
             <m:t>a&amp;b</m:t></m:r></m:oMath>"
        );
    }

    #[test]
    fn nesting() {
        assert_eq!(
            omml(r"\frac{\sqrt{a}}{b^2}"),
            "<m:oMath><m:f><m:num><m:rad><m:radPr><m:degHide m:val=\"1\"/></m:radPr>\
             <m:deg/><m:e><m:r><m:t>a</m:t></m:r></m:e></m:rad></m:num>\
             <m:den><m:sSup><m:e><m:r><m:t>b</m:t></m:r></m:e>\
             <m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSup></m:den></m:f></m:oMath>"
        );
        assert_well_formed(&omml(r"\frac{\sqrt{a}}{b^2}"));
    }

    #[test]
    fn parse_errors() {
        assert!(latex_to_omml(r"\foo").is_err());
        assert!(latex_to_omml(r"\frac{a}").is_err());
        assert!(latex_to_omml("a$b").is_err());
        assert!(latex_to_omml(r"\begin{align}a\end{align}").is_err());
        assert!(latex_to_omml(r"\left(x").is_err());
        assert!(latex_to_omml("a}").is_err());
    }

    #[test]
    fn round_trip() {
        let cases = [
            r"x^{2}",
            r"x_{1}",
            r"x_{1}^{2}",
            r"\frac{a}{b}",
            r"\sqrt{x}",
            r"\sqrt[n]{x}",
            r"\left(x\right)",
            r"\left[x\right]",
            r"\left\{x\right\}",
            r"\begin{cases}a\\b\end{cases}",
            r"\vec{a}",
            r"\overline{AB}",
            r"\binom{n}{k}",
            r"\frac{\sqrt{a}}{b^{2}}",
        ];
        for src in cases {
            let xml = latex_to_omml(src).unwrap_or_else(|e| panic!("{src}: {e}"));
            let back = omml_to_latex(&xml);
            assert_eq!(back, src, "round-trip «{src}»");
        }
    }

    #[test]
    fn omml_runs_to_latex() {
        let xml = "<m:oMath><m:r><m:t xml:space=\"preserve\">a &lt; b &amp; c</m:t></m:r>\
                   <m:f><m:num><m:r><m:t>1</m:t></m:r></m:num>\
                   <m:den><m:r><m:t>2</m:t></m:r></m:den></m:f></m:oMath>";
        assert_eq!(omml_to_latex(xml), "a < b & c\\frac{1}{2}");
    }

    #[test]
    fn omml_func_to_latex() {
        let xml = "<m:oMath xmlns:m=\"http://schemas.openxmlformats.org/officeDocument/2006/math\">\
                   <m:func><m:fName><m:r><m:t>sin</m:t></m:r></m:fName>\
                   <m:e><m:r><m:t>x</m:t></m:r></m:e></m:func></m:oMath>";
        assert_eq!(omml_to_latex(xml), r"\sin{x}");
    }

    #[test]
    fn omml_unknown_element_falls_back_to_text() {
        let xml = "<m:oMath><m:bar><m:e><m:r><m:t>x</m:t></m:r></m:e></m:bar>\
                   <m:oops><m:r><m:t>y</m:t></m:r></m:oops></m:oMath>";
        assert_eq!(omml_to_latex(xml), r"\overline{x}y");
    }

    #[test]
    fn spaces_ignored_outside_text() {
        // пробелы вне \text не дают символов
        assert_eq!(omml("x + y"), omml("x+y"));
        assert_eq!(omml("x^ 2"), omml("x^2"));
        assert_eq!(omml(r"\frac {a} {b}"), omml(r"\frac{a}{b}"));
        // явные пробелы — один пробел
        assert_eq!(
            omml(r"a\ b"),
            "<m:oMath><m:r><m:t xml:space=\"preserve\">a b</m:t></m:r></m:oMath>"
        );
        assert_eq!(omml(r"a\,b"), omml(r"a\ b"));
        // в \text пробелы сохраняются
        assert_eq!(
            omml(r"\text{при a}"),
            "<m:oMath><m:r><m:rPr><m:sty m:val=\"p\"/></m:rPr>\
             <m:t xml:space=\"preserve\">при a</m:t></m:r></m:oMath>"
        );
    }

    #[test]
    fn round_trip_keeps_equivalent_omml() {
        for src in [r"\sin x", r"\text{при } x"] {
            let omml1 = latex_to_omml(src).unwrap_or_else(|e| panic!("{src}: {e}"));
            let latex2 = omml_to_latex(&omml1);
            let omml2 = latex_to_omml(&latex2)
                .unwrap_or_else(|e| panic!("{src} → «{latex2}»: {e}"));
            assert_eq!(omml2, omml1, "round-trip «{src}» → «{latex2}»");
        }
    }

    #[test]
    fn omml_acc_and_bar_to_latex() {
        // U+2192 — стрелка → \vec
        let xml = "<m:oMath><m:acc><m:accPr><m:chr m:val=\"→\"/></m:accPr>\
                   <m:e><m:r><m:t>AB</m:t></m:r></m:e></m:acc></m:oMath>";
        assert_eq!(omml_to_latex(xml), r"\vec{AB}");
        // прочий акцент — просто тело
        let xml = "<m:oMath><m:acc><m:accPr><m:chr m:val=\"^\"/></m:accPr>\
                   <m:e><m:r><m:t>x</m:t></m:r></m:e></m:acc></m:oMath>";
        assert_eq!(omml_to_latex(xml), "x");
        // подчёркивание снизу — просто тело
        let xml = "<m:oMath><m:bar><m:barPr><m:pos m:val=\"bot\"/></m:barPr>\
                   <m:e><m:r><m:t>x</m:t></m:r></m:e></m:bar></m:oMath>";
        assert_eq!(omml_to_latex(xml), "x");
    }

    #[test]
    fn omml_unknown_func_to_latex() {
        // max/min теперь известные функции — неизвестная берётся как sgn
        let xml = "<m:oMath><m:func><m:fName><m:r><m:t>sgn</m:t></m:r></m:fName>\
                   <m:e><m:r><m:t>x</m:t></m:r></m:e></m:func></m:oMath>";
        assert_eq!(omml_to_latex(xml), r"\text{sgn}x");
    }

    #[test]
    fn split_math_double_dollar() {
        assert_eq!(
            split_math("a $$x^2$$ b"),
            vec![
                Segment::Text("a ".into()),
                Segment::Math("x^2".into()),
                Segment::Text(" b".into()),
            ]
        );
        assert_eq!(split_math("$$x$$"), vec![Segment::Math("x".into())]);
        // незакрытый $$ — обычный текст
        assert_eq!(split_math("до $$x"), vec![Segment::Text("до $$x".into())]);
        // одиночный $ работает как раньше
        assert_eq!(split_math("$x$"), vec![Segment::Math("x".into())]);
    }

    #[test]
    fn new_symbols() {
        let cases = [
            (r"\leqslant", "≤"),
            (r"\geqslant", "≥"),
            (r"\dots", "…"),
            (r"\ldots", "…"),
            (r"\cdots", "⋯"),
            (r"\uparrow", "↑"),
            (r"\downarrow", "↓"),
            (r"\nearrow", "↗"),
            (r"\searrow", "↘"),
            (r"\nparallel", "∦"),
            (r"\subset", "⊂"),
            (r"\subseteq", "⊆"),
            (r"\forall", "∀"),
            (r"\exists", "∃"),
            (r"\implies", "⇒"),
            (r"\blacksquare", "■"),
            (r"\blacktriangle", "▲"),
            (r"\smile", "⌣"),
            (r"\lambda", "λ"),
            (r"\psi", "ψ"),
            (r"\tau", "τ"),
            (r"\epsilon", "ε"),
            (r"\iota", "ι"),
            (r"\chi", "χ"),
            (r"\Pi", "Π"),
            (r"\Sigma", "Σ"),
            (r"\sum", "∑"),
        ];
        for (src, ch) in cases {
            let expect = format!("<m:oMath><m:r><m:t>{ch}</m:t></m:r></m:oMath>");
            assert_eq!(omml(src), expect, "символ {src}");
        }
        assert_well_formed(&omml(r"\sum_{i=1}^{n} a_i \leqslant \Sigma"));
    }

    #[test]
    fn quad_spaces() {
        assert_eq!(
            omml(r"\quad"),
            "<m:oMath><m:r><m:t xml:space=\"preserve\">  </m:t></m:r></m:oMath>"
        );
        assert_eq!(
            omml(r"\qquad"),
            "<m:oMath><m:r><m:t xml:space=\"preserve\">    </m:t></m:r></m:oMath>"
        );
        assert_eq!(
            omml(r"a\quad b"),
            "<m:oMath><m:r><m:t xml:space=\"preserve\">a  b</m:t></m:r></m:oMath>"
        );
        assert_well_formed(&omml(r"x \quad y \qquad z"));
    }

    #[test]
    fn operatorname_and_max_min() {
        let upright = |s: &str| {
            format!(
                "<m:oMath><m:r><m:rPr><m:sty m:val=\"p\"/></m:rPr><m:t>{s}</m:t></m:r></m:oMath>"
            )
        };
        assert_eq!(omml(r"\operatorname{tg}"), upright("tg"));
        assert_eq!(omml(r"\operatorname{sgn}"), upright("sgn"));
        assert!(omml(r"\max x").contains("<m:t>max</m:t>"));
        assert!(omml(r"\min x").contains("<m:t>min</m:t>"));
        assert_well_formed(&omml(r"\operatorname{tg}x + \max y"));
        // обратно: tg — известная функция, sgn — \text
        assert_eq!(omml_to_latex(&omml(r"\operatorname{tg}")), r"\tg ");
        assert_eq!(omml_to_latex(&omml(r"\operatorname{sgn}")), r"\text{sgn}");
        assert_eq!(omml_to_latex(&omml(r"\max x")), r"\max x");
    }

    #[test]
    fn mathbin_phantom_tag_eqno() {
        assert_eq!(omml(r"\mathbin{+}"), omml("+"));
        assert_eq!(omml(r"\mathbin{\times}"), omml(r"\times"));
        assert_eq!(omml(r"a\phantom{xyz}b"), omml("ab"));
        let tagged = "<m:oMath><m:r><m:rPr><m:sty m:val=\"p\"/></m:rPr>\
                      <m:t>(7)</m:t></m:r></m:oMath>";
        assert_eq!(omml(r"\tag{7}"), tagged);
        assert_eq!(omml(r"\eqno{7}"), tagged);
        assert_eq!(omml(r"\eqno 7"), tagged);
        assert_well_formed(&omml(r"a\phantom{b}\tag{7}"));
        assert_eq!(omml_to_latex(&omml(r"\tag{7}")), "(7)");
        assert!(latex_to_omml(r"\tag").is_err());
        assert!(latex_to_omml(r"\eqno").is_err());
    }

    #[test]
    fn not_combination() {
        assert_eq!(omml(r"\not\in"), "<m:oMath><m:r><m:t>∉</m:t></m:r></m:oMath>");
        assert_eq!(
            omml(r"\not\parallel"),
            "<m:oMath><m:r><m:t>∦</m:t></m:r></m:oMath>"
        );
        assert_eq!(omml(r"\not="), "<m:oMath><m:r><m:t>≠</m:t></m:r></m:oMath>");
        let overlay = format!("<m:oMath><m:r><m:t>&lt;{}</m:t></m:r></m:oMath>", '\u{338}');
        assert_eq!(omml(r"\not<"), overlay);
        assert_well_formed(&omml(r"\not\in B"));
        assert!(latex_to_omml(r"\not\foo").is_err());
    }

    #[test]
    fn accent_commands() {
        let hat = "<m:oMath><m:acc><m:accPr><m:chr m:val=\"\u{302}\"/></m:accPr>\
                   <m:e><m:r><m:t>a</m:t></m:r></m:e></m:acc></m:oMath>";
        assert_eq!(omml(r"\widehat{a}"), hat);
        assert_eq!(omml(r"\hat{a}"), hat);
        assert!(omml(r"\breve{x}").contains("m:val=\"\u{306}\""));
        assert!(omml(r"\tilde{y}").contains("m:val=\"\u{303}\""));
        assert_eq!(omml(r"\widetilde{z}"), omml(r"\tilde{z}"));
        assert_well_formed(&omml(r"\widehat{AB}"));
        for (src, back) in [
            (r"\widehat{a}", r"\widehat{a}"),
            (r"\breve{a}", r"\breve{a}"),
            (r"\widetilde{a}", r"\widetilde{a}"),
            (r"\hat{a}", r"\widehat{a}"),
            (r"\tilde{a}", r"\widetilde{a}"),
        ] {
            let xml = latex_to_omml(src).unwrap_or_else(|e| panic!("{src}: {e}"));
            assert_eq!(omml_to_latex(&xml), back, "round-trip «{src}»");
        }
    }

    #[test]
    fn underbrace_group_chr() {
        assert_eq!(
            omml(r"\underbrace{A}_{B}"),
            "<m:oMath><m:sSub><m:e><m:groupChr><m:groupChrPr><m:chr m:val=\"⏟\"/>\
             <m:pos m:val=\"bot\"/></m:groupChrPr><m:e><m:r><m:t>A</m:t></m:r></m:e>\
             </m:groupChr></m:e><m:sub><m:r><m:t>B</m:t></m:r></m:sub></m:sSub></m:oMath>"
        );
        assert_well_formed(&omml(r"\underbrace{A+B}_{text}"));
        let xml = omml(r"\underbrace{A}_{B}");
        assert_eq!(omml_to_latex(&xml), r"\underbrace{A}_{B}");
    }

    #[test]
    fn aligned_env() {
        assert_eq!(
            omml(r"\begin{aligned}a&=b\\c&=d\end{aligned}"),
            "<m:oMath><m:eqArr><m:e><m:r><m:t>a=b</m:t></m:r></m:e>\
             <m:e><m:r><m:t>c=d</m:t></m:r></m:e></m:eqArr></m:oMath>"
        );
        assert_well_formed(&omml(r"\begin{aligned}x=1\\y=2\end{aligned}"));
        // обратно: строки eqArr без обёртки окружения
        assert_eq!(
            omml_to_latex(&omml(r"\begin{aligned}a=b\\c=d\end{aligned}")),
            r"a=b\\c=d"
        );
    }

    #[test]
    fn matrix_env() {
        assert_eq!(
            omml(r"\begin{matrix}a&b\\c&d\end{matrix}"),
            "<m:oMath><m:m><m:mr><m:e><m:r><m:t>a</m:t></m:r></m:e>\
             <m:e><m:r><m:t>b</m:t></m:r></m:e></m:mr>\
             <m:mr><m:e><m:r><m:t>c</m:t></m:r></m:e>\
             <m:e><m:r><m:t>d</m:t></m:r></m:e></m:mr></m:m></m:oMath>"
        );
        assert_well_formed(&omml(r"\begin{matrix}1&2\\3&4\end{matrix}"));
        let src = r"\begin{matrix}a&b\\c&d\end{matrix}";
        assert_eq!(omml_to_latex(&omml(src)), src);
    }
}
