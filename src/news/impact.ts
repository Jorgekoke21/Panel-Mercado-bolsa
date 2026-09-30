import type { EntityLink, EventType, ImpactDirection, ImpactHypothesis } from "@/domain/news";
import type { RelationGraph } from "@/knowledge/graph";
import type { Horizon, ImpactChannel, Move, NodeKey, Relation } from "@/knowledge/types";
import { parseNodeKey } from "@/knowledge/types";
import { eventTypeDef } from "./taxonomy";
import { fold } from "./text";

/**
 * MOTOR DE IMPACTO: transforma un evento en HIPÓTESIS de impacto potencial.
 *
 *   evento ──► nodos de choque (qué se mueve y en qué sentido)
 *          ──► relaciones del grafo (mecanismo, signo, fuerza, horizonte, confianza)
 *          ──► impactos potenciales con camino explicable
 *
 * Nunca "noticia X ⇒ acción sube". Cada impacto es: relación potencial + mecanismo + dirección +
 * fuerza + horizonte + confianza + camino. Si el sentido del movimiento no está en el texto, la
 * dirección es mixed_uncertain y la confianza se reduce.
 *
 * Canales:
 *   DIRECT        la entidad es sujeto del evento (tono del titular)
 *   SECOND_ORDER  vía materia prima / insumo (petróleo ⇒ aerolíneas)
 *   MACRO         vía factor macro (tipos ⇒ promotoras inmobiliarias)
 *   SUPPLY_CHAIN  vía proveedor/cliente o exposición geográfica declarada (TSMC ⇒ NVIDIA)
 */
export interface ImpactInput {
  type: EventType;
  secondaryTypes: readonly EventType[];
  links: readonly EntityLink[];
  moves: readonly { node: NodeKey; move: Move }[];
  polarity: -1 | 0 | 1;
  confidence: number;
  /** Titulares del evento (para el sentido de los factores del tipo). */
  titles: readonly string[];
}

const MAX_DEPTH = 2;
const MAJOR_ECONOMIES = new Set<NodeKey>(["country:US", "country:CN", "country:EU", "country:JP", "country:GB", "country:DE"]);
const LOCAL_FACTORS = new Set<NodeKey>(["factor:energy_costs", "factor:inflation", "factor:interest_rates", "factor:labor_market", "factor:consumer_spending", "factor:housing", "factor:economic_growth", "factor:bond_yields", "factor:credit_spreads"]);
const MAX_IMPACTS = 16;
const HORIZON_ORDER: Horizon[] = ["days", "weeks", "months", "quarters"];
const maxHorizon = (a: Horizon, b: Horizon) => (HORIZON_ORDER.indexOf(a) >= HORIZON_ORDER.indexOf(b) ? a : b);
const round = (v: number) => Math.round(v * 1000) / 1000;

