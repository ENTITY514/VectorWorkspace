//! Разбор XML в дерево узлов с отброшенными пространствами имён.
//! Общий каркас для OMML (`omml.rs`) и чтения docx (`docx_read.rs`).

use quick_xml::events::{BytesStart, Event};
use quick_xml::reader::Reader;

/// Узел дерева: локальное имя (без префикса), атрибут `*:val`,
/// дочерние узлы и текст (содержимое `t`/`w:t`).
#[derive(Debug, Clone)]
pub(crate) struct XNode {
    pub(crate) name: String,
    pub(crate) val: Option<String>,
    pub(crate) children: Vec<XNode>,
    pub(crate) text: String,
}

impl XNode {
    pub(crate) fn new(name: String, val: Option<String>) -> Self {
        XNode {
            name,
            val,
            children: Vec::new(),
            text: String::new(),
        }
    }

    /// Первый прямой потомок с данным локальным именем.
    pub(crate) fn child(&self, name: &str) -> Option<&XNode> {
        self.children.iter().find(|c| c.name == name)
    }

    /// Значение `*:val` внутри свойства, например `prop("fPr", "type")`.
    pub(crate) fn prop(&self, pr: &str, name: &str) -> Option<&str> {
        self.child(pr)?.child(name)?.val.as_deref()
    }

    /// Все прямые потомки с данным локальным именем.
    pub(crate) fn children_named<'a>(&'a self, name: &'a str) -> impl Iterator<Item = &'a XNode> {
        self.children.iter().filter(move |c| c.name == name)
    }
}

/// Локальное имя тега: часть после двоеточия.
pub(crate) fn local_name(name: &[u8]) -> String {
    let s = String::from_utf8_lossy(name);
    match s.find(':') {
        Some(i) => s[i + 1..].to_string(),
        None => s.into_owned(),
    }
}

/// Первый атрибут `*:val` (`w:val`, `m:val`, `val`).
pub(crate) fn attr_val(e: &BytesStart) -> Option<String> {
    for attr in e.attributes().with_checks(false) {
        let Ok(a) = attr else { continue };
        let key = String::from_utf8_lossy(a.key.as_ref());
        if key == "m:val" || key.ends_with(":val") {
            return Some(String::from_utf8_lossy(a.value.as_ref()).into_owned());
        }
    }
    None
}

/// Один проход quick-xml → дерево узлов.
pub(crate) fn build_tree(xml: &str) -> Vec<XNode> {
    let mut reader = Reader::from_str(xml);
    let mut buf = Vec::new();
    let mut stack: Vec<XNode> = Vec::new();
    let mut roots: Vec<XNode> = Vec::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Eof) => break,
            Ok(Event::Start(e)) => {
                stack.push(XNode::new(local_name(e.name().as_ref()), attr_val(&e)));
            }
            Ok(Event::End(_)) => {
                if let Some(node) = stack.pop() {
                    match stack.last_mut() {
                        Some(parent) => parent.children.push(node),
                        None => roots.push(node),
                    }
                }
            }
            Ok(Event::Empty(e)) => {
                let node = XNode::new(local_name(e.name().as_ref()), attr_val(&e));
                match stack.last_mut() {
                    Some(parent) => parent.children.push(node),
                    None => roots.push(node),
                }
            }
            Ok(Event::Text(e)) => {
                let t = e.unescape().map(|c| c.into_owned()).unwrap_or_default();
                if let Some(top) = stack.last_mut() {
                    // пробелы сохраняются только внутри текстовых узлов
                    if top.name == "t" || !t.trim().is_empty() {
                        top.text.push_str(&t);
                    }
                }
            }
            Ok(Event::CData(e)) => {
                if let Some(top) = stack.last_mut() {
                    top.text
                        .push_str(&String::from_utf8_lossy(e.as_ref()).into_owned());
                }
            }
            Ok(_) => {}
            Err(_) => break,
        }
        buf.clear();
    }
    roots
}
