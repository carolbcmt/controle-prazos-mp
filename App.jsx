import { useState, useEffect, useMemo } from "react";
import {
  Calendar, Plus, Trash2, Pencil, ExternalLink, AlertTriangle,
  CheckCircle2, ChevronDown, ChevronUp, X, FolderOpen, Gavel
} from "lucide-react";

// ----------------------------------------------------------------
// Feriados padrão - Várzea Grande / MT - 2026
// ----------------------------------------------------------------
const FERIADOS_PADRAO = [
  { data: "2026-01-01", desc: "Confraternização Universal" },
  { data: "2026-02-16", desc: "Carnaval" },
  { data: "2026-02-17", desc: "Carnaval" },
  { data: "2026-02-18", desc: "Quarta-feira de Cinzas (facultativo até 12h)" },
  { data: "2026-04-03", desc: "Paixão de Cristo" },
  { data: "2026-04-21", desc: "Tiradentes" },
  { data: "2026-05-01", desc: "Dia do Trabalho" },
  { data: "2026-05-15", desc: "Aniversário de Várzea Grande" },
  { data: "2026-06-04", desc: "Corpus Christi" },
  { data: "2026-09-07", desc: "Independência do Brasil" },
  { data: "2026-10-12", desc: "Nossa Senhora Aparecida" },
  { data: "2026-10-28", desc: "Dia do Servidor Público (facultativo)" },
  { data: "2026-11-02", desc: "Finados" },
  { data: "2026-11-15", desc: "Proclamação da República" },
  { data: "2026-11-20", desc: "Consciência Negra" },
  { data: "2026-12-08", desc: "Imaculada Conceição" },
  { data: "2026-12-24", desc: "Véspera de Natal (facultativo)" },
  { data: "2026-12-25", desc: "Natal" },
  { data: "2026-12-31", desc: "Véspera de Ano Novo (facultativo)" },
];

const STATUS_OPCOES = [
  "Pendente",
  "CI Enviada",
  "Aguardando resposta da Secretaria",
  "Reiterado - Pedido de Dilação",
  "Respondido",
  "Arquivado",
];

const PROMOTORIA_EXEMPLOS = [
  "1ª PJ Cível - Várzea Grande", "2ª PJ Cível - Várzea Grande", "3ª PJ Cível - Várzea Grande",
  "4ª PJ Cível - Várzea Grande", "5ª PJ Cível - Várzea Grande", "6ª PJ Cível - Várzea Grande",
  "36ª PJ Cível - Cuiabá", "Procuradoria Regional do Trabalho 23ª Região - Cuiabá",
  "Procuradoria da República em Mato Grosso",
];