/** Sentido de los factores propios de cada tipo, según verbos explícitos en los titulares. */
const TYPE_FACTOR_RULES: { types: EventType[]; factor: NodeKey; up: RegExp; down: RegExp }[] = [
  { types: ["TRADE_TARIFFS"], factor: "factor:trade_barriers", up: /\b(impose[sd]?|new tariffs?|raise[sd]? tariffs?|hike[sd]?|threaten\w*|slap\w*|escalat\w*|retaliat\w*|trade war)\b/, down: /\b(lift\w*|remove[sd]?|cut[s]? tariffs?|truce|trade deal|agreement|exempt\w*|paus\w*|suspend\w*|delay\w*|roll ?back|ease[sd]?|lower\w* tariffs?)\b/ },
  { types: ["SANCTIONS_EXPORT_CONTROLS"], factor: "factor:export_controls", up: /\b(new|tighten\w*|expand\w*|ban\w*|restrict\w*|curb\w*|block\w*|blacklist\w*|impose[sd]?|add\w* to (?:the )?entity list)\b/, down: /\b(ease[sd]?|eases|lift\w*|loosen\w*|allow\w*|approv\w*|licen[cs]es? (?:granted|approved)|resume[sd]? sales|exempt\w*)\b/ },
  { types: ["GEOPOLITICAL_CONFLICT"], factor: "factor:geopolitical_risk", up: /\b(attack\w*|strike[sd]?|airstrikes?|invasion|invade[sd]?|missiles?|escalat\w*|troops|mobiliz\w*|blockade|seiz\w*|drone|war)\b/, down: /\b(ceasefire|cease-fire|truce|peace (?:deal|talks|agreement)|de-?escalat\w*|withdraw\w*|armistice)\b/ },
  { types: ["INFLATION"], factor: "factor:inflation", up: /\b(hotter|accelerat\w*|rises?|rose|jumps?|higher than expected|surges?|climbs?|sticky|above (?:forecasts|expectations))\b/, down: /\b(cool\w*|eases?|eased|slow\w*|lower than expected|falls?|fell|declin\w*|below (?:forecasts|expectations)|softer)\b/ },
  { types: ["EMPLOYMENT"], factor: "factor:labor_market", up: /\b(strong|stronger|beat\w*|add\w* (?:more|[0-9])|surge\w*|jobless claims (?:fall|fell|drop)|unemployment (?:falls?|fell|drops?))\b/, down: /\b(weak\w*|miss\w*|slow\w*|layoffs|jobless claims (?:rise|rose|jump)|unemployment (?:rises?|rose|jumps?|climbs?))\b/ },
  { types: ["ECONOMIC_GROWTH"], factor: "factor:economic_growth", up: /\b(grew|grows|expand\w*|accelerat\w*|beat\w*|strong\w*|rebound\w*)\b/, down: /\b(shrank|contract\w*|recession|slow\w*|miss\w*|weak\w*|declin\w*)\b/ },
  { types: ["AI_DATA_CENTERS", "CAPEX_INVESTMENT"], factor: "factor:ai_demand", up: /\b(invest\w*|build\w*|spend\w*|capex|expand\w*|orders?|deal|demand|boom|surge\w*|record)\b/, down: /\b(cut\w*|paus\w*|scal\w* back|cancel\w*|delay\w*|slow\w*|glut|bubble|overcapacity)\b/ },
  { types: ["RATES_BONDS"], factor: "factor:bond_yields", up: /\b(yields? (?:rise|rose|climb\w*|jump\w*|surge\w*|hit)|sell-?off)\b/, down: /\b(yields? (?:fall|fell|drop\w*|slid\w*|declin\w*)|bond rally)\b/ },
  { types: ["CREDIT"], factor: "factor:credit_spreads", up: /\b(default\w*|bankrupt\w*|chapter 11|widen\w*|stress|downgrad\w*)\b/, down: /\b(tighten\w*|upgrad\w*)\b/ },
  { types: ["SUPPLY_CHAIN_LOGISTICS"], factor: "factor:supply_chain_stress", up: /\b(shortage\w*|disrupt\w*|strike|clos\w*|block\w*|delay\w*|bottleneck\w*|attack\w*)\b/, down: /\b(ease[sd]?|eases|reopen\w*|resum\w*|normaliz\w*|deal)\b/ },
];

function directionFrom(move: Move, sign: 1 | -1 | 0): ImpactDirection {
  if (sign === 0 || move === "unknown" || move === "flat") return "mixed_uncertain";
  const up = move === "up";
  return (up && sign === 1) || (!up && sign === -1) ? "potential_positive" : "potential_negative";
}

function moveAfter(move: Move, sign: 1 | -1 | 0): Move {
  if (sign === 0 || move === "unknown" || move === "flat") return "unknown";
  return (move === "up") === (sign === 1) ? "up" : "down";
}

function describeMove(node: string, move: Move, label: (n: NodeKey) => string): string {
  const name = label(node as NodeKey);
  return move === "up" ? `${name} ↑` : move === "down" ? `${name} ↓` : move === "flat" ? `${name} unchanged` : `${name} (direction unclear)`;
}

