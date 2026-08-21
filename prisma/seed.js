const { PrismaClient } = require('@prisma/client');
const { hashPassword } = require('../server/utils/password');

const prisma = new PrismaClient();

const COLLECTIONS = [
  { slug: 'parfums', name: 'Parfums', description: "Des créations olfactives inspirées des sillages les plus iconiques — des interprétations VEINTUNO HOUSE, et non des parfums de marque originaux.", position: 0 },
  { slug: 'gels-douche', name: 'Gels Douche', description: 'Gels douche parfumés premium 200ml, sans parabènes, sans sulfates, avec niacinamide.', position: 1 },
  { slug: 'supplements', name: 'Supplements', description: 'Beauté & bien-être.', position: 2 },
  { slug: 'cosmetics', name: 'Cosmetics', description: 'Soin & finition.', position: 3 },
];

const PRODUCTS = [
  // Parfums
  { slug: 'atlas-noir', name: 'Atlas Noir', collection: 'parfums', notes: 'Boisé / Ambré', gender: 'homme', volume: '50ML', notesTop: 'Bergamote, Poivre noir', notesHeart: 'Cuir, Encens', notesBase: 'Ambre, Bois de oud', price: 89, isBestSeller: true, shape: 'bottle', color: '#0c0c0c', freePackEligible: true },
  { slug: 'minuit-cuir', name: 'Minuit Cuir', collection: 'parfums', notes: 'Cuir / Épicé', gender: 'homme', volume: '50ML', notesTop: 'Cardamome, Safran', notesHeart: 'Cuir, Rose', notesBase: 'Patchouli, Vanille', price: 89, isLimitedEdition: true, shape: 'bottle', color: '#C9A227', freePackEligible: true },
  { slug: 'cedre-royal', name: 'Cèdre Royal', collection: 'parfums', notes: 'Boisé / Frais', gender: 'homme', volume: '50ML', notesTop: 'Bergamote, Menthe', notesHeart: 'Cèdre, Lavande', notesBase: 'Vétiver, Mousse de chêne', price: 89, shape: 'bottle', color: '#5a5650', freePackEligible: true },
  { slug: 'oud-imperial', name: 'Oud Impérial', collection: 'parfums', notes: 'Oud / Boisé', gender: 'unisexe', volume: '50ML', notesTop: 'Safran, Cannelle', notesHeart: 'Oud, Rose de Damas', notesBase: 'Bois de santal, Ambre gris', price: 95, isNew: true, shape: 'bottle', color: '#6b5a1c', freePackEligible: true },
  { slug: 'rose-lumiere', name: 'Rose Lumière', collection: 'parfums', notes: 'Floral / Musqué', gender: 'femme', volume: '50ML', notesTop: 'Poire, Bergamote', notesHeart: 'Rose, Pivoine', notesBase: 'Musc blanc, Bois de cachemire', price: 89, isBestSeller: true, shape: 'bottle', color: '#e6c15c', freePackEligible: true },
  { slug: 'iris-soie', name: 'Iris Soie', collection: 'parfums', notes: 'Floral / Poudré', gender: 'femme', volume: '50ML', notesTop: 'Mandarine, Rose', notesHeart: 'Iris, Violette', notesBase: 'Musc, Fève tonka', price: 89, shape: 'bottle', color: '#d8cfc0', freePackEligible: true },
  { slug: 'vanille-ambree', name: 'Vanille Ambrée', collection: 'parfums', notes: 'Vanille / Gourmand', gender: 'femme', volume: '50ML', notesTop: 'Mandarine, Cannelle', notesHeart: 'Vanille, Jasmin', notesBase: 'Ambre, Fève tonka', price: 89, shape: 'bottle', color: '#b9822f', freePackEligible: true },
  { slug: 'fleur-blanche', name: 'Fleur Blanche', collection: 'parfums', notes: 'Floral / Fruité', gender: 'femme', volume: '50ML', notesTop: 'Poire, Freesia', notesHeart: 'Fleur d\'oranger, Jasmin', notesBase: 'Musc blanc, Bois clair', price: 89, shape: 'bottle', color: '#efe6d3', freePackEligible: true },

  // Gels Douche — 200ml, individual price 85 DH
  { slug: 'gel-oud-noir', name: 'Gel Douche Oud Noir', collection: 'gels-douche', notes: 'Oud / Boisé — 200ml', volume: null, price: 85, shape: 'tube', color: '#2b2118', freePackEligible: true },
  { slug: 'gel-musc-blanc', name: 'Gel Douche Musc Blanc', collection: 'gels-douche', notes: 'Musc / Propre — 200ml', volume: null, price: 85, isBestSeller: true, shape: 'tube', color: '#e9e4d8', freePackEligible: true },
  { slug: 'gel-ambre-dore', name: 'Gel Douche Ambre Doré', collection: 'gels-douche', notes: 'Ambre / Épicé — 200ml', volume: null, price: 85, shape: 'tube', color: '#b9822f', freePackEligible: true },
  { slug: 'gel-fleur-coton', name: 'Gel Douche Fleur de Coton', collection: 'gels-douche', notes: 'Floral / Doux — 200ml', volume: null, price: 85, shape: 'tube', color: '#ead9e0', freePackEligible: true },

  // Supplements — individual only (no packs), per spec
  { slug: 'sup-collagene', name: 'Complexe Beauté Collagène', collection: 'supplements', notes: 'Peau & cheveux — 60 gélules', volume: null, price: 149, isBestSeller: true, shape: 'jar', color: '#efe6d3' },
  { slug: 'sup-vitamine-c', name: 'Vitamine Éclat C+E', collection: 'supplements', notes: 'Antioxydant — 60 gélules', volume: null, price: 129, shape: 'jar', color: '#e6c15c' },
  { slug: 'sup-biotine', name: 'Biotine Cheveux & Ongles', collection: 'supplements', notes: 'Croissance — 60 gélules', volume: null, price: 139, shape: 'jar', color: '#0c0c0c' },
  { slug: 'sup-omega-glow', name: 'Oméga Glow', collection: 'supplements', notes: 'Peau nourrie — 60 capsules', volume: null, price: 159, shape: 'jar', color: '#b9822f' },

  // Cosmetics — individual only (no packs), per spec
  { slug: 'cos-baume-levres', name: 'Baume à Lèvres Satin', collection: 'cosmetics', notes: 'Soin lèvres — 8g', volume: null, price: 39, shape: 'tube', color: '#d8cfc0' },
  { slug: 'cos-huile-seche', name: 'Huile Sèche Corps & Cheveux', collection: 'cosmetics', notes: 'Finition satinée — 100ml', volume: null, price: 99, isBestSeller: true, shape: 'bottle', color: '#C9A227' },
  { slug: 'cos-creme-mains', name: 'Crème Mains Nourrissante', collection: 'cosmetics', notes: 'Hydratation — 50ml', volume: null, price: 45, shape: 'jar', color: '#efe6d3' },
  { slug: 'cos-brume-corps', name: 'Brume Corps Signature', collection: 'cosmetics', notes: 'Sillage léger — 100ml', volume: null, price: 79, shape: 'bottle', color: '#e6c15c' },
];

