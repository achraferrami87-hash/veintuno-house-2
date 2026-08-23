const prisma = require('../db');

// Fixed vocabulary shared by the quiz and by product tagging. Admins can
// rename/add/remove characteristics afterward from the dashboard — this list
// only seeds a sensible starting set, it's never re-applied destructively.
const CHARACTERISTICS = [
  'Fresh', 'Citrus', 'Aquatic', 'Clean', 'Woody', 'Oud', 'Spicy', 'Floral',
  'Sweet', 'Gourmand', 'Warm', 'Oriental', 'Musky', 'Elegant', 'Mysterious',
  'Intense', 'Subtle', 'Day', 'Night', 'Masculine', 'Feminine', 'Unisex',
];

// Each question/answer maps to characteristic names with a weight. Resolved
// to real Characteristic ids at seed time (never hardcoded ids).
const QUESTIONS = [
  {
    text: 'Quel style de parfum vous attire le plus ?',
    answers: [
      { label: 'Frais et léger', tags: { Fresh: 3, Citrus: 2, Clean: 1 } },
      { label: 'Boisé et enveloppant', tags: { Woody: 3, Oud: 2 } },
      { label: 'Sucré et gourmand', tags: { Sweet: 3, Gourmand: 2 } },
      { label: 'Floral et raffiné', tags: { Floral: 3, Elegant: 1 } },
      { label: 'Épicé et intense', tags: { Spicy: 3, Intense: 2 } },
    ],
  },
  {
    text: 'Vous préférez plutôt une senteur fraîche ou chaude ?',
    answers: [
      { label: 'Fraîche', tags: { Fresh: 3, Aquatic: 2, Citrus: 1 } },
      { label: 'Chaude', tags: { Warm: 3, Oriental: 2, Spicy: 1 } },
    ],
  },
  {
    text: 'Sucré ou boisé ?',
    answers: [
      { label: 'Sucré, gourmand', tags: { Sweet: 3, Gourmand: 3 } },
      { label: 'Boisé, naturel', tags: { Woody: 3, Oud: 1 } },
    ],
  },
  {
    text: 'Vous portez votre parfum plutôt...',
    answers: [
      { label: 'Le jour, au quotidien', tags: { Day: 3, Clean: 2, Fresh: 1 } },
      { label: 'Le soir, pour sortir', tags: { Night: 3, Intense: 2, Mysterious: 1 } },
    ],
  },
  {
    text: 'Votre style est plutôt...',
    answers: [
      { label: 'Décontracté et naturel', tags: { Clean: 2, Subtle: 2, Fresh: 1 } },
      { label: 'Élégant et sophistiqué', tags: { Elegant: 3, Musky: 1 } },
    ],
  },
  {
    text: 'Quelle intensité recherchez-vous ?',
    answers: [
      { label: 'Subtile, discrète', tags: { Subtle: 3, Clean: 1 } },
      { label: 'Marquante, qui laisse une trace', tags: { Intense: 3, Musky: 2, Oriental: 1 } },
    ],
  },
  {
    text: 'Ce parfum est destiné à...',
    answers: [
      { label: 'Un homme', tags: { Masculine: 3 } },
      { label: 'Une femme', tags: { Feminine: 3 } },
      { label: "Peu importe, l'essentiel c'est le style", tags: { Unisex: 3 } },
    ],
  },
  {
    text: 'Quelle ambiance vous correspond le mieux ?',
    answers: [
      { label: 'Naturelle et apaisante', tags: { Fresh: 2, Clean: 2 } },
      { label: 'Mystérieuse et envoûtante', tags: { Mysterious: 3, Oud: 1 } },
      { label: 'Glamour et affirmée', tags: { Elegant: 2, Musky: 2 } },
      { label: 'Énergique et vive', tags: { Citrus: 2, Spicy: 2 } },
    ],
  },
];

