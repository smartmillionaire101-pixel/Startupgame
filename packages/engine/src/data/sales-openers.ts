/**
 * What you lead with in a sales conversation (salestalk.ts), per customer
 * segment and per need (round 7, player feedback: a telehealth company
 * selling to a hospital opened with "Records, bookings and billing in one
 * place, built for how you work"). Openings fit the industry, the segment
 * (a hospital hears about patients, a family about their children) and the
 * company's idea: in an industry with more than one kind of product, the
 * product-fit opening follows the idea's words (a telehealth idea talks
 * about doctors on the phone, a records idea about records and billing).
 *
 * Engine-side English and French, like ./customer-interviews.ts.
 */
import type { Line } from './customer-interviews.js';
import type { Industry } from './industries.js';

const L = (en: string, fr: string): Line => ({ en, fr });

/** The needs an opening speaks to (sales.ts SalesNeed); "tour" is the same everywhere. */
export type OpenerNeed = 'fit' | 'price' | 'stars' | 'reliability';

/**
 * The kinds of product an industry's ideas fall into, and the words in an
 * idea that say which. An industry not listed has one kind of product.
 */
export const PRODUCT_THEMES: Partial<Record<Industry, { id: string; words: RegExp }[]>> = {
  fintech: [
    {
      id: 'payments',
      words: /\b(pay|payments?|cards?|checkout|payouts?|wallets?|transfers?|pos|tap)\b/i,
    },
    {
      id: 'books',
      words:
        /\b(owe[sd]?|credit|invoic\w*|books?|bookkeeping|ledgers?|reconcil\w*|debts?|accounting)\b/i,
    },
  ],
  healthtech: [
    {
      id: 'care',
      words:
        /\b(doctors?|tele\w*|video|consult\w*|nurses?|symptoms?|virtual|care|gps?|prescriptions?)\b/i,
    },
    {
      id: 'records',
      words: /\b(records?|bookings?|billing|claims?|appointments?|practice|software|ehr|admin)\b/i,
    },
  ],
  edtech: [
    {
      id: 'learning',
      words:
        /\b(tutor\w*|learn\w*|exams?|practi[cs]e|lessons?|courses?|students?|revision|homework|classes)\b/i,
    },
    {
      id: 'admin',
      words: /\b(fees?|admin\w*|registers?|reports?|attendance|billing|payments?)\b/i,
    },
  ],
};

/** A starting idea (data/ideas.ts) whose kind of product its id already says. */
export const IDEA_THEME: Record<string, string> = {
  'market-pay': 'payments',
  'tutor-match': 'learning',
};

interface SegmentOpeners {
  /** The product-fit opening, per kind of product (the first is the segment's own default). */
  fit: Record<string, Line>;
  price: Line;
  stars: Line;
  reliability: Line;
}

