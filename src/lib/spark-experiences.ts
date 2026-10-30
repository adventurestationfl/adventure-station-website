import type { SparkIdea } from './spark';
import type { SparkSource } from './spark-sources';
import type { ActivityTopic } from './activity-topics';
type Idea = Omit<SparkIdea, 'id' | 'createdAt'>;
type Plan = {
  id: string;
  tags: ActivityTopic[];
  match: RegExp;
  en: readonly string[];
  es: readonly string[];
};
// Original activity mechanisms form the non-model fallback vocabulary.
// The owner still reviews suitability; this is not a safety certification.
// Research never supplies copied instructions. This is deliberately bounded:
// a new source cannot manufacture novelty by renaming the same mechanism.
const plans: readonly Plan[] = [
  {
    id: 'sponge-water-transfer',
    tags: ['sensory', 'experiments', 'mixed'],
    match: /water|rain|ocean|weather|absorb/i,
    en: [
      'Squeeze, predict, compare',
      'Explore how large sponges take up and release shallow water. Predict which transfer will leave more water in a wide tray, test together and compare the visible results.',
      'Large clean sponges, shallow wide trays, water and reusable large towels.',
      'Set trays on a stable low table with only a shallow layer of water. Provide a dry observation station.',
      'Predict a transfer, compress a sponge, release it in water, move it over the second tray and squeeze. Compare gentle and firm squeezes, then invent a cooperative transfer challenge.',
    ],
    es: [
      'Aprieta, predice y compara',
      'Exploren cómo las esponjas grandes absorben y sueltan agua poco profunda. Predigan qué transferencia dejará más agua en una bandeja, prueben juntos y comparen lo que observan.',
      'Esponjas grandes y limpias, bandejas anchas poco profundas, agua y toallas grandes reutilizables.',
      'Coloca las bandejas en una mesa baja y estable con poca agua. Ofrece una estación seca de observación.',
      'Predigan una transferencia, compriman una esponja, suéltenla en el agua y exprímanla sobre la otra bandeja. Comparen distintas presiones e inventen un reto cooperativo.',
    ],
  },
  {
    id: 'ramp-rolling-investigation',
    tags: ['experiments', 'games', 'mixed'],
    match: /motion|move|space|gravity|speed|travel|game/i,
    en: [
      'Roll, pause, redesign',
      'Build a low tabletop ramp for an oversized lightweight roller. Change one slope at a time, predict the stopping area and cooperate to make a route that pauses at a chosen landmark.',
      'Large lightweight foam rollers, broad low ramps, large fabric mats and wide cardboard landing areas.',
      'Adult-check stable low ramps and rollers larger than choking-size objects. Mark a clear seated tabletop route.',
      'Compare a low and slightly higher ramp using the same roller. Point to a predicted stopping area, release without throwing and observe. Collaborate to redesign a short pause-and-roll route.',
    ],
    es: [
      'Rueda, detente y rediseña',
      'Construyan una rampa baja para un rodillo ligero y grande. Cambien una pendiente a la vez, predigan dónde se detendrá y colaboren para crear una ruta con una parada elegida.',
      'Rodillos grandes de espuma ligera, rampas anchas y bajas, tapetes grandes de tela y zonas de llegada de cartón.',
      'Una persona adulta revisa la estabilidad y que los rodillos no sean piezas pequeñas. Delimita una ruta de mesa accesible para trabajar sentado.',
      'Comparen una rampa baja con otra un poco más alta usando el mismo rodillo. Señalen dónde creen que se detendrá, suéltenlo sin lanzarlo y observen. Rediseñen juntos una ruta con pausas.',
    ],
  },
  {
    id: 'quiet-rhythm-conversation',
    tags: ['games', 'sensory', 'mixed'],
    match: /music|sound|rhythm|song|pattern|festival|play/i,
    en: [
      'A conversation in quiet beats',
      'Invent a call-and-response game using gentle taps and visible gestures. Listen or watch for a partner’s pattern, echo it and choose one playful change for the next person.',
      'Large padded tabletop drum surfaces, broad fabric pads and large picture cue cards.',
      'Set an optional quiet no-sound station. Test a soft volume and provide individual clean surfaces.',
      'Create a short tap or gesture sequence. A partner repeats it, changes one beat and passes the turn. Add a shared stop signal and build a group rhythm that everyone can join by sight or sound.',
    ],
    es: [
      'Una conversación de ritmos suaves',
      'Inventen un juego de pregunta y respuesta con golpecitos suaves y gestos visibles. Escuchen o miren el patrón de una pareja, repítanlo y cambien un detalle para la siguiente persona.',
      'Superficies grandes acolchadas para percusión de mesa, almohadillas de tela y tarjetas grandes con imágenes.',
      'Ofrece una estación silenciosa. Prueba un volumen suave y prepara superficies individuales limpias.',
      'Creen una secuencia corta de golpes o gestos. Otra persona la repite, cambia un pulso y pasa el turno. Acuerden una señal de pausa y construyan un ritmo que pueda seguirse mirando o escuchando.',
    ],
  },
  {
    id: 'transparent-color-overlay',
    tags: ['sensory', 'experiments', 'arts-crafts'],
    match: /light|color|colour|paint|rainbow|glass|sun/i,
    en: [
      'Color windows that change',
      'Layer large rigid transparent color panels on a light background. Predict what will change when two panels overlap, compare against one panel and arrange an original color window.',
      'Large child-suitable rigid translucent panels with smooth sealed edges, white boards and broad washable markers.',
      'Adult-check every panel and edge. Use ambient light and a tabletop only; provide an illustrated no-touch alternative.',
      'Compare one panel with two overlapping panels on white. Predict and observe the new appearance. Change only one panel, describe the result and collaborate on a pattern with contrasting windows.',
    ],
    es: [
      'Ventanas de color que cambian',
      'Superpongan paneles rígidos grandes de colores transparentes sobre un fondo claro. Predigan qué cambiará al juntar dos paneles, comparen con uno solo y creen una ventana original.',
      'Paneles rígidos traslúcidos grandes, aptos para niñas y niños y con bordes lisos sellados, bases blancas y marcadores lavables gruesos.',
      'Una persona adulta revisa cada panel y borde. Usa luz ambiental y trabajo de mesa; ofrece una alternativa ilustrada sin contacto.',
      'Comparen un panel con dos superpuestos sobre blanco. Predigan y observen el cambio. Sustituyan solo un panel, describan el resultado y colaboren en un patrón de ventanas contrastantes.',
    ],
  },
  {
    id: 'cooperative-block-bridge',
    tags: ['games', 'discovery', 'mixed'],
    match: /build|structure|bridge|city|design|architecture|team/i,
    en: [
      'Build a bridge for a shared mission',
      'Use large lightweight blocks to span a small tabletop gap. Teams choose a mission, predict which arrangement will stay stable and revise the bridge so a large pretend traveler can cross.',
      'Large lightweight foam blocks, two broad tabletop bases and an oversized soft traveler shape.',
      'Place bases low and close together. Adult-check stability; nothing supports a person and nobody climbs.',
      'Agree on a crossing mission, build a low bridge and test with the same large soft shape. Compare two arrangements, explain the observed difference and combine the teams’ useful discoveries.',
    ],
    es: [
      'Un puente para una misión compartida',
      'Usen bloques grandes y ligeros para cubrir una separación pequeña en una mesa. Acuerden una misión, predigan qué construcción será estable y modifiquen el puente para un viajero imaginario grande.',
      'Bloques grandes de espuma ligera, dos bases anchas para mesa y una figura viajera grande y suave.',
      'Coloca las bases bajas y cercanas. Una persona adulta revisa la estabilidad; ninguna estructura sostiene personas y nadie se sube.',
      'Acuerden una misión, construyan un puente bajo y prueben con la misma figura grande. Comparen dos construcciones, expliquen lo observado y reúnan los descubrimientos útiles de cada equipo.',
    ],
  },
  {
    id: 'cooperative-rule-switch',
    tags: ['games', 'mixed'],
    match: /game|play|puzzle|signal|holiday|autumn|spring|family/i,
    en: [
      'The game that changes one rule',
      'Create a cooperative tabletop game with large color and shape signals. Players invent a clear action for each signal, test the rules and change one rule while helping everyone follow the new pattern.',
      'Large reusable picture cards, wide fabric mats and broad colored tabletop markers.',
      'Set a seated play area and a visual turn order. Choose gestures instead of speed, elimination or required movement.',
      'Agree on two signals and a matching gesture. Take turns revealing signals, help a partner predict the response and introduce one rule switch. Discuss which clues made the new game easier to follow.',
    ],
    es: [
      'El juego que cambia una regla',
      'Creen un juego cooperativo de mesa con señales grandes de formas y colores. Inventen una acción clara para cada señal, prueben las reglas y cambien una mientras ayudan a todo el grupo a seguir el patrón.',
      'Tarjetas grandes reutilizables, tapetes anchos de tela y marcadores grandes de colores para la mesa.',
      'Prepara un espacio para jugar sentado y un orden visual de turnos. Elige gestos sin velocidad, eliminación ni movimiento obligatorio.',
      'Acuerden dos señales y sus gestos. Revelen las señales por turnos, ayuden a una pareja a predecir la respuesta e introduzcan un cambio de regla. Comenten qué pistas hicieron más claro el juego.',
    ],
  },
  {
    id: 'fabric-texture-landscape',
    tags: ['sensory', 'discovery', 'mixed'],
    match: /texture|textile|nature|landscape|leaf|garden|fabric|season/i,
    en: [
      'A landscape of touch and choice',
      'Compare large clean fabric surfaces through optional touch or close observation. Sort them using children’s own texture words, then design a shared landscape whose route can be explained without touching it.',
      'Large clean fabric pads with finished edges, broad bases and large illustrated texture cards.',
      'Check fabric fibers and allergies, remove loose threads and offer a fully no-touch observation route.',
      'Observe two textures, invent a way to sort them and test whether a partner can follow the sorting rule. Arrange a landscape, explain a route by pointing and revise it using the group’s descriptions.',
    ],
    es: [
      'Un paisaje de texturas y elecciones',
      'Comparen superficies grandes y limpias de tela mediante contacto opcional u observación cercana. Clasifíquenlas con palabras propias y diseñen un paisaje compartido cuya ruta pueda explicarse sin tocar.',
      'Almohadillas grandes de tela limpia con bordes terminados, bases anchas y tarjetas grandes de texturas.',
      'Revisa fibras y alergias, retira hilos sueltos y ofrece un recorrido de observación sin contacto.',
      'Observen dos texturas, inventen una clasificación y prueben si otra persona puede seguir la regla. Organicen un paisaje, expliquen una ruta señalando y modifíquenla con las descripciones del grupo.',
    ],
  },
  {
    id: 'process-mark-pattern-lab',
    tags: ['arts-crafts', 'sensory', 'discovery'],
    match: /art|print|pattern|paint|shape|color|autumn|flower/i,
    en: [
      'A studio of surprising marks',
      'Explore how large soft printing tools make different marks with a thin layer of washable paint. Compare pressure and direction, then build an original shared pattern without copying a finished example.',
      'Large one-piece foam printing tools, child-suitable washable paint, broad paper and stable shallow paint trays.',
      'Check paint labeling, skin sensitivities and allergies. Provide dry drawing tools and adult-prepared large printing tools.',
      'Predict a mark, press gently and compare it with a firmer press using the same tool. Change direction, describe the differences and compose a shared pattern where every participant can add a distinct mark.',
    ],
    es: [
      'Un estudio de marcas sorprendentes',
      'Exploren cómo herramientas grandes y suaves crean distintas marcas con una capa fina de pintura lavable. Comparen presión y dirección y creen un patrón compartido sin copiar un modelo terminado.',
      'Herramientas grandes de espuma de una sola pieza, pintura lavable apta para niñas y niños, papel amplio y bandejas estables poco profundas.',
      'Revisa las indicaciones de la pintura, sensibilidad y alergias. Ofrece herramientas secas de dibujo y sellos grandes preparados por una persona adulta.',
      'Predigan una marca, presionen suavemente y comparen con una presión mayor usando la misma herramienta. Cambien de dirección, describan las diferencias y creen un patrón compartido con aportaciones distintas.',
    ],
  },
];
function make(plan: Plan, source?: SparkSource): Idea {
  const copy = (es: boolean) => {
    const a = es ? plan.es : plan.en;
    return {
      title: a[0]!,
      description: a[1]!,
      materials: a[2]!,
      preparation: a[3]!,
      outline: a[4]!,
      benefit: es
        ? 'Propone observar, comparar, crear y colaborar; no promete resultados educativos medidos.'
        : 'Invites observation, comparison, creative choices and cooperation without claiming measured learning outcomes.',
      safety: es
        ? 'Supervisión adulta constante. Revisa materiales, alergias, piel y ojos; no se prueban con la boca. Usa piezas grandes, evita riesgos de atragantamiento, limpia derrames de inmediato y vacía las bandejas al terminar. Cada participante puede optar por observar.'
        : 'Adult supervision throughout. Review materials, allergies, skin and eye sensitivity. No tasting. Use large pieces, avoid choking hazards, clear spills immediately and empty trays after use. Every participant may choose to observe.',
      variations: es
        ? 'Ajusta los turnos, las señales visuales y el reto de comparación. El grupo puede inventar una regla cooperativa nueva.'
        : 'Adjust turns, visual cues and the comparison challenge. Invite the group to invent a new cooperative rule.',
      cleanup: es
        ? 'Clasifica los materiales reutilizables, limpia y seca las superficies y deja tiempo para lavarse las manos.'
        : 'Sort reusable materials, clean and dry surfaces and leave time for hand washing.',
      accessibility: es
        ? 'Ofrece acceso sentado, señales visuales y gestos, turnos flexibles y una alternativa sin contacto ni sonidos.'
        : 'Offer seated access, visual cues and gestures, flexible turns and a no-touch or no-sound alternative.',
      artwork: es
        ? 'Ilustración original del mecanismo y los materiales; sin menores, personajes licenciados ni marcas de terceros.'
        : 'Original illustration of the mechanism and materials; no children, licensed characters or third-party branding.',
    };
  };
  return {
    family: plan.id,
    content: {
      en: copy(false),
      es: copy(true),
      age_min: 4,
      age_max: 10,
      duration: 45,
      complexity: 'simple',
    },
    tags: [...plan.tags],
    months: [],
    origin: source ? 'research-informed' : 'curated',
    sources: source ? [source] : [],
  };
}
export function originalExplorations(): SparkIdea[] {
  return plans.map((plan) => ({ ...make(plan), id: 'explore-' + plan.id, createdAt: 0 }));
}
