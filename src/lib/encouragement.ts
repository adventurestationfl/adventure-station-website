import { businessDay, type Locale } from './i18n';
// Original editorial messages. The two languages share one stable daily identity.
export const encouragement = [
  [
    'A prepared table is already an act of welcome.',
    'Una mesa preparada ya es una forma de dar la bienvenida.',
  ],
  [
    'You do not need a perfect beginning to build something meaningful.',
    'No necesitas un comienzo perfecto para construir algo valioso.',
  ],
  [
    'One thoughtful workshop can become a family’s happy memory.',
    'Un taller preparado con cariño puede convertirse en un lindo recuerdo familiar.',
  ],
  [
    'Small preparations make room for big discoveries.',
    'Los pequeños preparativos abren espacio a grandes descubrimientos.',
  ],
  [
    'The idea you write down today has somewhere to grow tomorrow.',
    'La idea que anotas hoy tendrá dónde crecer mañana.',
  ],
  [
    'Your patience is one of the materials children learn from.',
    'Tu paciencia es uno de los materiales con los que aprenden los niños.',
  ],
  [
    'A simple project, taught with care, is enough.',
    'Un proyecto sencillo, enseñado con dedicación, es suficiente.',
  ],
  [
    'Building a business happens one useful decision at a time.',
    'Un negocio se construye con una decisión útil a la vez.',
  ],
  ['Make space for your own curiosity, too.', 'Haz espacio también para tu propia curiosidad.'],
  [
    'A quiet day can still be a day of progress.',
    'Un día tranquilo también puede ser un día de avance.',
  ],
  [
    'You can learn the next step without knowing the whole path.',
    'Puedes aprender el siguiente paso sin conocer todo el camino.',
  ],
  [
    'Every carefully chosen material says: you belong here.',
    'Cada material elegido con cuidado dice: aquí hay un lugar para ti.',
  ],
  [
    'The first version is allowed to be a learning version.',
    'La primera versión también puede ser una versión para aprender.',
  ],
  [
    'A child’s unusual idea may be the best part of the plan.',
    'La idea inesperada de un niño puede ser lo mejor del plan.',
  ],
  [
    'Give yourself the patience you offer your students.',
    'Date la misma paciencia que les ofreces a tus alumnos.',
  ],
  [
    'You are making a place where trying is welcome.',
    'Estás creando un lugar donde animarse a intentar tiene valor.',
  ],
  [
    'One clear instruction can open a whole world of possibilities.',
    'Una instrucción clara puede abrir todo un mundo de posibilidades.',
  ],
  [
    'Celebrate the work that happened before anyone saw the result.',
    'Reconoce el trabajo que hiciste antes de que alguien viera el resultado.',
  ],
  [
    'Your care can be felt in the little details.',
    'Tu dedicación se siente en los pequeños detalles.',
  ],
  [
    'A shorter to-do list can leave more room for good teaching.',
    'Una lista de pendientes más corta puede dejar más espacio para enseñar bien.',
  ],
  [
    'Let a useful lesson be more valuable than a flawless day.',
    'Que un aprendizaje útil valga más que un día impecable.',
  ],
  [
    'The courage to begin deserves a little credit today.',
    'Hoy también merece reconocimiento el valor de haber empezado.',
  ],
  [
    'You can make the next class better without making it more complicated.',
    'Puedes mejorar la siguiente clase sin hacerla más complicada.',
  ],
  [
    'An organized shelf is a gift to your future self.',
    'Un estante ordenado es un regalo para tu yo de mañana.',
  ],
  [
    'A thoughtful boundary protects your energy and your business.',
    'Un límite bien pensado cuida tu energía y tu negocio.',
  ],
  [
    'You are allowed to start small and take your work seriously.',
    'Puedes empezar en pequeño y tomar tu trabajo en serio.',
  ],
  [
    'The best invitation is often a clear plan and a warm welcome.',
    'A menudo, la mejor invitación es un plan claro y una bienvenida cálida.',
  ],
  [
    'Notice the part that went well before choosing what to improve.',
    'Reconoce lo que salió bien antes de decidir qué mejorar.',
  ],
  [
    'There is value in a child saying: I made this myself.',
    'Hay algo valioso en escuchar a un niño decir: esto lo hice yo.',
  ],
  [
    'Good teaching leaves room for different ways to finish.',
    'Enseñar bien deja espacio para distintas formas de terminar.',
  ],
  [
    'Your next good idea might begin with materials you already have.',
    'Tu siguiente buena idea puede empezar con materiales que ya tienes.',
  ],
  [
    'Rest is part of preparing to show up with care.',
    'Descansar también te prepara para estar presente con dedicación.',
  ],
  [
    'A familiar project can feel new through a child’s eyes.',
    'Un proyecto conocido puede sentirse nuevo a través de los ojos de un niño.',
  ],
  [
    'A clear price and a clear plan help families choose with confidence.',
    'Un precio claro y un plan claro ayudan a las familias a elegir con confianza.',
  ],
  [
    'You can be both a learner and the person leading the room.',
    'Puedes seguir aprendiendo y ser quien guía al grupo.',
  ],
  [
    'Someone may remember how you encouraged them long after the paint dries.',
    'Alguien puede recordar tu apoyo mucho después de que se seque la pintura.',
  ],
  [
    'Progress sometimes looks like asking a better question.',
    'A veces, avanzar significa hacer una mejor pregunta.',
  ],
  [
    'You are building habits, not just preparing events.',
    'Estás construyendo hábitos, además de preparar eventos.',
  ],
  [
    'Leave room in the plan for a little wonder.',
    'Deja espacio en el plan para un poco de asombro.',
  ],
  ['A good workshop begins with listening.', 'Un buen taller empieza por escuchar.'],
  [
    'The details you check today can make tomorrow feel calmer.',
    'Los detalles que revisas hoy pueden dar más calma al día de mañana.',
  ],
  [
    'Your creativity does not have to look like anyone else’s.',
    'Tu creatividad no tiene que parecerse a la de nadie más.',
  ],
  [
    'A small improvement repeated becomes part of your craft.',
    'Una pequeña mejora repetida se vuelve parte de tu oficio.',
  ],
  [
    'A welcoming room has space for more than one kind of artist.',
    'Un espacio acogedor recibe a más de un tipo de artista.',
  ],
  [
    'You can change the plan when you learn something useful.',
    'Puedes cambiar el plan cuando descubres algo útil.',
  ],
  [
    'There is strength in preparing what you can and adapting with care.',
    'Hay fortaleza en preparar lo posible y adaptarte con cuidado.',
  ],
  [
    'The business grows through care as well as ideas.',
    'El negocio crece con dedicación, además de ideas.',
  ],
  [
    'A curious question can be worth more than a perfect sample.',
    'Una pregunta curiosa puede valer más que una muestra perfecta.',
  ],
  [
    'Your work gives children permission to explore.',
    'Tu trabajo les da a los niños permiso para explorar.',
  ],
  [
    'It is okay to keep the project simple and the welcome generous.',
    'Está bien que el proyecto sea sencillo y la bienvenida sea generosa.',
  ],
  [
    'You have already done something important by making a start.',
    'Ya hiciste algo importante al dar el primer paso.',
  ],
  [
    'A well-timed pause can help a room find its rhythm.',
    'Una pausa a tiempo puede ayudar al grupo a encontrar su ritmo.',
  ],
  [
    'Think of today’s preparation as making room for someone’s confidence.',
    'Piensa que al preparar hoy también haces espacio para la confianza de alguien.',
  ],
  [
    'A workshop can teach children that ideas are worth trying.',
    'Un taller puede enseñarles a los niños que vale la pena intentar sus ideas.',
  ],
  [
    'Protect a little time for the part of the work you love.',
    'Cuida un poco de tiempo para la parte del trabajo que más disfrutas.',
  ],
  [
    'You do not have to solve every future problem today.',
    'Hoy no tienes que resolver todos los problemas del futuro.',
  ],
  [
    'A useful checklist can carry what your memory does not need to.',
    'Una buena lista puede cargar con lo que tu memoria no necesita guardar.',
  ],
  [
    'Let the next class reflect what the last one taught you.',
    'Deja que la siguiente clase refleje lo que aprendiste en la anterior.',
  ],
  [
    'Different results can be evidence of real imagination.',
    'Los resultados distintos pueden ser una señal de imaginación auténtica.',
  ],
  [
    'Your thoughtful work matters even before the room fills.',
    'Tu trabajo cuidadoso tiene valor incluso antes de que llegue el grupo.',
  ],
  [
    'One honest conversation can make a business decision easier.',
    'Una conversación honesta puede facilitar una decisión del negocio.',
  ],
  [
    'Take a moment to notice what you can do now that once felt new.',
    'Date un momento para reconocer lo que hoy sabes hacer y antes era nuevo.',
  ],
  [
    'A prepared alternative is another way of caring for your group.',
    'Preparar una alternativa también es una forma de cuidar al grupo.',
  ],
  [
    'You are creating more than an object to take home: a chance to try.',
    'Estás creando más que un objeto para llevar a casa: una oportunidad de intentar.',
  ],
] as const;
export function dailyEncouragement(locale: Locale, at = new Date()) {
  const day = businessDay(at),
    index = Math.floor(Date.parse(day + 'T12:00:00Z') / 86400000);
  const id = (((index * 37) % encouragement.length) + encouragement.length) % encouragement.length;
  return { id, day, text: encouragement[id]![locale === 'es-MX' ? 1 : 0] };
}