const SLIDES = [
  {
    eyebrow: 'Veintuno House', title: 'MADE TO<br><em>LAST.</em>',
    subtitle: '« Un parfum ne complète pas une tenue. Il révèle une mémoire. »',
    ctaText1: 'Composer mon pack', ctaHref1: '#compose',
    ctaText2: 'Découvrir la collection', ctaHref2: '#collections',
    gradientFallback: 'radial-gradient(ellipse at 75% 50%, rgba(201,162,39,0.22), transparent 60%), linear-gradient(180deg, #0c0c0c 0%, #161513 100%)',
    position: 0,
  },
  {
    eyebrow: 'Nouveauté', title: 'OUD <em>IMPÉRIAL</em>',
    subtitle: "Un boisé intense au sillage exceptionnel. Disponible dès aujourd'hui.",
    ctaText1: 'Découvrir', ctaHref1: '#collection/parfums',
    gradientFallback: 'radial-gradient(ellipse at 70% 40%, rgba(107,90,28,0.35), transparent 60%), linear-gradient(180deg, #14110a 0%, #0c0c0c 100%)',
    position: 1,
  },
  {
    eyebrow: 'Édition limitée', title: 'MINUIT <em>CUIR</em>',
    subtitle: 'Cuir et épices, une signature nocturne. Stock limité.',
    ctaText1: "Voir l'édition", ctaHref1: '#collection/parfums',
    gradientFallback: 'radial-gradient(ellipse at 30% 60%, rgba(201,162,39,0.18), transparent 55%), linear-gradient(180deg, #0c0c0c 0%, #1a1712 100%)',
    position: 2,
  },
  {
    eyebrow: 'Offre', title: 'LIVRAISON <em>OFFERTE</em>',
    subtitle: "Partout au Maroc, sans minimum d'achat, paiement à la livraison.",
    ctaText1: 'Composer mon pack', ctaHref1: '#compose',
    gradientFallback: 'radial-gradient(ellipse at 50% 30%, rgba(201,162,39,0.2), transparent 60%), linear-gradient(180deg, #161513 0%, #0c0c0c 100%)',
    position: 3,
  },
];