function strengthOf(weight: number): 1 | 2 | 3 {
  return weight >= 0.7 ? 3 : weight >= 0.5 ? 2 : 1;
}

export function shockNodes(input: ImpactInput): { node: NodeKey; move: Move; reason: string; mentioned: boolean }[] {
  const text = fold(input.titles.join(" \n "));
  const shocks = new Map<NodeKey, { node: NodeKey; move: Move; reason: string; mentioned: boolean }>();
  for (const m of input.moves) shocks.set(m.node, { node: m.node, move: m.move, reason: "mentioned in the event", mentioned: true });
  const types = [input.type, ...input.secondaryTypes];
  for (const rule of TYPE_FACTOR_RULES) {
    if (!rule.types.some((t) => types.includes(t))) continue;
    const up = rule.up.test(text);
    const down = rule.down.test(text);
    const move: Move = up && !down ? "up" : down && !up ? "down" : "unknown";
    const current = shocks.get(rule.factor);
    if (!current || current.move === "unknown") shocks.set(rule.factor, { node: rule.factor, move, reason: `${eventTypeDef(input.type).label} event`, mentioned: current?.mentioned ?? false });
  }
  for (const t of types) for (const f of eventTypeDef(t).factors) if (!shocks.has(f)) shocks.set(f, { node: f, move: "unknown", reason: `${eventTypeDef(t).label} event`, mentioned: false });
  return [...shocks.values()];
}