// French keyword → characteristic name. A product is tagged with every
// characteristic whose keywords appear anywhere in its name/notes/description.
const KEYWORD_MAP = {
  Fresh: ['frais', 'fraîch'],
  Citrus: ['agrume', 'citron', 'bergamote', 'orange', 'pamplemousse', 'mandarine'],
  Aquatic: ['marin', 'aquatique', 'marine'],
  Clean: ['propre', 'savon', 'clean', 'coton'],
  Woody: ['boisé', 'bois', 'cèdre', 'cedre', 'santal', 'vétiver', 'vetiver'],
  Oud: ['oud', 'agar'],
  Spicy: ['épicé', 'epice', 'épice', 'poivre', 'cannelle', 'cardamome', 'gingembre'],
  Floral: ['floral', 'fleur', 'jasmin', 'rose', 'lavande', 'iris', 'muguet', 'pivoine'],
  Sweet: ['sucré', 'sucre', 'caramel', 'praline', 'miel'],
  Gourmand: ['gourmand', 'vanille', 'chocolat', 'amande', 'tonka'],
  Warm: ['chaud', 'ambre', 'ambré', 'ambre'],
  Oriental: ['oriental', 'encens', 'résine', 'resine', 'myrrhe'],
  Musky: ['musc', 'cuir'],
  Elegant: ['élégant', 'elegant', 'raffiné', 'raffine', 'chic', 'sophistiqué', 'sophistique'],
  Mysterious: ['mystérieux', 'mysterieux', 'mystère', 'mystere', 'envoûtant', 'envoutant', 'ténébreux', 'tenebreux', 'noir'],
  Intense: ['intense', 'puissant', 'marquant', 'capiteux'],
  Subtle: ['subtil', 'léger', 'leger', 'discret', 'délicat', 'delicat'],
  Day: ['jour', 'quotidien'],
  Night: ['nuit', 'soirée', 'soiree', 'soir'],
};

async function upsertCharacteristics() {
  const existing = await prisma.characteristic.findMany();
  const byName = new Map(existing.map((c) => [c.name, c]));
  let created = 0;
  for (let i = 0; i < CHARACTERISTICS.length; i += 1) {
    const name = CHARACTERISTICS[i];
    if (byName.has(name)) continue;
    const row = await prisma.characteristic.create({ data: { name, position: existing.length + created } });
    byName.set(name, row);
    created += 1;
  }
  return { byName, created };
}

async function seedQuestions(byName) {
  const existingCount = await prisma.quizQuestion.count();
  if (existingCount > 0) return 0; // never duplicate/clobber admin-edited content

  for (let qi = 0; qi < QUESTIONS.length; qi += 1) {
    const q = QUESTIONS[qi];
    const question = await prisma.quizQuestion.create({ data: { text: q.text, position: qi, isActive: true } });
    for (let ai = 0; ai < q.answers.length; ai += 1) {
      const a = q.answers[ai];
      const answer = await prisma.quizAnswer.create({ data: { label: a.label, position: ai, questionId: question.id } });
      const rows = Object.entries(a.tags)
        .map(([name, weight]) => ({ characteristicId: byName.get(name) && byName.get(name).id, weight }))
        .filter((r) => r.characteristicId);
      if (rows.length) {
        await prisma.quizAnswerCharacteristic.createMany({
          data: rows.map((r) => ({ answerId: answer.id, characteristicId: r.characteristicId, weight: r.weight })),
        });
      }
    }
  }
  return QUESTIONS.length;
}

function inferCharacteristicNames(product) {
  const haystack = [product.name, product.notes, product.notesTop, product.notesHeart, product.notesBase, product.description]
    .filter(Boolean).join(' ').toLowerCase();
  const names = new Set();
  Object.entries(KEYWORD_MAP).forEach(([name, keywords]) => {
    if (keywords.some((kw) => haystack.includes(kw))) names.add(name);
  });
  let genders = [];
  try { genders = JSON.parse(product.genders || '[]'); } catch (e) { genders = []; }
  if (genders.includes('homme')) names.add('Masculine');
  if (genders.includes('femme')) names.add('Feminine');
  if (genders.includes('unisexe')) names.add('Unisex');
  if (names.size === 0) { names.add('Elegant'); names.add('Subtle'); }
  return Array.from(names);
}

async function autoTagProducts(byName) {
  const products = await prisma.product.findMany({
    where: { isActive: true, collection: { slug: 'parfums' } },
  });
  let tagged = 0;
  for (const product of products) {
    const names = inferCharacteristicNames(product);
    const characteristics = names.map((name) => byName.get(name)).filter(Boolean);
    if (!characteristics.length) continue;
    // Additive only — never removes a tag an admin already set by hand, and
    // safe to re-run (upsert per pair instead of createMany, since SQLite's
    // Prisma driver doesn't support `skipDuplicates`).
    for (const c of characteristics) {
      await prisma.productCharacteristic.upsert({
        where: { productId_characteristicId: { productId: product.id, characteristicId: c.id } },
        create: { productId: product.id, characteristicId: c.id },
        update: {},
      });
    }
    tagged += 1;
  }
  return tagged;
}

async function seedDefaultQuizContent() {
  const { byName, created: characteristicsCreated } = await upsertCharacteristics();
  const questionsCreated = await seedQuestions(byName);
  const productsTagged = await autoTagProducts(byName);
  return { characteristicsCreated, questionsCreated, productsTagged };
}

module.exports = { seedDefaultQuizContent };