async function main() {
  console.log('Seeding...');

  // Collections
  const collectionMap = {};
  for (const c of COLLECTIONS) {
    const row = await prisma.collection.upsert({
      where: { slug: c.slug },
      update: { name: c.name, description: c.description, position: c.position },
      create: c,
    });
    collectionMap[c.slug] = row.id;
  }

  // Products
  const productMap = {};
  for (const p of PRODUCTS) {
    const { collection, ...rest } = p;
    if (rest.stock === undefined) rest.stock = 50;
    const row = await prisma.product.upsert({
      where: { slug: p.slug },
      update: { ...rest, collectionId: collectionMap[collection] },
      create: { ...rest, collectionId: collectionMap[collection] },
    });
    productMap[p.slug] = row.id;
  }

  // Packs — Parfums
  const parfumPackDefs = [
    { name: 'Pack Découverte', size: 3, price: 199, position: 0 },
    { name: 'Pack Signature', size: 4, price: 249, position: 1 },
    { name: 'Pack Prestige', size: 5, price: 299, position: 2 },
  ];
  for (const def of parfumPackDefs) {
    const existing = await prisma.pack.findFirst({ where: { name: def.name, collectionId: collectionMap['parfums'] } });
    if (!existing) {
      await prisma.pack.create({
        data: { ...def, collectionId: collectionMap['parfums'], isCustomizable: true, useCollectionEligibility: true },
      });
    }
  }

  // Packs — Gels Douche
  const gelPackDefs = [
    { name: 'Pack 3', size: 3, price: 199, position: 0 },
    { name: 'Pack 4', size: 4, price: 249, position: 1 },
    { name: 'Pack 5', size: 5, price: 299, position: 2 },
  ];
  for (const def of gelPackDefs) {
    const existing = await prisma.pack.findFirst({ where: { name: def.name, collectionId: collectionMap['gels-douche'] } });
    if (!existing) {
      await prisma.pack.create({
        data: { ...def, collectionId: collectionMap['gels-douche'], isCustomizable: true, useCollectionEligibility: true },
      });
    }
  }

  // Free Pack config
  const freePackCount = await prisma.freePackConfig.count();
  if (freePackCount === 0) {
    const fp = await prisma.freePackConfig.create({
      data: { name: 'FREE PACK', minItems: 3, allowMixCategories: true, isActive: true },
    });
    await prisma.freePackEligibleCollection.createMany({
      data: [
        { freePackConfigId: fp.id, collectionId: collectionMap['parfums'] },
        { freePackConfigId: fp.id, collectionId: collectionMap['gels-douche'] },
      ],
    });
  }

  // Promo code example
  await prisma.promoCode.upsert({
    where: { code: 'BIENVENUE10' },
    update: {},
    create: {
      code: 'BIENVENUE10',
      type: 'PERCENT',
      value: 10,
      isActive: true,
      minOrderAmount: 150,
    },
  });

  // Hero slides
  const slideCount = await prisma.heroSlide.count();
  if (slideCount === 0) {
    await prisma.heroSlide.createMany({ data: SLIDES });
  }

  // Homepage sections
  const sectionCount = await prisma.homepageSection.count();
  if (sectionCount === 0) {
    await prisma.homepageSection.createMany({
      data: [
        {
          type: 'FEATURED_COLLECTIONS',
          title: 'La Maison',
          subtitle: 'Nos collections',
          config: JSON.stringify({ collectionSlugs: ['parfums', 'gels-douche', 'supplements', 'cosmetics'] }),
          position: 0,
        },
        {
          type: 'TEXT_IMAGE',
          title: 'La Maison',
          subtitle: 'Une signature, pas un simple flacon',
          config: JSON.stringify({
            body: "VEINTUNO HOUSE est née d'une conviction simple : le parfum est le dernier détail que l'on oublie de soigner, et pourtant le premier que l'on retient d'une personne. Chaque composition est pensée au Maroc, inspirée des grandes maisons, pour offrir une intensité et une tenue rares à ce niveau d'accessibilité.",
          }),
          position: 1,
        },
        {
          type: 'TESTIMONIALS',
          title: 'Avis',
          subtitle: 'Ce qu\'ils en disent',
          config: JSON.stringify({
            items: [
              { rating: 5, quote: "Tenue incroyable pour le prix. Atlas Noir m'a valu plein de compliments dès le premier jour.", author: 'Yassine, Casablanca' },
              { rating: 5, quote: 'Le pack signature est parfait pour découvrir plusieurs sillages sans se ruiner. Livraison rapide.', author: 'Salma, Rabat' },
              { rating: 5, quote: 'Rose Lumière est devenu mon parfum du quotidien. Discret mais on le remarque toujours.', author: 'Imane, Marrakech' },
            ],
          }),
          position: 2,
        },
      ],
    });
  }

  // Nav menu (Accueil + Collections dropdown are structural/built-in on the
  // frontend; these are the admin-editable extra links)
  const navCount = await prisma.navMenuItem.count();
  if (navCount === 0) {
    await prisma.navMenuItem.createMany({
      data: [
        { label: 'Parfums', href: '#collection/parfums', position: 0 },
        { label: 'Fidélité', href: '#loyalty', position: 1 },
        { label: 'Contact', href: '#contact', position: 2 },
      ],
    });
  }

  // Site settings (WhatsApp / Instagram) — left blank for the admin to fill in
  const siteSettingsCount = await prisma.siteSettings.count();
  if (siteSettingsCount === 0) {
    await prisma.siteSettings.create({ data: {} });
  }

  // Loyalty settings
  const loyaltySettingsCount = await prisma.loyaltySettings.count();
  if (loyaltySettingsCount === 0) {
    await prisma.loyaltySettings.create({ data: { amountPerPoint: 199, isActive: true } });
  }

  // Loyalty rewards (examples — fully admin-editable afterwards)
  const rewardCount = await prisma.loyaltyReward.count();
  if (rewardCount === 0) {
    await prisma.loyaltyReward.createMany({
      data: [
        { name: 'Cadeau surprise', description: 'Un échantillon surprise offert avec votre prochaine commande.', pointsRequired: 4, position: 0 },
        { name: '1 parfum offert', description: 'Un parfum au choix offert.', pointsRequired: 5, productsIncluded: '1 parfum au choix', position: 1 },
        { name: '2 parfums offerts', description: 'Deux parfums au choix offerts.', pointsRequired: 10, productsIncluded: '2 parfums au choix', position: 2 },
        { name: 'Pack de 3 parfums offert', description: 'Un pack de 3 parfums au choix, offert.', pointsRequired: 12, productsIncluded: '3 parfums au choix', position: 3 },
        { name: 'Pack de 3 parfums + 1 gel douche', description: 'Un pack de 3 parfums et un gel douche au choix, offerts.', pointsRequired: 18, productsIncluded: '3 parfums + 1 gel douche au choix', position: 4 },
        { name: 'Pack complet', description: '4 parfums + 2 gels douche + 1 supplément ou cosmétique au choix, offerts.', pointsRequired: 21, productsIncluded: '4 parfums + 2 gels douche + 1 supplément/cosmétique', position: 5 },
      ],
    });
  }

  // Admin user
  const adminEmail = 'achraferrami10@gmail.com';
  const existingAdmin = await prisma.adminUser.findUnique({ where: { email: adminEmail } });
  if (!existingAdmin) {
    const { hash, salt } = hashPassword('Veintuno2026!');
    await prisma.adminUser.create({
      data: { email: adminEmail, name: 'Achraf', passwordHash: hash, passwordSalt: salt },
    });
    console.log(`Admin créé : ${adminEmail} / mot de passe temporaire : Veintuno2026!`);
  }

  console.log('Seed terminé.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
