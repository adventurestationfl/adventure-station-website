import type { Locale } from './i18n';
type Copy = readonly [string, string];
export type Idea = {
  id: string;
  title: Copy;
  description: Copy;
  ages: readonly [number, number];
  duration: number;
  category: Copy;
  materials: Copy;
  preparation: Copy;
  benefit: Copy;
  safety: Copy;
  variations: Copy;
  months?: number[];
  difficulty: Copy;
  capacity: number;
  cost: Copy;
  cleanup: Copy;
  accessibility: Copy;
};
const idea = (
  id: string,
  title: Copy,
  description: Copy,
  ages: readonly [number, number],
  duration: number,
  category: Copy,
  materials: Copy,
  preparation: Copy,
  benefit: Copy,
  safety: Copy,
  variations: Copy,
  months?: number[],
): Idea => ({
  id,
  title,
  description,
  ages,
  duration,
  category,
  materials,
  preparation,
  benefit,
  safety,
  variations,
  months,
  capacity: 6,
  difficulty: ['Beginner, with adult guidance', 'Inicial, con guía de una persona adulta'],
  cost: [
    'Low to moderate materials budget; check local prices before planning.',
    'Presupuesto de materiales bajo a moderado; revisa precios locales antes de planear.',
  ],
  cleanup: [
    'Allow 10–15 minutes; sort reusable pieces, wipe tables and wash hands.',
    'Reserva de 10 a 15 minutos: separa lo reutilizable, limpia las mesas y lava las manos.',
  ],
  accessibility: [
    'Offer larger pieces, a seated option, a quiet work area and a no-touch alternative. Ask about individual needs.',
    'Ofrece piezas grandes, trabajo sentado, un espacio tranquilo y una alternativa sin contacto con materiales. Pregunta por necesidades individuales.',
  ],
});
export const ideas: Idea[] = [
  idea(
    'paper-garden',
    ['Paper gardens in layers', 'Jardines de papel en capas'],
    [
      'Build an imagined garden with overlapping paper shapes and drawn details.',
      'Construyan un jardín imaginario con figuras de papel superpuestas y detalles dibujados.',
    ],
    [4, 8],
    45,
    ['Paper crafts', 'Arte con papel'],
    [
      'Large colored paper, crayons, washable glue sticks, blunt-tip scissors.',
      'Papel de colores, crayones, pegamento lavable en barra y tijeras de punta roma.',
    ],
    [
      'Cut sample large leaves; prepare one tray per pair. Leave compositions open-ended.',
      'Recorta hojas grandes de muestra; prepara una charola por pareja y deja libertad en la composición.',
    ],
    [
      'Explore overlap, shape and personal choices.',
      'Explorar superposición, formas y decisiones personales.',
    ],
    [
      'Supervise scissors; offer pre-cut shapes. Keep glue out of mouths and check product ages.',
      'Supervisa las tijeras; ofrece figuras recortadas. Evita llevar pegamento a la boca y revisa la edad indicada.',
    ],
    ['Make a night garden or a shared mural.', 'Crear un jardín nocturno o un mural compartido.'],
    [3, 4, 5],
  ),
  idea(
    'color-weather',
    ['Paint a weather story', 'Pinta una historia del clima'],
    [
      'Use brush marks and color to show two different kinds of weather.',
      'Usen pinceladas y color para mostrar dos tipos de clima.',
    ],
    [4, 9],
    45,
    ['Painting', 'Pintura'],
    [
      'Washable child-appropriate paint, thick paper, wide brushes, shallow water cups.',
      'Pintura lavable adecuada para niños, papel grueso, pinceles anchos y vasos bajos con agua.',
    ],
    [
      'Portion paint and water; cover work surfaces and allow drying space.',
      'Reparte pintura y agua; protege las mesas y prepara un área de secado.',
    ],
    [
      'Connect visual choices with observation and storytelling.',
      'Relacionar decisiones visuales con observación y narración.',
    ],
    [
      'Use non-toxic age-labeled paint, not face paint. Manage spills promptly; no paint tasting.',
      'Usa pintura no tóxica con edad indicada, no pintura facial. Limpia derrames y evita probarla.',
    ],
    [
      'Try dry crayons instead of wet paint for a lower-sensory option.',
      'Usar crayones secos en vez de pintura para reducir estímulos.',
    ],
  ),
  idea(
    'line-adventure',
    ['A line goes exploring', 'Una línea sale a explorar'],
    [
      'Turn one wandering line into a map, creature or imaginary journey.',
      'Transformen una línea viajera en un mapa, una criatura o un viaje imaginario.',
    ],
    [4, 10],
    45,
    ['Drawing', 'Dibujo'],
    [
      'Large paper, broad crayons and washable markers.',
      'Papel grande, crayones gruesos y marcadores lavables.',
    ],
    [
      'Prepare a few line prompts without a finished example to copy.',
      'Prepara algunas líneas iniciales sin un modelo terminado para copiar.',
    ],
    [
      'Practice mark-making, planning and flexible thinking.',
      'Practicar trazos, planeación y pensamiento flexible.',
    ],
    [
      'Check marker age labels; keep caps away from younger participants.',
      'Revisa la edad indicada y mantén las tapas lejos de participantes pequeños.',
    ],
    [
      'Draw with a partner by taking turns adding a line.',
      'Dibujar en pareja, por turnos, agregando una línea.',
    ],
  ),
  idea(
    'texture-collage',
    ['A city of textures', 'Una ciudad de texturas'],
    [
      'Arrange paper textures into a city that could exist only in a story.',
      'Acomoden texturas de papel para crear una ciudad que solo existiría en un cuento.',
    ],
    [5, 10],
    60,
    ['Collage', 'Collage'],
    [
      'Clean paper scraps, corrugated card, glue sticks, large base sheets.',
      'Retazos de papel limpios, cartón corrugado, pegamento en barra y hojas grandes.',
    ],
    [
      'Check scraps for staples and sharp edges; group materials by texture.',
      'Revisa que no haya grapas ni bordes filosos; agrupa los materiales por textura.',
    ],
    [
      'Compare textures and organize a visual scene.',
      'Comparar texturas y organizar una escena visual.',
    ],
    [
      'Use paper-only textures when touch sensitivities are unknown; avoid glitter and tiny decorations.',
      'Usa solo texturas de papel si desconoces sensibilidades; evita brillantina y adornos diminutos.',
    ],
    [
      'Make a quiet village or a community park instead.',
      'Crear un pueblo tranquilo o un parque comunitario.',
    ],
  ),
  idea(
    'cardboard-creatures',
    ['Cardboard creature studio', 'Estudio de criaturas de cartón'],
    [
      'Fold large card shapes into standing creatures and invent their stories.',
      'Doblen figuras grandes de cartón para crear criaturas que se sostengan e inventen sus historias.',
    ],
    [6, 10],
    60,
    ['Recycled materials', 'Materiales reutilizados'],
    [
      'Clean thin cardboard, crayons, masking tape and child scissors.',
      'Cartón delgado limpio, crayones, cinta de papel y tijeras infantiles.',
    ],
    [
      'Adults pre-cut thick card and remove staples; test stable folded bases.',
      'Una persona adulta recorta el cartón grueso, retira grapas y prueba bases estables.',
    ],
    [
      'Explore balance and solve simple structural problems.',
      'Explorar equilibrio y resolver problemas sencillos de estructura.',
    ],
    [
      'No craft knives or hot glue for children. Adult cutting happens away from the group.',
      'Los niños no usan cúteres ni silicón caliente. El corte adulto se hace lejos del grupo.',
    ],
    [
      'Build a habitat from leftover large pieces.',
      'Construir un hábitat con las piezas grandes sobrantes.',
    ],
  ),
  idea(
    'leaf-observations',
    ['Leaf detectives', 'Detectives de hojas'],
    [
      'Observe large leaves, draw their shapes, then invent an imaginary leaf.',
      'Observen hojas grandes, dibujen sus formas e inventen una hoja imaginaria.',
    ],
    [4, 10],
    45,
    ['Nature-inspired art', 'Arte inspirado en la naturaleza'],
    [
      'Verified non-irritating clean leaves or printed references, paper and crayons.',
      'Hojas limpias identificadas como no irritantes, o referencias impresas, papel y crayones.',
    ],
    [
      'Check plant identity and allergies; prepare printed alternatives.',
      'Identifica las plantas, pregunta por alergias y prepara alternativas impresas.',
    ],
    [
      'Practice close observation and comparing patterns.',
      'Practicar observación detallada y comparación de patrones.',
    ],
    [
      'Do not collect unknown plants. No tasting; wash hands. Use printed leaves if suitability is uncertain.',
      'No recolectes plantas desconocidas. No se prueban; lava las manos. Usa imágenes si hay dudas.',
    ],
    [
      'Combine observations into a paper forest.',
      'Reunir las observaciones en un bosque de papel.',
    ],
    [9, 10, 11],
  ),
  idea(
    'community-quilt',
    ['Our paper community quilt', 'Nuestra colcha comunitaria de papel'],
    [
      'Each child makes a paper square; the group joins the squares into one mural.',
      'Cada niño crea un cuadro de papel y el grupo los une en un mural.',
    ],
    [4, 10],
    60,
    ['Collaborative art', 'Arte colaborativo'],
    [
      'Large paper squares, crayons, glue sticks and adult-handled mounting tape.',
      'Cuadros grandes de papel, crayones, pegamento en barra y cinta de montaje para uso adulto.',
    ],
    [
      'Choose a broad shared theme and prepare an accessible low display surface.',
      'Elige un tema amplio y prepara una superficie de exhibición baja y accesible.',
    ],
    [
      'Build cooperation while preserving individual choices.',
      'Fomentar cooperación respetando decisiones individuales.',
    ],
    [
      'Display work without child surnames or identifying details; adults handle wall mounting.',
      'Exhibe sin apellidos ni datos que identifiquen a niños; una persona adulta instala el mural.',
    ],
    [
      'Try connected paths, shared colors or imagined neighborhoods.',
      'Probar caminos conectados, colores compartidos o vecindarios imaginarios.',
    ],
  ),
  idea(
    'quiet-color',
    ['Quiet color rhythms', 'Ritmos tranquilos de color'],
    [
      'Repeat simple shapes in a personally chosen rhythm using dry materials.',
      'Repitan formas sencillas con un ritmo propio usando materiales secos.',
    ],
    [4, 9],
    45,
    ['Sensory-considerate art', 'Arte con opciones sensoriales'],
    [
      'Soft pencils, broad crayons, smooth paper and optional shape templates.',
      'Lápices suaves, crayones gruesos, papel liso y plantillas opcionales.',
    ],
    [
      'Keep sound low; offer a predictable step card and optional breaks.',
      'Mantén poco ruido; ofrece una tarjeta de pasos previsibles y pausas opcionales.',
    ],
    [
      'Explore pattern and choice at an individual pace.',
      'Explorar patrones y decisiones a un ritmo personal.',
    ],
    [
      'Do not describe the activity as therapy or assume one sensory preference fits everyone.',
      'No la presentes como terapia ni supongas que todos tienen las mismas preferencias sensoriales.',
    ],
    [
      'Offer a single-color or no-template version.',
      'Ofrecer una versión de un solo color o sin plantilla.',
    ],
  ),
  idea(
    'clay-landscape',
    ['Pressed clay landscapes', 'Paisajes de arcilla con relieves'],
    [
      'Press broad tools into a flat clay landscape and compare the marks.',
      'Presionen herramientas grandes sobre un paisaje plano de arcilla y comparen las marcas.',
    ],
    [6, 10],
    60,
    ['Simple sculpture', 'Escultura sencilla'],
    [
      'Age-appropriate non-food modeling clay, wide blunt tools and trays.',
      'Masa para modelar no alimentaria adecuada para la edad, herramientas romas grandes y charolas.',
    ],
    [
      'Check ingredients and allergies; divide portions and plan drying/storage.',
      'Revisa ingredientes y alergias; reparte porciones y planea secado y almacenamiento.',
    ],
    [
      'Investigate texture, relief and gentle tool control.',
      'Investigar textura, relieve y control suave de herramientas.',
    ],
    [
      'No tasting, kiln use or sharp tools. Offer paper relief as an alternative; wash hands.',
      'No se prueba; no se usan hornos ni herramientas filosas. Ofrece relieve en papel y lavado de manos.',
    ],
    [
      'Use layered cardboard if clay is unsuitable.',
      'Usar capas de cartón si la masa no es adecuada.',
    ],
  ),
  idea(
    'sun-shapes',
    ['Sun-shaped paper mobiles', 'Móviles de papel con formas de sol'],
    [
      'Arrange large paper shapes into a balanced hanging composition.',
      'Acomoden figuras grandes de papel en una composición colgante equilibrada.',
    ],
    [6, 10],
    60,
    ['Seasonal paper art', 'Arte estacional con papel'],
    [
      'Cardstock, crayons, tape and short adult-managed hanging strips.',
      'Cartulina, crayones, cinta y tiras cortas para colgar manejadas por una persona adulta.',
    ],
    [
      'Pre-cut sturdy shapes; prepare a display beyond children’s reach.',
      'Recorta formas resistentes y prepara una exhibición fuera del alcance infantil.',
    ],
    [
      'Explore balance, shape and spacing.',
      'Explorar equilibrio, forma y distribución del espacio.',
    ],
    [
      'Avoid long cords, neck loops and small hanging parts. Adults install and manage hanging materials.',
      'Evita cordones largos, lazos al cuello y piezas colgantes pequeñas. Una persona adulta instala y maneja los soportes.',
    ],
    [
      'Make a flat sun collage with no hanging components.',
      'Crear un collage plano de sol sin piezas colgantes.',
    ],
    [5, 6, 7, 8],
  ),
  idea(
    'story-fold',
    ['A tiny folded storybook', 'Un pequeño cuento plegado'],
    [
      'Fold a simple book and tell a story through four pictures.',
      'Doblen un libro sencillo y cuenten una historia con cuatro imágenes.',
    ],
    [5, 10],
    60,
    ['Paper storytelling', 'Narración con papel'],
    [
      'Large paper, crayons and optional picture prompts.',
      'Papel grande, crayones y sugerencias visuales opcionales.',
    ],
    [
      'Use a no-cut fold; prepare blank examples showing the sequence only.',
      'Usa un plegado sin cortes y prepara muestras en blanco que solo indiquen la secuencia.',
    ],
    [
      'Practice sequencing and visual communication.',
      'Practicar secuencias y comunicación visual.',
    ],
    [
      'Keep stories fictional; do not request private family details or identifying information.',
      'Mantén historias ficticias; no pidas detalles familiares privados ni información identificable.',
    ],
    ['Work in pairs with one drawing per turn.', 'Trabajar en parejas con un dibujo por turno.'],
  ),
  idea(
    'print-pattern',
    ['Cardboard edge prints', 'Estampas con bordes de cartón'],
    [
      'Print repeated lines with broad cardboard edges and layer contrasting colors.',
      'Estampen líneas repetidas con bordes anchos de cartón y superpongan colores contrastantes.',
    ],
    [5, 10],
    60,
    ['Printmaking', 'Estampado'],
    [
      'Clean card strips, washable paint, shallow trays and thick paper.',
      'Tiras de cartón limpias, pintura lavable, charolas bajas y papel grueso.',
    ],
    [
      'Adults cut broad smooth edges and test paint amounts before class.',
      'Una persona adulta corta bordes anchos y lisos y prueba la cantidad de pintura.',
    ],
    [
      'Observe repetition, pressure and color layering.',
      'Observar repetición, presión y capas de color.',
    ],
    [
      'No food trays with allergen residue; no sharp print tools. Provide dry drawing alternatives.',
      'No uses charolas con residuos de alimentos alergénicos ni herramientas filosas. Ofrece dibujo en seco.',
    ],
    [
      'Make a shared patterned paper for future collage.',
      'Crear un papel estampado compartido para futuros collages.',
    ],
  ),
  idea(
    'ocean-paper',
    ['An imagined paper ocean', 'Un océano imaginario de papel'],
    [
      'Layer torn paper waves and invent a large friendly sea creature.',
      'Superpongan olas de papel rasgado e inventen una criatura marina grande y amigable.',
    ],
    [4, 8],
    45,
    ['Collage', 'Collage'],
    [
      'Blue paper, large scraps, crayons and glue sticks.',
      'Papel azul, retazos grandes, crayones y pegamento en barra.',
    ],
    [
      'Prepare wide paper strips; show tearing slowly without requiring it.',
      'Prepara tiras anchas; muestra cómo rasgar despacio sin hacerlo obligatorio.',
    ],
    ['Explore depth and imaginative habitats.', 'Explorar profundidad y hábitats imaginarios.'],
    [
      'Offer pre-torn pieces for grip needs; avoid tiny shells, sand and beads.',
      'Ofrece piezas rasgadas para distintas necesidades de agarre; evita conchas pequeñas, arena y cuentas.',
    ],
    ['Create a river, pond or underwater city.', 'Crear un río, estanque o ciudad submarina.'],
    [5, 6, 7, 8],
  ),
  idea(
    'kindness-postcards',
    ['Postcards from an imaginary place', 'Postales de un lugar imaginario'],
    [
      'Draw an invented place and add a kind message to a fictional visitor.',
      'Dibujen un lugar inventado y agreguen un mensaje amable para un visitante ficticio.',
    ],
    [5, 10],
    45,
    ['Drawing and words', 'Dibujo y palabras'],
    [
      'Large card rectangles, crayons and optional word cards.',
      'Rectángulos grandes de cartulina, crayones y tarjetas de palabras opcionales.',
    ],
    [
      'Provide fictional addresses and optional dictation support.',
      'Proporciona direcciones ficticias y apoyo opcional para dictar.',
    ],
    [
      'Connect illustration, empathy and communication.',
      'Relacionar ilustración, empatía y comunicación.',
    ],
    [
      'Do not collect or display real addresses or personal messages about other children.',
      'No recopiles ni exhibas direcciones reales ni mensajes personales sobre otros niños.',
    ],
    [
      'Draw a message using symbols instead of written words.',
      'Dibujar el mensaje con símbolos en lugar de palabras escritas.',
    ],
  ),
  idea(
    'shape-sculptures',
    ['Standing paper shapes', 'Figuras de papel que se sostienen'],
    [
      'Fold, curl and arrange broad card strips into a small sculpture.',
      'Doblen, curven y acomoden tiras anchas de cartulina en una escultura pequeña.',
    ],
    [6, 10],
    60,
    ['Sculpture', 'Escultura'],
    [
      'Cardstock strips, base card, tape and crayons.',
      'Tiras de cartulina, cartón base, cinta y crayones.',
    ],
    [
      'Pre-cut broad strips; test tape tabs and stable bases.',
      'Recorta tiras anchas y prueba pestañas de cinta y bases estables.',
    ],
    [
      'Compare flat shapes with three-dimensional forms.',
      'Comparar formas planas con formas de tres dimensiones.',
    ],
    [
      'No staples, wire or hot glue. Supervise folding edges and offer pre-folded pieces.',
      'No uses grapas, alambre ni silicón caliente. Supervisa los dobleces y ofrece piezas predobladas.',
    ],
    [
      'Create a shared sculpture garden on one large base.',
      'Crear un jardín de esculturas compartido sobre una base grande.',
    ],
  ),
  idea(
    'celebration-banners',
    ['A banner for small celebrations', 'Un banderín para celebrar pequeños logros'],
    [
      'Design large paper flags that celebrate learning something new.',
      'Diseñen banderines grandes de papel para celebrar un nuevo aprendizaje.',
    ],
    [4, 10],
    45,
    ['Seasonal crafts', 'Manualidades estacionales'],
    [
      'Large paper flags, crayons, paper shapes and mounting tape.',
      'Banderines grandes de papel, crayones, formas de papel y cinta de montaje.',
    ],
    [
      'Prepare a tabletop display; avoid cord-based garlands.',
      'Prepara una exhibición de mesa y evita guirnaldas con cordones.',
    ],
    [
      'Recognize effort and explore visual symbols.',
      'Reconocer el esfuerzo y explorar símbolos visuales.',
    ],
    [
      'Keep celebrations inclusive and optional. Adults mount displays without identifying child details.',
      'Haz que la celebración sea inclusiva y opcional. Una persona adulta monta sin datos que identifiquen a niños.',
    ],
    [
      'Celebrate curiosity, friendship or a seasonal color palette.',
      'Celebrar curiosidad, amistad o una paleta de colores estacional.',
    ],
  ),
  idea(
    'light-dark',
    ['Light and dark paper scenes', 'Escenas de papel con luces y sombras'],
    [
      'Build a scene with dark and light paper shapes, without candles or electric lighting.',
      'Construyan una escena con figuras claras y oscuras, sin velas ni iluminación eléctrica.',
    ],
    [5, 10],
    60,
    ['Mixed media', 'Técnica mixta'],
    [
      'Light and dark paper, crayons, glue sticks and pre-cut shapes.',
      'Papel claro y oscuro, crayones, pegamento en barra y figuras recortadas.',
    ],
    [
      'Prepare high-contrast samples and large shapes.',
      'Prepara muestras de alto contraste y figuras grandes.',
    ],
    [
      'Explore contrast, mood and visual storytelling.',
      'Explorar contraste, ambiente y narración visual.',
    ],
    [
      'No flames, glass, electrical projects or darkened rooms. Keep work areas well lit.',
      'Sin fuego, vidrio, proyectos eléctricos ni cuartos oscuros. Mantén buena iluminación.',
    ],
    [
      'Create a daytime and nighttime pair of scenes.',
      'Crear dos escenas: una de día y otra de noche.',
    ],
    [10, 11, 12, 1],
  ),
  idea(
    'reused-mosaic',
    ['A mosaic from paper leftovers', 'Un mosaico con sobrantes de papel'],
    [
      'Arrange large leftover paper pieces into a bold mosaic without rigid cutting rules.',
      'Acomoden piezas grandes de papel sobrante en un mosaico sin reglas rígidas de corte.',
    ],
    [4, 10],
    45,
    ['Recycled materials', 'Materiales reutilizados'],
    [
      'Clean large paper scraps, base sheets and glue sticks.',
      'Retazos grandes de papel limpio, hojas base y pegamento en barra.',
    ],
    [
      'Sort broad pieces by color; remove staples and unsuitable packaging.',
      'Clasifica piezas grandes por color; retira grapas y empaques inadecuados.',
    ],
    [
      'Practice composition and thoughtful reuse.',
      'Practicar composición y reutilización consciente.',
    ],
    [
      'Use large paper pieces rather than tiles, glass or tiny fragments. Offer ready-arranged choices.',
      'Usa piezas grandes de papel, no azulejos, vidrio ni fragmentos diminutos. Ofrece combinaciones preparadas.',
    ],
    [
      'Work within a large letter or an invented animal silhouette.',
      'Trabajar dentro de una letra grande o la silueta de un animal inventado.',
    ],
  ),
];
const copyKeys = [
  'title',
  'description',
  'category',
  'materials',
  'preparation',
  'benefit',
  'safety',
  'variations',
  'difficulty',
  'cost',
  'cleanup',
  'accessibility',
] as const;
export function ideaCopy(idea: Idea, locale: Locale) {
  const copy = (v: Copy) => v[locale === 'es-MX' ? 1 : 0];
  const texts = Object.fromEntries(copyKeys.map((k) => [k, copy(idea[k])])) as Record<
    (typeof copyKeys)[number],
    string
  >;
  return {
    ...texts,
    id: idea.id,
    age_min: idea.ages[0],
    age_max: idea.ages[1],
    duration: idea.duration,
    capacity: idea.capacity,
    source: 'curated',
    months: idea.months ?? [],
  };
}