// prettier-ignore
export const SALES_OPENERS: Record<string, SegmentOpeners> = {
  // ---- Fintech
  'fintech.traders': {
    fit: {
      books: L('“See who owes you, live, without chasing anyone by phone.”', '« Voyez qui vous doit, en direct, sans relancer personne au téléphone. »'),
      payments: L('“Take card and phone payments at your stall, even when the network is slow.”', '« Encaissez carte et téléphone à votre étal, même quand le réseau rame. »'),
    },
    price: L('“Lower fees than the bank’s card machine, and no monthly rent.”', '« Moins de frais que le terminal de la banque, et pas de location mensuelle. »'),
    stars: L('“Traders in your market already use us.”', '« Les commerçants de votre marché nous utilisent déjà. »'),
    reliability: L('“It works offline and never loses a sale.”', '« Ça marche hors connexion et ne perd jamais une vente. »'),
  },
  'fintech.online-sellers': {
    fit: {
      payments: L('“Your money the same day, with a checkout your buyers already trust.”', '« Votre argent le jour même, avec un paiement auquel vos acheteurs font déjà confiance. »'),
      books: L('“Every order matched to its payment by itself: your evenings back.”', '« Chaque commande rapprochée toute seule de son paiement : vos soirées vous reviennent. »'),
    },
    price: L('“Lower fees than the big payment links.”', '« Moins de frais que les gros liens de paiement. »'),
    stars: L('“Sellers like you already get paid through us.”', '« Des vendeurs comme vous sont déjà payés par nous. »'),
    reliability: L('“Payouts that never fail, or we pay the fee.”', '« Des versements qui n’échouent jamais, sinon on paie les frais. »'),
  },
  'fintech.distributors': {
    fit: {
      books: L('“A live view of what every retailer owes you, without the Friday calls.”', '« Une vue en direct de ce que chaque détaillant vous doit, sans les appels du vendredi. »'),
      payments: L('“Retailers pay you by phone, and each payment lands on the right invoice.”', '« Les détaillants vous paient par téléphone, et chaque paiement tombe sur la bonne facture. »'),
    },
    price: L('“Less than your accountant costs you now.”', '« Moins que ce que vous coûte votre comptable aujourd’hui. »'),
    stars: L('“Reports your bank already trusts.”', '« Des rapports auxquels votre banque fait déjà confiance. »'),
    reliability: L('“Never loses a record, online or off: ready for the audit every month.”', '« Ne perd jamais une écriture, en ligne ou non : prêt pour l’audit chaque mois. »'),
  },
  // ---- E-commerce
  'ecommerce.urban': {
    fit: { shop: L('“Order in a minute from your phone, the way you already buy.”', '« Commandez en une minute depuis votre téléphone, comme vous achetez déjà. »') },
    price: L('“Market prices, delivered, with no fee.”', '« Les prix du marché, livrés, sans frais. »'),
    stars: L('“Everyone in your area already orders from us.”', '« Tout votre quartier commande déjà chez nous. »'),
    reliability: L('“It arrives when we say, or you don’t pay.”', '« Ça arrive à l’heure dite, ou vous ne payez pas. »'),
  },
  'ecommerce.retailers': {
    fit: { shop: L('“Restock from your phone, on two weeks’ credit.”', '« Réassortissez depuis votre téléphone, avec deux semaines de crédit. »') },
    price: L('“Wholesale prices without the trip to the wholesaler.”', '« Les prix de gros sans le trajet chez le grossiste. »'),
    stars: L('“Shops on your street already restock with us.”', '« Les boutiques de votre rue se réassortissent déjà chez nous. »'),
    reliability: L('“Your stock arrives on the day we say, every time.”', '« Votre stock arrive le jour dit, à chaque fois. »'),
  },
  'ecommerce.brands': {
    fit: { shop: L('“Weekly sales by shop and area, so you move the budget yourself.”', '« Les ventes de la semaine par boutique et par quartier, pour déplacer le budget vous-même. »') },
    price: L('“Less than your agency, and it reports sales, not likes.”', '« Moins cher que votre agence, et ça rend compte des ventes, pas des « j’aime ». »'),
    stars: L('“Big brands in the city already sell through us.”', '« De grandes marques de la ville vendent déjà par nous. »'),
    reliability: L('“Your products never sit next to fakes.”', '« Vos produits ne sont jamais à côté de contrefaçons. »'),
  },
  // ---- Logistics
  'logistics.sellers': {
    fit: { delivery: L('“One tracking link your customers can follow, so they stop calling you.”', '« Un lien de suivi pour vos clients, pour qu’ils arrêtent de vous appeler. »') },
    price: L('“A fixed price per parcel, lower than your deliveries cost now.”', '« Un prix fixe par colis, moins cher que vos livraisons aujourd’hui. »'),
    stars: L('“Sellers across the city already ship with us.”', '« Des vendeurs de toute la ville expédient déjà avec nous. »'),
    reliability: L('“On time, every time, or the delivery is free.”', '« À l’heure, à chaque fois, ou la livraison est offerte. »'),
  },
  'logistics.retailers': {
    fit: { delivery: L('“We pick up your stock and bring it to your door.”', '« On récupère votre stock et on l’apporte à votre porte. »') },
    price: L('“One price a week, written down, lower than your carrying costs now.”', '« Un prix par semaine, écrit, moins cher que votre transport aujourd’hui. »'),
    stars: L('“Shops on your street already use our pickups.”', '« Les boutiques de votre rue utilisent déjà nos ramassages. »'),
    reliability: L('“We come on the day we say, rain or shine.”', '« On vient le jour dit, qu’il pleuve ou qu’il vente. »'),
  },
  'logistics.shippers': {
    fit: { delivery: L('“Delivery windows guaranteed across the region, far depots included.”', '« Des créneaux garantis dans toute la région, dépôts éloignés compris. »') },
    price: L('“A lower cost per truckload than your carriers together.”', '« Un coût par camion plus bas que vos transporteurs réunis. »'),
    stars: L('“The biggest shippers in the city already use us.”', '« Les plus gros expéditeurs de la ville nous utilisent déjà. »'),
    reliability: L('“Real penalties in the contract if we miss a window.”', '« De vraies pénalités au contrat si on manque un créneau. »'),
  },
  // ---- Health
  'healthtech.families': {
    fit: {
      care: L('“A licensed doctor on the phone in ten minutes, day or night.”', '« Un médecin diplômé au téléphone en dix minutes, de jour comme de nuit. »'),
      records: L('“Your family’s health records and bookings in one place, on your phone.”', '« Les dossiers et rendez-vous de santé de la famille au même endroit, sur votre téléphone. »'),
    },
    price: L('“Less than one clinic visit a month, for the whole family.”', '« Moins qu’une consultation par mois, pour toute la famille. »'),
    stars: L('“Licensed doctors, a name families already trust.”', '« Des médecins diplômés, un nom auquel les familles font déjà confiance. »'),
    reliability: L('“Doctors there day and night, every day of the year.”', '« Des médecins là jour et nuit, tous les jours de l’année. »'),
  },
  'healthtech.clinics': {
    fit: {
      records: L('“Records, bookings and billing in one place, built for how your clinic works.”', '« Dossiers, rendez-vous et facturation au même endroit, pensés pour votre clinique. »'),
      care: L('“Your doctors see patients by video: shorter queues and more patients seen, safely.”', '« Vos médecins voient les patients en vidéo : moins d’attente et plus de patients, en toute sécurité. »'),
    },
    price: L('“Less than one salary a month, and it pays for itself.”', '« Moins qu’un salaire par mois, et ça se rentabilise. »'),
    stars: L('“Clinics and hospitals across the city already work with us.”', '« Des cliniques et des hôpitaux de toute la ville travaillent déjà avec nous. »'),
    reliability: L('“Patient data stays protected, and it’s up day and night.”', '« Les données des patients restent protégées, et c’est disponible jour et nuit. »'),
  },
  'healthtech.employers': {
    fit: {
      care: L('“Your staff see a doctor by phone, not with a day off.”', '« Votre personnel voit un médecin par téléphone, sans prendre une journée. »'),
      records: L('“Sick days and health cover in one place your HR team can see.”', '« Arrêts maladie et couverture santé au même endroit, visibles par vos RH. »'),
    },
    price: L('“A clear cost per employee, less than an insurance top-up.”', '« Un coût par employé clair, moins qu’un complément d’assurance. »'),
    stars: L('“A health brand your staff already trust.”', '« Une marque de santé à laquelle votre personnel fait déjà confiance. »'),
    reliability: L('“Doctors on call for every shift, day and night.”', '« Des médecins de garde pour chaque équipe, jour et nuit. »'),
  },
  // ---- Education
  'edtech.parents': {
    fit: {
      learning: L('“Exam practice on any phone, marked as they go.”', '« Des exercices d’examen sur n’importe quel téléphone, corrigés au fur et à mesure. »'),
      admin: L('“School fees, reports and homework in one app.”', '« Frais de scolarité, bulletins et devoirs dans une seule appli. »'),
    },
    price: L('“Cheaper than one month of a home tutor.”', '« Moins cher qu’un mois de répétiteur. »'),
    stars: L('“Families across the city already learn with us.”', '« Des familles de toute la ville apprennent déjà avec nous. »'),
    reliability: L('“Works on any phone, even without data.”', '« Marche sur n’importe quel téléphone, même sans données. »'),
  },
  'edtech.schools': {
    fit: {
      admin: L('“It saves your teachers hours, and parents pay on time.”', '« Ça fait gagner des heures à vos enseignants, et les parents paient à l’heure. »'),
      learning: L('“Practice and marking for every class, so your teachers can teach.”', '« Exercices et corrections pour chaque classe, pour que vos enseignants enseignent. »'),
    },
    price: L('“Less than one teacher’s salary a month.”', '« Moins qu’un salaire d’enseignant par mois. »'),
    stars: L('“Schools across the city already use us.”', '« Des écoles de toute la ville nous utilisent déjà. »'),
    reliability: L('“Nothing is ever lost, and it works on any phone.”', '« Rien n’est jamais perdu, et ça marche sur n’importe quel téléphone. »'),
  },
  'edtech.corporate': {
    fit: {
      learning: L('“Short courses on the phone that staff actually finish, with certificates.”', '« Des cours courts sur téléphone que le personnel termine vraiment, avec certificats. »'),
      admin: L('“Who is trained and who isn’t: a report your auditors accept.”', '« Qui est formé et qui ne l’est pas : un rapport accepté par vos auditeurs. »'),
    },
    price: L('“Less than flying in a trainer twice a year.”', '« Moins cher que de faire venir un formateur deux fois par an. »'),
    stars: L('“Certificates the regulator already recognises.”', '« Des certificats que le régulateur reconnaît déjà. »'),
    reliability: L('“Every course finished is recorded, ready for the audit.”', '« Chaque formation terminée est enregistrée, prête pour l’audit. »'),
  },
  // ---- Business software
  'saas.solo': {
    fit: { tools: L('“Send an invoice from your phone in a minute, and it chases them for you.”', '« Envoyez une facture depuis votre téléphone en une minute, et ça relance pour vous. »') },
    price: L('“Cheaper than one lost invoice a year.”', '« Moins cher qu’une facture perdue par an. »'),
    stars: L('“Freelancers across the city already bill with us.”', '« Des indépendants de toute la ville facturent déjà avec nous. »'),
    reliability: L('“Works on your phone, online or off.”', '« Marche sur votre téléphone, en ligne ou non. »'),
  },
  'saas.smes': {
    fit: { tools: L('“Stock, sales and payroll in one place: no more retyping.”', '« Stock, ventes et paie au même endroit : fini la ressaisie. »') },
    price: L('“Less than the tools you pay for now, put together.”', '« Moins cher que les outils que vous payez aujourd’hui, réunis. »'),
    stars: L('“Businesses like yours already run on us.”', '« Des entreprises comme la vôtre tournent déjà avec nous. »'),
    reliability: L('“A real person on the phone when something breaks.”', '« Une vraie personne au téléphone quand quelque chose plante. »'),
  },
  'saas.midmarket': {
    fit: { tools: L('“It plugs into the systems you run, with security your auditors sign off.”', '« Ça se branche sur vos systèmes, avec une sécurité validée par vos auditeurs. »') },
    price: L('“Half the price of the big international vendors.”', '« Moitié prix par rapport aux gros éditeurs internationaux. »'),
    stars: L('“Companies your size already run on us, with references.”', '« Des entreprises de votre taille tournent déjà avec nous, références à l’appui. »'),
    reliability: L('“Uptime in the contract, and support in your time zone.”', '« La disponibilité au contrat, et un support dans votre fuseau horaire. »'),
  },
  // ---- Agriculture
  'agritech.farmers': {
    fit: { supply: L('“Seeds on credit at planting, and a fair price at harvest.”', '« Des semences à crédit à la plantation, et un prix juste à la récolte. »') },
    price: L('“Better prices than the middleman, every week.”', '« De meilleurs prix que l’intermédiaire, chaque semaine. »'),
    stars: L('“Farmers in your area already sell with us.”', '« Les agriculteurs de votre région vendent déjà avec nous. »'),
    reliability: L('“Our truck comes on the day we say.”', '« Notre camion vient le jour dit. »'),
  },
  'agritech.food-retail': {
    fit: { supply: L('“Fresh produce at your door every morning, at market prices.”', '« Des produits frais à votre porte chaque matin, au prix du marché. »') },
    price: L('“Market prices without the early trip, and nothing to pay for bad produce.”', '« Les prix du marché sans le trajet à l’aube, et rien à payer si c’est abîmé. »'),
    stars: L('“Kitchens across the city already buy from us.”', '« Des cuisines de toute la ville achètent déjà chez nous. »'),
    reliability: L('“Delivered every morning, without fail.”', '« Livré chaque matin, sans faute. »'),
  },
  'agritech.processors': {
    fit: { supply: L('“Graded, traceable supply in the volumes you plan for.”', '« Un approvisionnement calibré et traçable, dans les volumes que vous prévoyez. »') },
    price: L('“A lower cost per tonne than your aggregators’ margins.”', '« Un coût à la tonne plus bas que les marges de vos collecteurs. »'),
    stars: L('“The biggest buyers in the region already work with us.”', '« Les plus gros acheteurs de la région travaillent déjà avec nous. »'),
    reliability: L('“The same volume every week, on the day.”', '« Le même volume chaque semaine, le jour prévu. »'),
  },
};

/** The kind of product a company's idea is (null: the segment's own default). */
export function productTheme(
  industry: Industry,
  idea: string,
  starterIdeaId?: string,
): string | null {
  if (starterIdeaId && IDEA_THEME[starterIdeaId]) return IDEA_THEME[starterIdeaId]!;
  const themes = PRODUCT_THEMES[industry];
  if (!themes) return null;
  // The theme whose words the idea uses most; a tie goes to the first named.
  let best: string | null = null;
  let most = 0;
  for (const t of themes) {
    const n = idea.match(new RegExp(t.words.source, 'gi'))?.length ?? 0;
    if (n > most) {
      most = n;
      best = t.id;
    }
  }
  return best;
}

/** The opening for a need, in a segment, for a company with this idea. */
export function openerFor(segmentKey: string, need: OpenerNeed, theme: string | null): Line | null {
  const s = SALES_OPENERS[segmentKey];
  if (!s) return null;
  if (need !== 'fit') return s[need];
  return (theme ? s.fit[theme] : undefined) ?? Object.values(s.fit)[0]!;
}