// ----------------------------------------------------------------
// Funções de data
// ----------------------------------------------------------------
function parseISO(s) {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function addDays(d, n) {
  const nd = new Date(d);
  nd.setDate(nd.getDate() + n);
  return nd;
}
function isWeekend(d) {
  const wd = d.getDay();
  return wd === 0 || wd === 6;
}
function isBusinessDay(d, feriadosSet) {
  return !isWeekend(d) && !feriadosSet.has(toISO(d));
}
function nextBusinessDay(d, feriadosSet) {
  let nd = addDays(d, 1);
  while (!isBusinessDay(nd, feriadosSet)) nd = addDays(nd, 1);
  return nd;
}
function diffDias(a, b) {
  return Math.round((b - a) / 86400000);
}
function formatBR(d) {
  if (!d) return "—";
  return d.toLocaleDateString("pt-BR");
}
function hojeMidnight() {
  const h = new Date();
  h.setHours(0, 0, 0, 0);
  return h;
}

// ----------------------------------------------------------------
// Cálculo de prazo / alerta
// ----------------------------------------------------------------
function calcular(processo, feriadosSet, hoje) {
  const dataEntrada = parseISO(processo.dataEntrada);
  let inicio = null, vencimento = null;
  if (dataEntrada) {
    inicio = nextBusinessDay(dataEntrada, feriadosSet);
    if (processo.prazoDias) {
      let rawEnd = addDays(inicio, Number(processo.prazoDias) - 1);
      vencimento = isBusinessDay(rawEnd, feriadosSet) ? rawEnd : nextBusinessDay(rawEnd, feriadosSet);
    }
  }

  let alertaPrazo = { label: "—", nivel: "neutro" };
  if (processo.status === "Respondido" || processo.status === "Arquivado") {
    alertaPrazo = { label: processo.status === "Respondido" ? "Respondido" : "Arquivado", nivel: "ok" };
  } else if (vencimento) {
    const d = diffDias(hoje, vencimento);
    if (d < 0) alertaPrazo = { label: "Prazo esgotado", nivel: "esgotado" };
    else if (d === 0) alertaPrazo = { label: "Prazo hoje", nivel: "hoje" };
    else if (d === 1) alertaPrazo = { label: "Vence amanhã", nivel: "amanha" };
    else if (d === 2) alertaPrazo = { label: "Vence em 2 dias", nivel: "doisdias" };
    else alertaPrazo = { label: "No prazo", nivel: "ok2" };
  }

  let alertaAudiencia = null;
  const dataAudiencia = parseISO(processo.dataAudiencia);
  if (dataAudiencia) {
    const d = diffDias(hoje, dataAudiencia);
    if (d < 0) alertaAudiencia = { label: "Audiência já ocorreu", nivel: "ok" };
    else if (d === 0) alertaAudiencia = { label: "Audiência hoje", nivel: "hoje" };
    else if (d === 1) alertaAudiencia = { label: "Audiência amanhã", nivel: "amanha" };
    else if (d === 2) alertaAudiencia = { label: "Audiência em 2 dias", nivel: "doisdias" };
    else alertaAudiencia = { label: "Agendada", nivel: "ok2" };
  }

  return { inicio, vencimento, alertaPrazo, alertaAudiencia };
}

const PRIORIDADE = { esgotado: 0, hoje: 1, amanha: 2, doisdias: 3, ok2: 4, neutro: 5, ok: 6 };

// ----------------------------------------------------------------
// Link "Adicionar ao Google Agenda"
// ----------------------------------------------------------------
function linkGoogleAgenda(titulo, data, detalhes) {
  const start = toISO(data).replace(/-/g, "");
  const end = toISO(addDays(data, 1)).replace(/-/g, "");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: titulo,
    dates: `${start}/${end}`,
    details: detalhes,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// ----------------------------------------------------------------
// Estilo dos selos de alerta
// ----------------------------------------------------------------
const SELO_ESTILOS = {
  esgotado: { bg: "#FBE3E0", border: "#C0392B", text: "#9A2E22" },
  hoje: { bg: "#FBE3E0", border: "#C0392B", text: "#9A2E22" },
  amanha: { bg: "#FCEBD8", border: "#D9822B", text: "#A6611F" },
  doisdias: { bg: "#FBF3D6", border: "#D4A72C", text: "#9A7E1A" },
  ok2: { bg: "#E9EFE9", border: "#8FA98F", text: "#56705A" },
  ok: { bg: "#DFEEE3", border: "#4F9E6E", text: "#3A7A52" },
  neutro: { bg: "#EFEDE8", border: "#B9B4AC", text: "#7A7468" },
};

function Selo({ alerta }) {
  const s = SELO_ESTILOS[alerta.nivel] || SELO_ESTILOS.neutro;
  const destaque = alerta.nivel === "esgotado" || alerta.nivel === "hoje";
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold uppercase tracking-wide border"
      style={{
        background: s.bg,
        borderColor: s.border,
        color: s.text,
        letterSpacing: "0.04em",
        transform: destaque ? "rotate(-1.5deg)" : "none",
      }}
    >
      {(alerta.nivel === "esgotado" || alerta.nivel === "hoje") && <AlertTriangle size={13} />}
      {alerta.nivel === "ok" && <CheckCircle2 size={13} />}
      {alerta.label}
    </span>
  );
}

// ----------------------------------------------------------------
// Formulário de processo
// ----------------------------------------------------------------
const VAZIO = {
  simp: "", promotoria: "", dataEntrada: "", assunto: "", prazoDias: "",
  status: "Pendente", dataCI: "", secretariaCI: "", dataResposta: "",
  dataAudiencia: "", linkDrive: "", observacoes: "",
};

function Formulario({ inicial, onSalvar, onCancelar }) {
  const [form, setForm] = useState(inicial || VAZIO);
  const set = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-2xl sm:rounded-xl rounded-t-xl max-h-[92vh] overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "#E6E1D8" }}>
          <h2 className="text-lg font-semibold" style={{ color: "#1E3A5F" }}>
            {inicial ? "Editar processo" : "Novo processo"}
          </h2>
          <button onClick={onCancelar} className="text-gray-400 hover:text-gray-600">
            <X size={22} />
          </button>
        </div>

        <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "#5A5650" }}>Nº SIMP / IC</label>
            <input value={form.simp} onChange={set("simp")} placeholder="Ex.: SIMP 123456/2026"
              className="w-full border rounded-lg px-3 py-2 text-sm font-mono" style={{ borderColor: "#D8D2C6" }} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "#5A5650" }}>Promotoria / Órgão de origem</label>
            <input value={form.promotoria} onChange={set("promotoria")} placeholder="Ex.: 1ª PJ Cível - Várzea Grande"
              list="promotorias" className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: "#D8D2C6" }} />
            <datalist id="promotorias">
              {PROMOTORIA_EXEMPLOS.map((p) => <option key={p} value={p} />)}
            </datalist>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium mb-1" style={{ color: "#5A5650" }}>Assunto (resumo do pedido)</label>
            <textarea value={form.assunto} onChange={set("assunto")} rows={2}
              className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: "#D8D2C6" }} />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "#5A5650" }}>Data de entrada (e-mail/recebimento)</label>
            <input type="date" value={form.dataEntrada} onChange={set("dataEntrada")}
              className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: "#D8D2C6" }} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "#5A5650" }}>Prazo (dias corridos)</label>
            <input type="number" min="0" value={form.prazoDias} onChange={set("prazoDias")}
              className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: "#D8D2C6" }} />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "#5A5650" }}>Status</label>
            <select value={form.status} onChange={set("status")}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white" style={{ borderColor: "#D8D2C6" }}>
              {STATUS_OPCOES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "#5A5650" }}>Data da audiência (se houver)</label>
            <input type="date" value={form.dataAudiencia} onChange={set("dataAudiencia")}
              className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: "#D8D2C6" }} />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "#5A5650" }}>Data de envio da CI</label>
            <input type="date" value={form.dataCI} onChange={set("dataCI")}
              className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: "#D8D2C6" }} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "#5A5650" }}>Secretaria / Órgão (destino da CI)</label>
            <input value={form.secretariaCI} onChange={set("secretariaCI")}
              className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: "#D8D2C6" }} />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "#5A5650" }}>Data da resposta / Ofício PGM</label>
            <input type="date" value={form.dataResposta} onChange={set("dataResposta")}
              className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: "#D8D2C6" }} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "#5A5650" }}>Link da documentação (Google Drive)</label>
            <input value={form.linkDrive} onChange={set("linkDrive")} placeholder="https://drive.google.com/..."
              className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: "#D8D2C6" }} />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium mb-1" style={{ color: "#5A5650" }}>Observações / Andamento</label>
            <textarea value={form.observacoes} onChange={set("observacoes")} rows={3}
              className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: "#D8D2C6" }} />
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t" style={{ borderColor: "#E6E1D8" }}>
          <button onClick={onCancelar} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ color: "#5A5650" }}>
            Cancelar
          </button>
          <button
            onClick={() => onSalvar(form)}
            disabled={!form.simp || !form.dataEntrada || !form.prazoDias}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40"
            style={{ background: "#1E3A5F" }}
          >
            Salvar processo
          </button>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------