export function computeImpacts(input: ImpactInput, graph: RelationGraph): ImpactHypothesis[] {
  const def = eventTypeDef(input.type);
  const label = (n: NodeKey) => graph.label(n);
  const out = new Map<NodeKey, ImpactHypothesis>();
  const add = (h: ImpactHypothesis) => {
    const current = out.get(h.target);
    // Se conserva la hipótesis más fiable; DIRECT prevalece sobre las indirectas a igual confianza.
    if (!current || h.confidence > current.confidence + 1e-9 || (Math.abs(h.confidence - current.confidence) < 1e-9 && h.channel === "DIRECT")) out.set(h.target, h);
  };

  // 1) DIRECT: entidades que son sujeto del evento (empresas, empresas externas, industrias mencionadas).
  const polarityDir: ImpactDirection = input.polarity > 0 ? "potential_positive" : input.polarity < 0 ? "potential_negative" : "mixed_uncertain";
  for (const l of input.links) {
    if (l.relation !== "DIRECT" || l.confidence < 0.6) continue;
    const kind = parseNodeKey(l.node)?.kind;
    if (kind !== "company" && kind !== "external" && kind !== "subIndustry" && kind !== "industry" && kind !== "sector") continue;
    // El tono del titular solo se aplica al SUJETO (primera empresa del titular) o a industrias mencionadas.
    const isCompany = kind === "company" || kind === "external";
    const tone = input.polarity !== 0 && (!isCompany || !!l.subject);
    add({
      target: l.node,
      channel: "DIRECT",
      direction: tone ? polarityDir : "mixed_uncertain",
      strength: strengthOf(def.weight),
      horizon: def.horizon,
      confidence: round(input.confidence * l.confidence * (tone ? 1 : 0.7)),
      mechanism: `${def.label}${tone ? (input.polarity > 0 ? " — positive headline tone" : " — negative headline tone") : " — direction not stated"}`,
      rationale: `${label(l.node)} is named in the event (${l.evidence}). Direction comes only from explicit wording in the headlines${tone ? "" : "; none was found"}.`,
      path: [l.node],
      relationIds: [],
      origin: "rule",
    });
  }

  // 2) MACRO / SECOND_ORDER: propagación desde los nodos de choque por relaciones DRIVES.
  // Factores macro LOCALES (precios de la energía, inflación, empleo…) solo se propagan a industrias del
  // universo si el evento es de EE. UU., global o de una gran economía; las materias primas (precio global) siempre.
  const countries = input.links.filter((l) => l.relation === "DIRECT" && l.node.startsWith("country:")).map((l) => l.node);
  const majorScope = countries.length === 0 || countries.some((c) => MAJOR_ECONOMIES.has(c));
  const shocks = shockNodes(input).filter((s) => majorScope || !LOCAL_FACTORS.has(s.node));
  for (const shock of shocks) {
    const knownMove = shock.move === "up" || shock.move === "down";
    // Sin sentido conocido: si el factor ni siquiera se menciona, no se propaga (evita impactos "mixtos" de relleno);
    // si se menciona, solo un salto y con confianza reducida.
    if (!knownMove && !shock.mentioned) continue;
    const maxDepth = knownMove ? MAX_DEPTH : 1;
    if (knownMove) {
      add({
        target: shock.node,
        channel: shock.node.startsWith("factor:") ? "MACRO" : "DIRECT",
        direction: shock.move === "up" ? "potential_positive" : "potential_negative",
        strength: 2,
        horizon: def.horizon,
        confidence: round(input.confidence * 0.9),
        mechanism: "stated in the event",
        rationale: `${describeMove(shock.node, shock.move, label)} — movement stated explicitly in the headlines (${shock.reason}).`,
        path: [shock.node],
        relationIds: [],
        origin: "rule",
      });
    }
    const queue: { node: NodeKey; move: Move; conf: number; strength: 1 | 2 | 3; horizon: Horizon; path: NodeKey[]; rels: Relation[] }[] = [
      { node: shock.node, move: shock.move, conf: input.confidence * (knownMove ? 1 : 0.5), strength: 3, horizon: "days", path: [shock.node], rels: [] },
    ];
    while (queue.length) {
      const cur = queue.shift();
      if (!cur || cur.rels.length >= maxDepth) continue;
      for (const r of graph.outgoing(cur.node)) {
        if (r.type !== "DRIVES" || cur.path.includes(r.to)) continue;
        const conf = cur.conf * r.confidence * (cur.rels.length > 0 ? 0.85 : 1);
        if (conf < 0.12) continue;
        const direction = directionFrom(cur.move, r.sign);
        const strength = Math.min(cur.strength, r.strength) as 1 | 2 | 3;
        const horizon = maxHorizon(cur.horizon, r.horizon);
        const path = [...cur.path, r.to];
        const rels = [...cur.rels, r];
        const channel: ImpactChannel = rels[0]?.channel ?? r.channel;
        add({
          target: r.to,
          channel,
          direction,
          strength,
          horizon,
          confidence: round(conf),
          mechanism: r.mechanism ? r.mechanism.replace(/_/g, " ") : r.type.toLowerCase(),
          rationale: `${describeMove(shock.node, shock.move, label)} (${shock.reason}) → ${rels.map((x) => `${label(x.to)}: ${x.rationale}`).join(" → ")}`,
          path,
          relationIds: rels.map((x) => x.id),
          origin: "rule",
        });
        queue.push({ node: r.to, move: moveAfter(cur.move, r.sign), conf, strength, horizon, path, rels });
      }
    }
  }

  // 3) SUPPLY_CHAIN: proveedores/clientes y exposición declarada de las entidades del evento.
  // Solo tipos con efecto operativo/de demanda (una emisión de deuda de AMD no afecta a TSMC).
  const supplyTypes: EventType[] = ["EARNINGS", "GUIDANCE", "PRODUCT_TECHNOLOGY", "CAPEX_INVESTMENT", "CONTRACT_PARTNERSHIP", "SUPPLY_CHAIN_LOGISTICS", "SANCTIONS_EXPORT_CONTROLS", "GEOPOLITICAL_CONFLICT", "NATURAL_DISASTER_CLIMATE", "CYBERSECURITY", "WORKFORCE", "AI_DATA_CENTERS", "SEMICONDUCTORS"];
  const supplyRelevant = [input.type, ...input.secondaryTypes].some((t) => supplyTypes.includes(t));
  const subjects = supplyRelevant ? input.links.filter((l) => l.relation === "DIRECT" && (l.node.startsWith("company:") || l.node.startsWith("external:")) && l.confidence >= 0.6) : [];
  for (const s of subjects) {
    for (const r of graph.outgoing(s.node)) {
      if (r.type !== "SUPPLIES" || input.polarity >= 0) continue;
      // Problema en el proveedor ⇒ riesgo para el cliente; buenas noticias del proveedor ⇒ ambiguas para el cliente.
      const direction: ImpactDirection = input.polarity < 0 ? "potential_negative" : "mixed_uncertain";
      add({ target: r.to, channel: "SUPPLY_CHAIN", direction, strength: r.strength, horizon: r.horizon, confidence: round(input.confidence * s.confidence * r.confidence * 0.8), mechanism: "supplier dependency", rationale: `${label(s.node)} supplies ${label(r.to)}: ${r.rationale} (${r.evidence.ref ?? r.evidence.kind})`, path: [s.node, r.to], relationIds: [r.id], origin: "rule" });
    }
    for (const r of graph.incoming(s.node)) {
      if (r.type !== "SUPPLIES" || input.polarity === 0) continue;
      // Noticias de demanda del cliente se trasladan a sus proveedores en el mismo sentido.
      const direction: ImpactDirection = input.polarity > 0 ? "potential_positive" : input.polarity < 0 ? "potential_negative" : "mixed_uncertain";
      add({ target: r.from, channel: "SUPPLY_CHAIN", direction, strength: Math.min(r.strength, 2) as 1 | 2, horizon: r.horizon, confidence: round(input.confidence * s.confidence * r.confidence * 0.7), mechanism: "customer demand", rationale: `${label(r.from)} supplies ${label(s.node)}: ${r.rationale} (${r.evidence.ref ?? r.evidence.kind})`, path: [s.node, r.from], relationIds: [r.id], origin: "rule" });
    }
  }
  // Exposición geográfica: eventos de conflicto, sanciones o comercio que afectan a un país.
  if (["GEOPOLITICAL_CONFLICT", "SANCTIONS_EXPORT_CONTROLS", "TRADE_TARIFFS", "NATURAL_DISASTER_CLIMATE"].includes(input.type)) {
    const countries = input.links.filter((l) => l.relation === "DIRECT" && l.node.startsWith("country:") && l.confidence >= 0.6);
    for (const c of countries) {
      for (const r of graph.incoming(c.node)) {
        if (r.type !== "EXPOSED_TO") continue;
        add({ target: r.from, channel: "SUPPLY_CHAIN", direction: "mixed_uncertain", strength: r.strength, horizon: r.horizon, confidence: round(input.confidence * c.confidence * r.confidence * 0.7), mechanism: "geographic exposure", rationale: `${label(r.from)} has material exposure to ${label(c.node)}: ${r.rationale} (${r.evidence.ref ?? r.evidence.kind})`, path: [c.node, r.from], relationIds: [r.id], origin: "rule" });
      }
    }
  }

  return [...out.values()].sort((a, b) => b.confidence * b.strength - a.confidence * a.strength || a.target.localeCompare(b.target)).slice(0, MAX_IMPACTS);
}

/** Etiqueta de dirección para factores y materias primas (presión al alza/baja, no "positivo"). */
export function directionLabel(target: string, direction: ImpactDirection): string {
  const isDriver = target.startsWith("factor:") || target.startsWith("commodity:");
  if (isDriver) return direction === "potential_positive" ? "Potential upward pressure" : direction === "potential_negative" ? "Potential downward pressure" : "Unclear direction";
  return direction === "potential_positive" ? "Potential positive" : direction === "potential_negative" ? "Potential negative" : "Mixed / uncertain";
}