// Cartão do painel (contadores)
// ----------------------------------------------------------------
function CartaoContador({ label, valor, nivel }) {
  const s = SELO_ESTILOS[nivel] || SELO_ESTILOS.neutro;
  return (
    <div className="rounded-xl border px-4 py-3 flex flex-col gap-1" style={{ borderColor: s.border, background: s.bg }}>
      <span className="text-2xl font-bold" style={{ color: s.text, fontFamily: "'IBM Plex Mono', monospace" }}>{valor}</span>
      <span className="text-xs font-medium uppercase tracking-wide" style={{ color: s.text }}>{label}</span>
    </div>
  );
}

// ----------------------------------------------------------------
// App principal
// ----------------------------------------------------------------
export default function App() {
  const [processos, setProcessos] = useState([]);
  const [feriadosExtra, setFeriadosExtra] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erroStorage, setErroStorage] = useState(false);
  const [editando, setEditando] = useState(null); // null | {} (novo) | objeto existente
  const [filtro, setFiltro] = useState("ativos");
  const [mostraFeriados, setMostraFeriados] = useState(false);
  const [novoFeriado, setNovoFeriado] = useState({ data: "", desc: "" });

  useEffect(() => {
    try {
      const raw = localStorage.getItem("processos_mp");
      if (raw) setProcessos(JSON.parse(raw));
    } catch (e) { /* nenhum dado salvo ainda */ }
    try {
      const raw2 = localStorage.getItem("feriados_extra_mp");
      if (raw2) setFeriadosExtra(JSON.parse(raw2));
    } catch (e) { /* nenhum dado salvo ainda */ }
    setCarregando(false);
  }, []);

  const salvarProcessos = (lista) => {
    setProcessos(lista);
    try {
      localStorage.setItem("processos_mp", JSON.stringify(lista));
      setErroStorage(false);
    } catch (e) { setErroStorage(true); }
  };

  const salvarFeriadosExtra = (lista) => {
    setFeriadosExtra(lista);
    try { localStorage.setItem("feriados_extra_mp", JSON.stringify(lista)); } catch (e) {}
  };

  const feriadosSet = useMemo(() => {
    const todos = [...FERIADOS_PADRAO, ...feriadosExtra].map((f) => f.data);
    return new Set(todos);
  }, [feriadosExtra]);

  const hoje = useMemo(() => hojeMidnight(), []);

  const linhas = useMemo(() => {
    return processos.map((p) => ({ ...p, _calc: calcular(p, feriadosSet, hoje) }));
  }, [processos, feriadosSet, hoje]);

  const contadores = useMemo(() => {
    const c = { esgotado: 0, hoje: 0, amanha: 0, doisdias: 0, respondidos: 0, total: linhas.length,
      audHoje: 0, audAmanha: 0, audDoisdias: 0 };
    for (const l of linhas) {
      const niv = l._calc.alertaPrazo.nivel;
      if (niv === "esgotado") c.esgotado++;
      if (niv === "hoje") c.hoje++;
      if (niv === "amanha") c.amanha++;
      if (niv === "doisdias") c.doisdias++;
      if (l.status === "Respondido") c.respondidos++;
      const a = l._calc.alertaAudiencia;
      if (a) {
        if (a.nivel === "hoje") c.audHoje++;
        if (a.nivel === "amanha") c.audAmanha++;
        if (a.nivel === "doisdias") c.audDoisdias++;
      }
    }
    return c;
  }, [linhas]);

  const filtradas = useMemo(() => {
    let f = linhas;
    if (filtro === "ativos") f = f.filter((l) => l.status !== "Respondido" && l.status !== "Arquivado");
    else if (filtro === "urgentes") f = f.filter((l) => ["esgotado", "hoje", "amanha", "doisdias"].includes(l._calc.alertaPrazo.nivel));
    else if (filtro === "respondidos") f = f.filter((l) => l.status === "Respondido");
    else if (filtro === "arquivados") f = f.filter((l) => l.status === "Arquivado");

    return [...f].sort((a, b) => {
      const pa = PRIORIDADE[a._calc.alertaPrazo.nivel];
      const pb = PRIORIDADE[b._calc.alertaPrazo.nivel];
      if (pa !== pb) return pa - pb;
      const va = a._calc.vencimento ? a._calc.vencimento.getTime() : Infinity;
      const vb = b._calc.vencimento ? b._calc.vencimento.getTime() : Infinity;
      return va - vb;
    });
  }, [linhas, filtro]);

  const handleSalvarForm = (form) => {
    if (form.id) {
      salvarProcessos(processos.map((p) => (p.id === form.id ? form : p)));
    } else {
      salvarProcessos([...processos, { ...form, id: Date.now().toString() }]);
    }
    setEditando(null);
  };

  const handleExcluir = (id) => {
    salvarProcessos(processos.filter((p) => p.id !== id));
  };

  const adicionarFeriado = () => {
    if (!novoFeriado.data) return;
    salvarFeriadosExtra([...feriadosExtra, { ...novoFeriado, desc: novoFeriado.desc || "Feriado adicionado" }]);
    setNovoFeriado({ data: "", desc: "" });
  };
  const removerFeriadoExtra = (data) => {
    salvarFeriadosExtra(feriadosExtra.filter((f) => f.data !== data));
  };

  const feriadosTodos = useMemo(() => {
    return [...FERIADOS_PADRAO, ...feriadosExtra].sort((a, b) => a.data.localeCompare(b.data));
  }, [feriadosExtra]);

  if (carregando) {
    return <div className="p-8 text-center text-sm" style={{ color: "#8C8780" }}>Carregando...</div>;
  }

  return (
    <div className="min-h-screen pb-16" style={{ background: "#F7F5F0", fontFamily: "'Inter', system-ui, sans-serif", color: "#2B2B2B" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');
        .pgm-card { transition: box-shadow .15s ease, transform .15s ease; }
        .pgm-card:hover { box-shadow: 0 4px 16px rgba(30,58,95,0.08); }
        .pgm-btn { transition: opacity .15s ease; }
        .pgm-btn:hover { opacity: .8; }
      `}</style>

      {/* Cabeçalho */}
      <header className="px-4 sm:px-8 pt-6 pb-4" style={{ background: "#1E3A5F" }}>
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Gavel size={26} color="#F7F5F0" />
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white">Controle de Prazos — MP / PGM-VG</h1>
            <p className="text-sm" style={{ color: "#B7C4D6" }}>
              Hoje é {hoje.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-8 -mt-3">
        {erroStorage && (
          <div className="mt-4 rounded-lg border px-4 py-2 text-sm" style={{ borderColor: "#C0392B", background: "#FBE3E0", color: "#9A2E22" }}>
            Não foi possível salvar os dados neste navegador (verifique se a navegação anônima/privada está desativada). Suas alterações podem não ter sido salvas.
          </div>
        )}

        {/* Painel de contadores */}
        <section className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <CartaoContador label="Prazos esgotados" valor={contadores.esgotado} nivel="esgotado" />
          <CartaoContador label="Vence hoje" valor={contadores.hoje} nivel="hoje" />
          <CartaoContador label="Vence amanhã" valor={contadores.amanha} nivel="amanha" />
          <CartaoContador label="Vence em 2 dias" valor={contadores.doisdias} nivel="doisdias" />
        </section>
        {(contadores.audHoje + contadores.audAmanha + contadores.audDoisdias) > 0 && (
          <section className="mt-3 grid grid-cols-3 gap-3">
            <CartaoContador label="Audiência hoje" valor={contadores.audHoje} nivel="hoje" />
            <CartaoContador label="Audiência amanhã" valor={contadores.audAmanha} nivel="amanha" />
            <CartaoContador label="Audiência em 2 dias" valor={contadores.audDoisdias} nivel="doisdias" />
          </section>
        )}

        {/* Controles */}
        <section className="mt-5 flex flex-wrap items-center gap-2">
          {[
            ["ativos", "Em aberto"],
            ["urgentes", "Urgentes"],
            ["todos", "Todos"],
            ["respondidos", "Respondidos"],
            ["arquivados", "Arquivados"],
          ].map(([k, label]) => (
            <button
              key={k}
              onClick={() => setFiltro(k)}
              className="text-sm px-3 py-1.5 rounded-full border font-medium pgm-btn"
              style={filtro === k
                ? { background: "#1E3A5F", color: "white", borderColor: "#1E3A5F" }
                : { background: "white", color: "#5A5650", borderColor: "#D8D2C6" }}
            >
              {label}
            </button>
          ))}
          <button
            onClick={() => setEditando({})}
            className="ml-auto inline-flex items-center gap-1.5 text-sm px-3.5 py-1.5 rounded-full font-semibold text-white pgm-btn"
            style={{ background: "#C0392B" }}
          >
            <Plus size={16} /> Novo processo
          </button>
        </section>

        {/* Lista de processos */}
        <section className="mt-4 space-y-3">
          {filtradas.length === 0 && (
            <div className="text-center text-sm py-12 rounded-xl border" style={{ borderColor: "#E6E1D8", color: "#8C8780", background: "white" }}>
              Nenhum processo nesta visualização.{filtro === "ativos" && " Clique em \"Novo processo\" para cadastrar o primeiro."}
            </div>
          )}
          {filtradas.map((p) => {
            const c = p._calc;
            return (
              <div key={p.id} className="pgm-card bg-white rounded-xl border p-4" style={{ borderColor: "#E6E1D8" }}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold" style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#1E3A5F" }}>
                      {p.simp}
                    </div>
                    <div className="text-sm text-gray-600">{p.promotoria}</div>
                  </div>
                  <Selo alerta={c.alertaPrazo} />
                </div>

                {p.assunto && <p className="text-sm mt-2" style={{ color: "#3F3B35" }}>{p.assunto}</p>}

                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div>
                    <div className="text-gray-400 uppercase tracking-wide">Entrada</div>
                    <div className="font-medium" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{formatBR(parseISO(p.dataEntrada))}</div>
                  </div>
                  <div>
                    <div className="text-gray-400 uppercase tracking-wide">Início contagem</div>
                    <div className="font-medium" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{formatBR(c.inicio)}</div>
                  </div>
                  <div>
                    <div className="text-gray-400 uppercase tracking-wide">Vencimento</div>
                    <div className="font-medium" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{formatBR(c.vencimento)}</div>
                  </div>
                  <div>
                    <div className="text-gray-400 uppercase tracking-wide">Status</div>
                    <div className="font-medium">{p.status}</div>
                  </div>
                </div>

                {p.dataAudiencia && (
                  <div className="mt-2 flex items-center gap-2 text-xs">
                    <span className="text-gray-400 uppercase tracking-wide">Audiência</span>
                    <span className="font-medium" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{formatBR(parseISO(p.dataAudiencia))}</span>
                    {c.alertaAudiencia && <Selo alerta={c.alertaAudiencia} />}
                  </div>
                )}

                {p.observacoes && (
                  <p className="mt-2 text-xs italic" style={{ color: "#8C8780" }}>{p.observacoes}</p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2 pt-3 border-t" style={{ borderColor: "#F0ECE3" }}>
                  {c.vencimento && (
                    <a href={linkGoogleAgenda(
                      `[PRAZO MP] ${p.simp} - ${p.promotoria}`,
                      c.vencimento,
                      `Assunto: ${p.assunto || "-"}\nStatus: ${p.status}\n\nLembrete: ao salvar, adicione também uma notificação para 2 dias antes (use "Adicionar notificação" no evento).`
                    )} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border font-medium pgm-btn"
                      style={{ borderColor: "#D8D2C6", color: "#1E3A5F" }}>
                      <Calendar size={13} /> Prazo na Agenda
                    </a>
                  )}
                  {parseISO(p.dataAudiencia) && (
                    <a href={linkGoogleAgenda(
                      `[AUDIÊNCIA] ${p.simp} - ${p.promotoria}`,
                      parseISO(p.dataAudiencia),
                      `Assunto: ${p.assunto || "-"}\n\nLembrete: ao salvar, adicione também uma notificação para 2 dias antes.`
                    )} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border font-medium pgm-btn"
                      style={{ borderColor: "#D8D2C6", color: "#1E3A5F" }}>
                      <Calendar size={13} /> Audiência na Agenda
                    </a>
                  )}
                  {p.linkDrive && (
                    <a href={p.linkDrive} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border font-medium pgm-btn"
                      style={{ borderColor: "#D8D2C6", color: "#1E3A5F" }}>
                      <FolderOpen size={13} /> Documentação <ExternalLink size={11} />
                    </a>
                  )}
                  <button onClick={() => { const { _calc, ...limpo } = p; setEditando(limpo); }}
                    className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border font-medium pgm-btn"
                    style={{ borderColor: "#D8D2C6", color: "#5A5650" }}>
                    <Pencil size={13} /> Editar
                  </button>
                  <button onClick={() => handleExcluir(p.id)}
                    className="ml-auto inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md font-medium pgm-btn"
                    style={{ color: "#C0392B" }}>
                    <Trash2 size={13} /> Excluir
                  </button>
                </div>
              </div>
            );
          })}
        </section>

        {/* Feriados considerados */}
        <section className="mt-6">
          <button onClick={() => setMostraFeriados((v) => !v)}
            className="flex items-center gap-1 text-sm font-medium" style={{ color: "#1E3A5F" }}>
            {mostraFeriados ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            Feriados considerados no cálculo ({feriadosTodos.length})
          </button>
          {mostraFeriados && (
            <div className="mt-3 bg-white rounded-xl border p-4" style={{ borderColor: "#E6E1D8" }}>
              <p className="text-xs mb-3" style={{ color: "#8C8780" }}>
                Lista de dias não úteis usada para calcular o início da contagem e o vencimento dos prazos.
                A lista padrão cobre Várzea Grande/MT em 2026. Adicione abaixo os feriados de anos futuros
                ou de outras comarcas, se necessário.
              </p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-sm mb-3">
                {feriadosTodos.map((f) => {
                  const extra = feriadosExtra.some((e) => e.data === f.data);
                  return (
                    <li key={f.data} className="flex items-center justify-between gap-2 px-2 py-1 rounded" style={{ background: "#F7F5F0" }}>
                      <span><span className="font-mono font-medium">{formatBR(parseISO(f.data))}</span> — {f.desc}</span>
                      {extra && (
                        <button onClick={() => removerFeriadoExtra(f.data)} className="text-xs" style={{ color: "#C0392B" }}>
                          remover
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: "#5A5650" }}>Data</label>
                  <input type="date" value={novoFeriado.data} onChange={(e) => setNovoFeriado((f) => ({ ...f, data: e.target.value }))}
                    className="border rounded-lg px-2 py-1.5 text-sm" style={{ borderColor: "#D8D2C6" }} />
                </div>
                <div className="flex-1 min-w-[160px]">
                  <label className="block text-xs font-medium mb-1" style={{ color: "#5A5650" }}>Descrição</label>
                  <input value={novoFeriado.desc} onChange={(e) => setNovoFeriado((f) => ({ ...f, desc: e.target.value }))}
                    placeholder="Ex.: Feriado municipal de Cuiabá"
                    className="w-full border rounded-lg px-2 py-1.5 text-sm" style={{ borderColor: "#D8D2C6" }} />
                </div>
                <button onClick={adicionarFeriado}
                  className="text-sm px-3 py-1.5 rounded-lg font-semibold text-white pgm-btn" style={{ background: "#1E3A5F" }}>
                  Adicionar
                </button>
              </div>
            </div>
          )}
        </section>

        <p className="mt-8 text-xs text-center" style={{ color: "#B0AAA0" }}>
          Ferramenta de apoio. Confirme sempre os prazos oficiais junto ao MP/Promotoria e ao calendário forense.
          Os dados ficam salvos automaticamente neste navegador/conta.
        </p>
      </main>

      {editando !== null && (
        <Formulario
          inicial={editando.id ? editando : null}
          onSalvar={handleSalvarForm}
          onCancelar={() => setEditando(null)}
        />
      )}
    </div>
  );
}
