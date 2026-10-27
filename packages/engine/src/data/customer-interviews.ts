/**
 * Customer interviews and sales conversations: what people say (player
 * feedback, round two: "When I click interview customers I don't really
 * interview"; "I should be quizzed with context of the business and their
 * needs"). Engine-side English and French, like the quiz bank, so a line and
 * its translation never drift apart.
 *
 * Interviews (customer-interviews.ts): three rounds. Each round offers three
 * questions: the best one (open, about a real past event) and two of a broad
 * open one, a yes/no, a leading one and a too-early one (a price or a pilot),
 * in the industry's own words (./interview-industries.ts).
 * The interviewee answers in character: three people per segment, each with
 * their own story of the problem; what they tried and what would make them
 * switch come in two versions per segment. Placeholders filled per city:
 * {lost} (what the problem cost them last month), {spend} (what they pay for
 * a fix today), {price} (the price a too-early question names), {benefit}
 * (what your product would do, in their segment's words).
 *
 * Sales conversations (salestalk.ts): what to lead with, per industry and per
 * need (sales.ts SalesNeed), and the terms on offer.
 */
import type { Industry } from './industries.js';

export interface Line {
  en: string;
  fr: string;
}
const L = (en: string, fr: string): Line => ({ en, fr });

// ---------------------------------------------------------------- Interviews

/** A question's kind, from best to worst. */
export type QuestionKind = 'best' | 'broad' | 'yesno' | 'leading' | 'early';
export const QUESTION_KINDS: readonly QuestionKind[] = [
  'best',
  'broad',
  'yesno',
  'leading',
  'early',
];

/** What each kind of question is worth (0–1), whatever the round. */
export const QUESTION_SCORE: Record<QuestionKind, number> = {
  best: 1,
  broad: 0.6,
  yesno: 0.35,
  leading: 0.15,
  early: 0.1,
};

/** The note a good answer fills, per round. */
export type NoteKey = 'pain' | 'paysNow' | 'switchIf' | 'price';
export const ROUND_NOTE: readonly NoteKey[] = ['pain', 'paysNow', 'switchIf'];

export interface Persona {
  /** Their business, and how long they have run it. */
  job: Line;
  detail: Line;
  greeting: Line;
  /** Their answer to the round-1 best question, and the note it leaves. */
  pain: Line;
  painNote: Line;
}

export interface SegmentInterview {
  /** The round-1 best question, in this segment's words. */
  ask: Line;
  /** What your product would do for them (a verb phrase: "an app that …"). */
  benefit: Line;
  /** Round 2 best answers (what they tried / pay now), with their notes. */
  tried: [Line, Line][];
  /** Round 3 best answers (what would make them switch), with their notes. */
  switchIf: [Line, Line][];
  /** The question to ask next time, and why. */
  deeper: Line;
  deeperWhy: Line;
  personas: Persona[];
}

/** The note a too-early question leaves (a broad one's is the industry's, ./interview-industries). */
export const WEAK_NOTES: Partial<Record<QuestionKind, Partial<Record<NoteKey, Line>>>> = {
  early: {
    price: L(
      '“Yes” to {price}, but polite: unproven',
      '« Oui » à {price}, mais par politesse : rien de prouvé',
    ),
  },
};

/** Why a question was good or bad (the summary's 💡 line). Best questions have one per round. */
export const QUESTION_WHY: Record<QuestionKind, Line[]> = {
  best: [
    L(
      'A real day beats an opinion: you got a figure.',
      'Une vraie journée vaut mieux qu’un avis : vous avez un chiffre.',
    ),
    L(
      'Shows what they’ll put up with, and why the last fix failed.',
      'Montre ce qu’ils supportent, et pourquoi la dernière solution a échoué.',
    ),
    L(
      'Their own words for what would make them switch: that’s your pitch.',
      'Leurs propres mots sur ce qui les ferait changer : c’est votre argumentaire.',
    ),
  ],
  broad: [
    L(
      'Open, but too general: feelings, not facts. Ask about a real day.',
      'Ouverte, mais trop générale : des impressions, pas des faits. Demandez une vraie journée.',
    ),
  ],
  yesno: [
    L(
      'A yes/no question ends the story before it starts.',
      'Une question fermée arrête l’histoire avant qu’elle commence.',
    ),
  ],
  leading: [
    L(
      'A leading question gets a polite yes that teaches you nothing.',
      'Une question orientée obtient un oui poli qui ne vous apprend rien.',
    ),
  ],
  early: [
    L(
      'Too early: people say yes to be polite. A cost they name themselves is a real price ceiling.',
      'Trop tôt : on dit oui par politesse. Un coût qu’ils citent eux-mêmes est un vrai plafond de prix.',
    ),
  ],
};

/** The summary's headline, by score. */
export const INTERVIEW_GRADES: { min: number; label: Line }[] = [
  { min: 80, label: L('Great interview', 'Excellent entretien') },
  { min: 60, label: L('Good interview', 'Bon entretien') },
  { min: 40, label: L('Some useful lines', 'Quelques lignes utiles') },
  { min: 0, label: L('You learned little', 'Vous avez appris peu de choses') },
];

const tried = (a: Line, n: Line): [Line, Line] => [a, n];

// prettier-ignore
export const SEGMENT_INTERVIEWS: Record<string, SegmentInterview> = {
  // ---- Fintech
  'fintech.traders': {
    ask: L('Walk me through yesterday: how did you keep track of who owes you?', 'Racontez-moi hier : comment avez-vous suivi qui vous doit de l’argent ?'),
    benefit: L('reminds your customers what they owe', 'rappelle à vos clients ce qu’ils vous doivent'),
    tried: [
      tried(L('“Someone put me on a spreadsheet app. With dirty hands? Too slow. Two weeks, back to the book. And when the power goes, the phone is for customers’ calls.”', '« On m’a mis sur une appli de tableur. Avec les mains sales ? Trop lent. Deux semaines, et retour au cahier. Et quand le courant saute, le téléphone sert aux appels des clients. »'), L('Nothing: an exercise book. Quit a spreadsheet app after 2 weeks', 'Rien : un cahier. A abandonné une appli de tableur après 2 semaines')),
      tried(L('“The bank sent a man with a card machine. {spend} a month in charges, and when the network is down it just spins. I keep it for big customers.”', '« La banque a envoyé quelqu’un avec un terminal de paiement. {spend} de frais par mois, et quand le réseau tombe, il tourne dans le vide. Je le garde pour les gros clients. »'), L('{spend} a month in card-machine charges; useless when the network is down', '{spend} par mois de frais de terminal ; inutile quand le réseau tombe')),
    ],
    switchIf: [
      tried(L('“If it sends the reminder for me. In my language, in my name, so they don’t take offence. And it must work without data.”', '« S’il envoie le rappel à ma place. Dans ma langue, en mon nom, pour qu’ils ne se vexent pas. Et ça doit marcher sans données. »'), L('It sends the reminders for them, in their language, offline', 'Il envoie les rappels à leur place, dans leur langue, hors connexion')),
      tried(L('“If at night I can see who paid and who didn’t, without counting. If it costs less than what I lose, I take it tomorrow.”', '« Si le soir je vois qui a payé et qui n’a pas payé, sans compter. Si ça coûte moins que ce que je perds, je le prends demain. »'), L('Sees each night who paid; costs less than what they lose', 'Voit chaque soir qui a payé ; coûte moins que ce qui est perdu')),
    ],
    deeper: L('What happened the last time someone didn’t pay?', 'Que s’est-il passé la dernière fois que quelqu’un n’a pas payé ?'),
    deeperWhy: L('A story gives you the real cost, how they chase it today (calls? visits?) and who feels it.', 'Une histoire vous donne le vrai coût, comment ils relancent aujourd’hui (appels ? visites ?) et qui le subit.'),
    personas: [
      { job: L('Phone-repair kiosk · 6 years', 'Kiosque de réparation de téléphones · 6 ans'), detail: L('Fixes 8–12 phones a day · lets regulars “pay later”', 'Répare 8 à 12 téléphones par jour · laisse les habitués « payer plus tard »'), greeting: L('“You’re the one doing the app? Sit, sit. I have ten minutes before the next customer comes back.”', '« C’est vous qui faites l’appli ? Asseyez-vous. J’ai dix minutes avant que le prochain client revienne. »'), pain: L('“Exercise book. Repair, price, and if they pay later I write the name in red. Last month I counted the red: {lost} I never collected.”', '« Un cahier. La réparation, le prix, et s’ils paient plus tard j’écris le nom en rouge. Le mois dernier j’ai compté le rouge : {lost} jamais encaissés. »'), painNote: L('Pay-later repairs never paid: {lost} last month', 'Réparations à crédit jamais payées : {lost} le mois dernier') },
      { job: L('Fabric stall · 11 years', 'Étal de tissus · 11 ans'), detail: L('Sells to tailors on credit · family helps on Saturdays', 'Vend à crédit aux tailleurs · la famille aide le samedi'), greeting: L('“Come in from the sun. You want to sell me something, or buy fabric?”', '« Entrez, sortez du soleil. Vous voulez me vendre quelque chose, ou acheter du tissu ? »'), pain: L('“The tailors take now and pay at month end. I keep it in my head, and my head forgets. Last month I lost {lost}, maybe more.”', '« Les tailleurs prennent maintenant et paient en fin de mois. Je garde tout en tête, et ma tête oublie. Le mois dernier j’ai perdu {lost}, peut-être plus. »'), painNote: L('Credit to tailors kept in memory: about {lost} lost last month', 'Crédit aux tailleurs gardé en mémoire : environ {lost} perdus le mois dernier') },
      { job: L('Food-stuff shop · 4 years', 'Boutique de vivres · 4 ans'), detail: L('Rice, oil and noodles by the carton · cash and transfers', 'Riz, huile et nouilles au carton · espèces et virements'), greeting: L('“Quick, quick: the bus drivers come at five.”', '« Vite, vite : les chauffeurs de bus arrivent à cinq heures. »'), pain: L('“Transfers. The customer says ‘I’ve sent it’, I can’t check until night. Last month {lost} of ‘I’ve sent it’ never arrived.”', '« Les virements. Le client dit « c’est envoyé », je ne peux vérifier que le soir. Le mois dernier, {lost} de « c’est envoyé » ne sont jamais arrivés. »'), painNote: L('Transfers that never arrived: {lost} last month', 'Virements jamais arrivés : {lost} le mois dernier') },
    ],
  },
  'fintech.online-sellers': {
    ask: L('Tell me about your last big sales day: how did the money reach you?', 'Racontez-moi votre dernière grosse journée de ventes : comment l’argent vous est-il parvenu ?'),
    benefit: L('pays you out the same day', 'vous verse l’argent le jour même'),
    tried: [
      tried(L('“I use a payment link from a big provider. It takes {spend} a month in fees and pays out after three days. I borrow to restock meanwhile.”', '« J’utilise un lien de paiement d’un gros prestataire. Il prend {spend} de frais par mois et verse au bout de trois jours. En attendant, j’emprunte pour réassortir. »'), L('{spend} a month in fees; payouts take 3 days, borrows to restock', '{spend} par mois de frais ; versements en 3 jours, emprunte pour réassortir')),
      tried(L('“Bank transfer to my personal account. Free, but I spend an hour every night matching names to orders. I tried a shop app once; customers didn’t trust the checkout.”', '« Virement sur mon compte perso. Gratuit, mais je passe une heure chaque soir à rapprocher les noms des commandes. J’ai essayé une appli de boutique ; les clients ne faisaient pas confiance au paiement. »'), L('Free transfers, but an hour a night matching orders; a shop app failed on trust', 'Virements gratuits, mais une heure par soir à rapprocher ; une appli a échoué faute de confiance')),
    ],
    switchIf: [
      tried(L('“Same-day money, and a checkout my customers already know. If one payout fails, I’m gone.”', '« L’argent le jour même, et un paiement que mes clients connaissent déjà. Si un seul versement échoue, je pars. »'), L('Same-day payouts, a checkout customers trust; one failure and they leave', 'Versements le jour même, paiement de confiance ; un échec et ils partent')),
      tried(L('“If every order matches its payment by itself. That hour every night is the hour I could be selling.”', '« Si chaque commande se rapproche toute seule de son paiement. Cette heure chaque soir, c’est une heure où je pourrais vendre. »'), L('Orders matched to payments automatically: gives back an hour a night', 'Commandes rapprochées automatiquement des paiements : une heure par soir gagnée')),
    ],
    deeper: L('What happened the last time a payout was late?', 'Que s’est-il passé la dernière fois qu’un versement a été en retard ?'),
    deeperWhy: L('A late payout story shows the real cost: lost stock, borrowing, angry buyers.', 'L’histoire d’un retard montre le vrai coût : stock perdu, emprunts, acheteurs fâchés.'),
    personas: [
      { job: L('Sells sneakers on social media · 3 years', 'Vend des baskets sur les réseaux sociaux · 3 ans'), detail: L('40–60 orders a week · ships from a spare room', '40 à 60 commandes par semaine · expédie depuis une chambre'), greeting: L('“Hold on, I’m answering three buyers at once. OK. Go.”', '« Attendez, je réponds à trois acheteurs en même temps. OK. Allez-y. »'), pain: L('“Friday sale, 70 orders. The money came on Tuesday. Meanwhile my supplier wanted cash, so I lost the new stock: about {lost} of sales gone.”', '« Vente du vendredi, 70 commandes. L’argent est arrivé le mardi. Entre-temps mon fournisseur voulait du liquide, alors j’ai perdu le nouveau stock : environ {lost} de ventes envolées. »'), painNote: L('Slow payouts cost a restock: about {lost} of sales lost', 'Versements lents : un réassort raté, environ {lost} de ventes perdues') },
      { job: L('Home-made skincare shop · 2 years', 'Boutique de soins faits maison · 2 ans'), detail: L('Sells through a website and chat · two part-time packers', 'Vend par un site et la messagerie · deux emballeurs à temps partiel'), greeting: L('“Sorry for the smell: shea butter day. Sit down.”', '« Désolé pour l’odeur : c’est le jour du beurre de karité. Asseyez-vous. »'), pain: L('“Last month a customer paid twice by mistake and I refunded the wrong person. Sorting it out took a week and {lost}.”', '« Le mois dernier, une cliente a payé deux fois par erreur et j’ai remboursé la mauvaise personne. Tout démêler m’a pris une semaine et {lost}. »'), painNote: L('Payments mixed up: a week and {lost} lost on one refund', 'Paiements mélangés : une semaine et {lost} perdus sur un remboursement') },
      { job: L('Phone accessories store online · 5 years', 'Accessoires de téléphone en ligne · 5 ans'), detail: L('Ships across the country · cash on delivery for half the orders', 'Expédie dans tout le pays · paiement à la livraison pour la moitié des commandes'), greeting: L('“You can have twenty minutes. The courier comes at four.”', '« Vous avez vingt minutes. Le coursier passe à quatre heures. »'), pain: L('“Cash on delivery. The rider collects, keeps it for a week, sometimes ‘loses’ some. Last month {lost} never came back to me.”', '« Le paiement à la livraison. Le livreur encaisse, garde l’argent une semaine, en « perd » parfois. Le mois dernier, {lost} ne me sont jamais revenus. »'), painNote: L('Cash on delivery not handed over: {lost} last month', 'Paiements à la livraison non reversés : {lost} le mois dernier') },
    ],
  },
  'fintech.distributors': {
    ask: L('Walk me through your last month-end: how did you know which retailers owed you?', 'Racontez-moi votre dernière fin de mois : comment saviez-vous quels détaillants vous devaient de l’argent ?'),
    benefit: L('shows who owes you, live', 'montre qui vous doit de l’argent, en direct'),
    tried: [
      tried(L('“An accountant comes in for {spend} a month to reconcile. He’s good, but he doesn’t chase anybody, and he’s two weeks behind.”', '« Un comptable vient pour {spend} par mois faire les rapprochements. Il est bon, mais il ne relance personne, et il a deux semaines de retard. »'), L('{spend} a month for an accountant who reconciles two weeks late', '{spend} par mois pour un comptable qui rapproche avec deux semaines de retard')),
      tried(L('“We bought the big accounting software. {spend} a month. The clerks still keep their own spreadsheets because it doesn’t work offline.”', '« On a acheté le gros logiciel de comptabilité. {spend} par mois. Les employés tiennent encore leurs propres tableurs parce qu’il ne marche pas hors connexion. »'), L('{spend} a month on software the clerks avoid: no offline mode', '{spend} par mois pour un logiciel que les employés évitent : pas de mode hors connexion')),
    ],
    switchIf: [
      tried(L('“If I see, live, who owes me, without the Friday phone calls. And it must never lose a record. One lost invoice and the auditors eat me.”', '« Si je vois en direct qui me doit, sans les appels du vendredi. Et ça ne doit jamais perdre une écriture. Une facture perdue et les auditeurs me dévorent. »'), L('Live view of who owes them, never loses a record (audit coming)', 'Vue en direct de qui doit, ne perd jamais une écriture (audit à venir)')),
      tried(L('“A name I can show my bank. If my bank trusts the reports, I get a bigger credit line. That’s worth more than the software.”', '« Un nom que je peux montrer à ma banque. Si ma banque fait confiance aux rapports, j’obtiens une plus grande ligne de crédit. Ça vaut plus que le logiciel. »'), L('Reports their bank trusts: a bigger credit line is the prize', 'Des rapports qui inspirent confiance à la banque : une ligne de crédit plus grande à la clé')),
    ],
    deeper: L('What happened the last time a retailer disputed what they owed?', 'Que s’est-il passé la dernière fois qu’un détaillant a contesté ce qu’il devait ?'),
    deeperWhy: L('A dispute story shows who loses time, what proof they lack and what it costs the relationship.', 'Une histoire de litige montre qui perd du temps, quelle preuve manque et ce que ça coûte à la relation.'),
    personas: [
      { job: L('Phone distributor · supplies 140 kiosks', 'Distributeur de téléphones · fournit 140 kiosques'), detail: L('Sells on 30-day credit · 2 clerks, 6 delivery riders', 'Vend à crédit à 30 jours · 2 employés, 6 livreurs'), greeting: L('“My clerks say you have an app. Everybody has an app. Talk.”', '« Mes employés disent que vous avez une appli. Tout le monde a une appli. Parlez. »'), pain: L('“Every Friday the clerks phone all the retailers, one by one. At month end retailers owe us about {lost} and nobody agrees on the figure.”', '« Chaque vendredi, les employés appellent tous les détaillants, un par un. En fin de mois, ils nous doivent environ {lost} et personne n’est d’accord sur le chiffre. »'), painNote: L('About {lost} owed at month end; clerks chase by phone every Friday', 'Environ {lost} dus en fin de mois ; relances par téléphone chaque vendredi') },
      { job: L('Drinks wholesaler · 9 years', 'Grossiste en boissons · 9 ans'), detail: L('Two warehouses · 300 shops on account', 'Deux entrepôts · 300 boutiques en compte'), greeting: L('“Ten minutes. The trucks leave at noon and I sign every manifest.”', '« Dix minutes. Les camions partent à midi et je signe chaque bordereau. »'), pain: L('“Last quarter we found {lost} of crates delivered and never invoiced. The driver signed, the office never knew.”', '« Le trimestre dernier, on a trouvé {lost} de caisses livrées et jamais facturées. Le chauffeur a signé, le bureau n’a jamais su. »'), painNote: L('{lost} of deliveries never invoiced last quarter', '{lost} de livraisons jamais facturées le trimestre dernier') },
      { job: L('Pharmacy supplies distributor · 7 years', 'Distributeur de produits pharmaceutiques · 7 ans'), detail: L('Serves 80 pharmacies · strict batch records', 'Sert 80 pharmacies · registres de lots stricts'), greeting: L('“We’re regulated. Whatever you show me, tell me where the data lives.”', '« Nous sommes réglementés. Quoi que vous me montriez, dites-moi où sont les données. »'), pain: L('“A pharmacy said it paid; we said it didn’t. Three weeks of emails, {lost} frozen, and in the end it was our mistake.”', '« Une pharmacie disait avoir payé ; nous disions que non. Trois semaines d’e-mails, {lost} bloqués, et au final c’était notre erreur. »'), painNote: L('One payment dispute: 3 weeks and {lost} frozen', 'Un litige de paiement : 3 semaines et {lost} bloqués') },
    ],
  },
  // ---- E-commerce
  'ecommerce.urban': {
    ask: L('Tell me about the last thing you bought online: how did it go?', 'Parlez-moi de la dernière chose que vous avez achetée en ligne : comment ça s’est passé ?'),
    benefit: L('delivers the same day at market prices', 'livre le jour même au prix du marché'),
    tried: [
      tried(L('“I order from the big app sometimes. Delivery is {spend} on top, and twice the parcel came a week late.”', '« Je commande parfois sur la grosse appli. La livraison coûte {spend} en plus, et deux fois le colis est arrivé avec une semaine de retard. »'), L('Big app: {spend} delivery on top, parcels a week late twice', 'Grosse appli : {spend} de livraison en plus, colis en retard d’une semaine deux fois')),
      tried(L('“I buy from sellers on chat. Cheaper, but once I paid and the seller disappeared. Now I only pay on delivery.”', '« J’achète à des vendeurs sur la messagerie. Moins cher, mais une fois j’ai payé et le vendeur a disparu. Maintenant je paie seulement à la livraison. »'), L('Chat sellers: cheaper, but scammed once; now pays only on delivery', 'Vendeurs sur messagerie : moins cher, mais arnaqué une fois ; paie seulement à la livraison')),
    ],
    switchIf: [
      tried(L('“If the price is the same as the market, and I can pay when it arrives. Then why would I go to the market?”', '« Si le prix est le même qu’au marché, et que je paie à l’arrivée. Alors pourquoi j’irais au marché ? »'), L('Market prices, pay on delivery', 'Prix du marché, paiement à la livraison')),
      tried(L('“If friends tell me it’s real. I don’t download anything until two people I know use it.”', '« Si des amis me disent que c’est sérieux. Je ne télécharge rien tant que deux personnes que je connais ne l’utilisent pas. »'), L('Two friends vouch for it first', 'Deux amis s’en portent garants d’abord')),
    ],
    deeper: L('What happened the last time an order went wrong?', 'Que s’est-il passé la dernière fois qu’une commande a mal tourné ?'),
    deeperWhy: L('A bad order shows what they fear most: losing money, wasting time or being embarrassed.', 'Une commande ratée montre leur plus grande peur : perdre de l’argent, du temps, ou être gêné.'),
    personas: [
      { job: L('Nurse · night shifts', 'Infirmier·ère · gardes de nuit'), detail: L('Shops on the phone on the bus home', 'Fait ses achats sur le téléphone dans le bus du retour'), greeting: L('“I just finished a shift, so be quick, please.”', '« Je sors d’une garde, alors faites vite, s’il vous plaît. »'), pain: L('“I ordered a blender for my mother. Wrong one came, the return took three weeks and {lost} in calls and transport.”', '« J’ai commandé un mixeur pour ma mère. Le mauvais est arrivé, le retour a pris trois semaines et {lost} en appels et en transport. »'), painNote: L('One bad order: 3 weeks and {lost} to return it', 'Une commande ratée : 3 semaines et {lost} pour la retourner') },
      { job: L('Student · final year', 'Étudiant·e · dernière année'), detail: L('Buys clothes and data bundles online', 'Achète vêtements et forfaits en ligne'), greeting: L('“Is this for a project? I can help, I’m doing one too.”', '« C’est pour un projet ? Je peux aider, j’en fais un aussi. »'), pain: L('“I paid for shoes on a chat page. The seller blocked me. {lost}, gone. I told everyone in my hostel.”', '« J’ai payé des chaussures sur une page de messagerie. Le vendeur m’a bloqué. {lost}, envolés. Je l’ai dit à toute ma résidence. »'), painNote: L('Scammed by a chat seller: {lost} lost', 'Arnaqué par un vendeur sur messagerie : {lost} perdus') },
      { job: L('Office administrator · 10 years', 'Assistant·e administratif·ve · 10 ans'), detail: L('Shops for a family of five', 'Fait les courses pour une famille de cinq'), greeting: L('“Lunch break. You have until my rice gets cold.”', '« Pause déjeuner. Vous avez jusqu’à ce que mon riz refroidisse. »'), pain: L('“Saturday is market day: three hours and {lost} in transport every month. I’d pay to have that time back.”', '« Le samedi, c’est le marché : trois heures et {lost} de transport chaque mois. Je paierais pour récupérer ce temps. »'), painNote: L('Market runs: 3 hours a week and {lost} a month in transport', 'Courses au marché : 3 heures par semaine et {lost} par mois de transport') },
    ],
  },
  'ecommerce.retailers': {
    ask: L('Walk me through your last restock: how did you order, and how did it arrive?', 'Racontez-moi votre dernier réassort : comment avez-vous commandé, et comment est-il arrivé ?'),
    benefit: L('restocks your shop on credit', 'réassortit votre boutique à crédit'),
    tried: [
      tried(L('“I go to the wholesale market myself, every Tuesday. {spend} in transport each month, and the shop is closed while I’m gone.”', '« Je vais moi-même au marché de gros, chaque mardi. {spend} de transport par mois, et la boutique est fermée pendant ce temps. »'), L('Weekly trip to the wholesaler: {spend} a month, shop closed meanwhile', 'Trajet hebdomadaire chez le grossiste : {spend} par mois, boutique fermée pendant ce temps')),
      tried(L('“A distributor’s van comes, but only if I buy a full carton of everything, and only cash. I tried an ordering app; the van never came.”', '« La camionnette d’un distributeur passe, mais seulement si j’achète un carton entier de tout, et seulement en espèces. J’ai essayé une appli de commande ; la camionnette n’est jamais venue. »'), L('Van wants full cartons, cash only; an ordering app never delivered', 'La camionnette veut des cartons entiers, en espèces ; une appli n’a jamais livré')),
    ],
    switchIf: [
      tried(L('“Two weeks’ credit. If I can pay after I sell, I order from you every week.”', '« Deux semaines de crédit. Si je peux payer après avoir vendu, je commande chez vous chaque semaine. »'), L('Two weeks’ credit: pay after they sell', 'Deux semaines de crédit : payer après avoir vendu')),
      tried(L('“If it comes when you say it comes. Every time. My customers don’t wait for me.”', '« Si ça arrive quand vous dites que ça arrive. À chaque fois. Mes clients ne m’attendent pas. »'), L('Deliveries on time, every time', 'Livraisons à l’heure, à chaque fois')),
    ],
    deeper: L('What happened the last time you ran out of something?', 'Que s’est-il passé la dernière fois que vous avez été en rupture ?'),
    deeperWhy: L('A stock-out story puts a price on reliability: the sales lost and the customers who went next door.', 'Une histoire de rupture met un prix sur la fiabilité : les ventes perdues et les clients partis chez le voisin.'),
    personas: [
      { job: L('Corner shop · 8 years', 'Épicerie de quartier · 8 ans'), detail: L('Open 6am to 10pm · sells by the piece', 'Ouverte de 6 h à 22 h · vend à la pièce'), greeting: L('“Talk while I serve, I can do both.”', '« Parlez pendant que je sers, je peux faire les deux. »'), pain: L('“Last month I ran out of sugar for four days. People went next door. I think I lost {lost}, and some never came back.”', '« Le mois dernier, j’ai été en rupture de sucre pendant quatre jours. Les gens sont allés à côté. Je pense avoir perdu {lost}, et certains ne sont jamais revenus. »'), painNote: L('4-day stock-out: about {lost} of sales lost', 'Rupture de 4 jours : environ {lost} de ventes perdues') },
      { job: L('Cosmetics shop · 3 years', 'Boutique de cosmétiques · 3 ans'), detail: L('Small shop near a school · sells on credit to teachers', 'Petite boutique près d’une école · vend à crédit aux enseignants'), greeting: L('“Before the school closes, please, that’s my rush.”', '« Avant la sortie de l’école, s’il vous plaît, c’est mon coup de feu. »'), pain: L('“The wholesaler wants cash up front. So I buy less, and the popular things finish in two days. That’s {lost} a month I don’t sell.”', '« Le grossiste veut être payé d’avance. Alors j’achète moins, et les produits qui marchent partent en deux jours. C’est {lost} par mois que je ne vends pas. »'), painNote: L('Cash up front limits stock: about {lost} a month unsold', 'Paiement d’avance, donc peu de stock : environ {lost} par mois non vendus') },
      { job: L('Hardware store · 12 years', 'Quincaillerie · 12 ans'), detail: L('Builders buy on account · heavy, bulky stock', 'Les artisans achètent en compte · stock lourd et encombrant'), greeting: L('“Mind the cement bags. Now, what do you sell?”', '« Attention aux sacs de ciment. Bon, vous vendez quoi ? »'), pain: L('“A builder needed 40 bags today. I had 12. He went to my competitor and took his whole order: {lost}.”', '« Un artisan avait besoin de 40 sacs aujourd’hui. J’en avais 12. Il est allé chez mon concurrent avec toute sa commande : {lost}. »'), painNote: L('Lost a whole builder’s order to a stock-out: {lost}', 'Perdu toute la commande d’un artisan sur une rupture : {lost}') },
    ],
  },
  'ecommerce.brands': {
    ask: L('Walk me through your last campaign: how did you know whether it sold anything?', 'Racontez-moi votre dernière campagne : comment avez-vous su si elle avait fait vendre ?'),
    benefit: L('shows which shops sell your products', 'montre quelles boutiques vendent vos produits'),
    tried: [
      tried(L('“We pay an agency {spend} a month. They send us likes and impressions. Sales? They shrug.”', '« On paie une agence {spend} par mois. Ils nous envoient des « j’aime » et des impressions. Les ventes ? Ils haussent les épaules. »'), L('{spend} a month to an agency that reports likes, not sales', '{spend} par mois à une agence qui compte les « j’aime », pas les ventes')),
      tried(L('“We tried selling on a marketplace. Our products sat next to fakes of our products. We left after a quarter.”', '« On a essayé de vendre sur une place de marché. Nos produits étaient à côté de contrefaçons de nos produits. On est partis au bout d’un trimestre. »'), L('Left a marketplace after a quarter: listed next to fakes', 'Ont quitté une place de marché au bout d’un trimestre : à côté de contrefaçons')),
    ],
    switchIf: [
      tried(L('“Sell-through data by area, weekly. If I see what sells where, I move the budget myself.”', '« Des données de ventes par quartier, chaque semaine. Si je vois ce qui se vend où, je déplace le budget moi-même. »'), L('Weekly sales data by area', 'Données de ventes hebdomadaires par quartier')),
      tried(L('“Brand safety. If our products never appear next to fakes or junk, the board signs.”', '« La sécurité de la marque. Si nos produits n’apparaissent jamais à côté de contrefaçons ou de camelote, le conseil signe. »'), L('Guaranteed brand safety: never next to fakes', 'Sécurité de marque garantie : jamais à côté de contrefaçons')),
    ],
    deeper: L('Who decides where next quarter’s budget goes, and what do they ask you for?', 'Qui décide où va le budget du prochain trimestre, et que vous demande-t-on ?'),
    deeperWhy: L('Finds the real buyer and the report that wins them, before you ever pitch.', 'Trouve le vrai décideur et le rapport qui le convainc, avant même de présenter.'),
    personas: [
      { job: L('Marketing manager, a soap brand · 5 years', 'Responsable marketing, une marque de savon · 5 ans'), detail: L('A national brand · budget set every quarter', 'Une marque nationale · budget fixé chaque trimestre'), greeting: L('“I have a call at the top of the hour. Let’s use the time well.”', '« J’ai un appel à l’heure pile. Utilisons bien le temps. »'), pain: L('“Last quarter we spent {lost} on a launch. Sales went up somewhere, maybe. I couldn’t tell the board where.”', '« Le trimestre dernier, on a dépensé {lost} pour un lancement. Les ventes ont monté quelque part, peut-être. Je n’ai pas pu dire au conseil où. »'), painNote: L('{lost} launch with no idea where it sold', 'Lancement à {lost} sans savoir où il a vendu') },
      { job: L('Founder, a juice brand · 4 years', 'Fondateur·rice, une marque de jus · 4 ans'), detail: L('In 300 shops · growing fast', 'Dans 300 boutiques · croissance rapide'), greeting: L('“I love founders. I was one five minutes ago. Sit.”', '« J’adore les fondateurs. J’en étais un il y a cinq minutes. Asseyez-vous. »'), pain: L('“A shop chain returned {lost} of juice past its date. We didn’t know it wasn’t selling there until it was too late.”', '« Une chaîne de boutiques nous a rendu {lost} de jus périmés. On ne savait pas que ça ne se vendait pas là-bas avant qu’il soit trop tard. »'), painNote: L('{lost} of expired stock returned: no sell-through data', '{lost} de stock périmé retourné : aucune donnée de vente') },
      { job: L('Trade marketing lead, a beverage group · 8 years', 'Responsable trade marketing, un groupe de boissons · 8 ans'), detail: L('Works with distributors · signs off on every channel', 'Travaille avec les distributeurs · valide chaque canal'), greeting: L('“Our legal team will read whatever you send. Keep it clean.”', '« Notre service juridique lira tout ce que vous enverrez. Restez carré. »'), pain: L('“Our ad ran next to a fake version of our drink. Legal took a month and {lost} to clean it up.”', '« Notre pub est passée à côté d’une fausse version de notre boisson. Le juridique a mis un mois et {lost} pour réparer ça. »'), painNote: L('Ad next to a fake: a month and {lost} to fix', 'Pub à côté d’une contrefaçon : un mois et {lost} pour réparer') },
    ],
  },
  // ---- Logistics
  'logistics.sellers': {
    ask: L('Tell me about your last late delivery: what happened, step by step?', 'Racontez-moi votre dernière livraison en retard : que s’est-il passé, étape par étape ?'),
    benefit: L('delivers on time with live tracking', 'livre à l’heure avec un suivi en direct'),
    tried: [
      tried(L('“I use two riders I know. {spend} a month together. When one is sick, the orders wait.”', '« J’utilise deux livreurs que je connais. {spend} par mois à eux deux. Quand l’un est malade, les commandes attendent. »'), L('Two known riders, {spend} a month; orders wait when one is sick', 'Deux livreurs de confiance, {spend} par mois ; les commandes attendent quand l’un est malade')),
      tried(L('“I tried a courier company. Cheap, but no tracking. Customers called me ten times a day: ‘where is it?’”', '« J’ai essayé une société de coursiers. Pas cher, mais pas de suivi. Les clients m’appelaient dix fois par jour : « c’est où ? » »'), L('Tried a cheap courier: no tracking, ten calls a day', 'A essayé un coursier pas cher : pas de suivi, dix appels par jour')),
    ],
    switchIf: [
      tried(L('“A link I can send the customer, so they stop calling me. That alone, I’d pay for.”', '« Un lien à envoyer au client, pour qu’il arrête de m’appeler. Rien que ça, je paierais. »'), L('A tracking link for customers, so they stop calling', 'Un lien de suivi pour les clients, pour qu’ils arrêtent d’appeler')),
      tried(L('“On time, at the price I pay my riders now. If it’s late twice, I go back.”', '« À l’heure, au prix que je paie mes livreurs aujourd’hui. Deux retards, et je reviens en arrière. »'), L('On time at today’s price; two late deliveries and they leave', 'À l’heure au prix actuel ; deux retards et ils partent')),
    ],
    deeper: L('What did the customer do after that late delivery?', 'Qu’a fait le client après cette livraison en retard ?'),
    deeperWhy: L('Shows what lateness really costs: a refund, a bad review, a customer who never orders again.', 'Montre ce que coûte vraiment un retard : un remboursement, un mauvais avis, un client qui ne recommande plus.'),
    personas: [
      { job: L('Online fashion seller · 4 years', 'Vente de mode en ligne · 4 ans'), detail: L('Ships 25 parcels a day across the city', 'Expédie 25 colis par jour dans toute la ville'), greeting: L('“The parcels are packed, the rider isn’t here. Perfect timing.”', '« Les colis sont prêts, le livreur n’est pas là. Vous tombez bien. »'), pain: L('“A dress for a wedding. The rider went to the wrong side of town. Arrived after the wedding. Refund, and {lost} of orders from her friends, gone.”', '« Une robe pour un mariage. Le livreur est allé à l’autre bout de la ville. Arrivée après le mariage. Remboursement, et {lost} de commandes de ses amies, envolées. »'), painNote: L('One late parcel: a refund and {lost} of follow-on orders lost', 'Un colis en retard : un remboursement et {lost} de commandes perdues') },
      { job: L('Home bakery · 2 years', 'Pâtisserie à domicile · 2 ans'), detail: L('Cakes to order · same-day only', 'Gâteaux sur commande · uniquement le jour même'), greeting: L('“Taste this while we talk. Honest opinion after.”', '« Goûtez ça pendant qu’on parle. Avis sincère après. »'), pain: L('“A birthday cake, two hours late, melted. I paid back the customer and lost {lost} that week.”', '« Un gâteau d’anniversaire, deux heures de retard, fondu. J’ai remboursé le client et perdu {lost} cette semaine-là. »'), painNote: L('Late, melted cake: {lost} lost that week', 'Gâteau en retard et fondu : {lost} perdus cette semaine-là') },
      { job: L('Electronics reseller · 6 years', 'Revendeur d’électronique · 6 ans'), detail: L('High-value parcels · cash on delivery', 'Colis de valeur · paiement à la livraison'), greeting: L('“Lock the door behind you, please. Stock is expensive.”', '« Fermez la porte derrière vous, s’il vous plaît. Le stock coûte cher. »'), pain: L('“A rider said the phone was stolen on the way. {lost}. Maybe true, maybe not. I couldn’t prove anything.”', '« Un livreur a dit que le téléphone avait été volé en route. {lost}. Peut-être vrai, peut-être pas. Je n’ai rien pu prouver. »'), painNote: L('A {lost} parcel “stolen” with no proof', 'Un colis de {lost} « volé » sans preuve') },
    ],
  },
  'logistics.retailers': {
    ask: L('Walk me through how your stock got here last week.', 'Racontez-moi comment votre stock est arrivé ici la semaine dernière.'),
    benefit: L('picks up your stock at a fixed price', 'récupère votre stock à prix fixe'),
    tried: [
      tried(L('“A bus to the market, then a cart. {spend} a month, and it’s different every time.”', '« Un bus jusqu’au marché, puis une charrette. {spend} par mois, et c’est différent à chaque fois. »'), L('Bus and cart: {spend} a month, never the same price', 'Bus et charrette : {spend} par mois, jamais le même prix')),
      tried(L('“My cousin has a van. Cheap, but he comes when he wants. Once I waited a whole day.”', '« Mon cousin a une camionnette. Pas cher, mais il vient quand il veut. Une fois, j’ai attendu toute une journée. »'), L('A cousin’s van: cheap, comes when he likes', 'La camionnette d’un cousin : pas chère, vient quand elle veut')),
    ],
    switchIf: [
      tried(L('“One price, every week, written down. Then I can plan.”', '« Un prix, chaque semaine, écrit noir sur blanc. Alors je peux prévoir. »'), L('One fixed weekly price, written down', 'Un prix fixe chaque semaine, par écrit')),
      tried(L('“If it costs less than the bus and the cart together. Not one coin more.”', '« Si ça coûte moins que le bus et la charrette ensemble. Pas une pièce de plus. »'), L('Cheaper than bus plus cart, not a coin more', 'Moins cher que bus et charrette, pas une pièce de plus')),
    ],
    deeper: L('How much did last month’s pickups cost you, all in?', 'Combien vous ont coûté les ramassages du mois dernier, en tout ?'),
    deeperWhy: L('A number they add up themselves is your price ceiling, in their words.', 'Un chiffre qu’ils calculent eux-mêmes est votre plafond de prix, dans leurs mots.'),
    personas: [
      { job: L('Provisions kiosk · 5 years', 'Kiosque de provisions · 5 ans'), detail: L('Restocks twice a week · sells by the piece', 'Réassortit deux fois par semaine · vend à la pièce'), greeting: L('“Sit on the crate, it’s strong.”', '« Asseyez-vous sur la caisse, elle est solide. »'), pain: L('“Last Tuesday the cart man doubled his price because it rained. I paid. That’s {lost} a month gone on carrying.”', '« Mardi dernier, le pousseur a doublé son prix parce qu’il pleuvait. J’ai payé. Ça fait {lost} par mois partis dans le transport. »'), painNote: L('Pickup prices jump with the weather: {lost} a month', 'Le prix du transport saute avec la météo : {lost} par mois') },
      { job: L('Shoe stall · 7 years', 'Étal de chaussures · 7 ans'), detail: L('Buys bales at the port market', 'Achète des balles au marché du port'), greeting: L('“Ah, a customer? No? OK, still sit.”', '« Ah, un client ? Non ? Bon, asseyez-vous quand même. »'), pain: L('“The bale sat at the market two days because no transport came. Those were my best selling days: {lost}.”', '« La balle est restée deux jours au marché parce qu’aucun transport n’est venu. C’étaient mes meilleurs jours de vente : {lost}. »'), painNote: L('Stock stuck 2 days for lack of transport: {lost} of sales', 'Stock bloqué 2 jours faute de transport : {lost} de ventes') },
      { job: L('Mini-mart · 3 years', 'Supérette · 3 ans'), detail: L('Drinks and snacks · heavy crates', 'Boissons et en-cas · caisses lourdes'), greeting: L('“Cold drink? On the house, for research.”', '« Une boisson fraîche ? Offerte, pour la recherche. »'), pain: L('“Crates are heavy. I pay three different people to move them and I never know the total until month end: {lost} last month.”', '« Les caisses sont lourdes. Je paie trois personnes différentes pour les déplacer et je ne connais le total qu’en fin de mois : {lost} le mois dernier. »'), painNote: L('Three different carriers, {lost} last month, never known ahead', 'Trois transporteurs différents, {lost} le mois dernier, jamais connu d’avance') },
    ],
  },
  'logistics.shippers': {
    ask: L('Walk me through the last shipment that missed its window.', 'Racontez-moi la dernière expédition qui a manqué son créneau.'),
    benefit: L('guarantees delivery windows across the region', 'garantit les créneaux de livraison dans toute la région'),
    tried: [
      tried(L('“Three trucking firms, {spend} a month together, and a coordinator who lives on the phone. Penalties in the contracts? Never paid once.”', '« Trois transporteurs, {spend} par mois à eux trois, et un coordinateur qui vit au téléphone. Des pénalités dans les contrats ? Jamais payées. »'), L('Three truckers, {spend} a month, penalties never enforced', 'Trois transporteurs, {spend} par mois, pénalités jamais appliquées')),
      tried(L('“We bought our own trucks once. Maintenance ate us. Sold them in two years.”', '« On a acheté nos propres camions une fois. L’entretien nous a ruinés. Revendus en deux ans. »'), L('Owned trucks once; maintenance costs forced a sale', 'Ont eu leurs propres camions ; l’entretien a forcé la vente')),
    ],
    switchIf: [
      tried(L('“A contract with real penalties, and coverage up-country. If you can do the far depots, we talk.”', '« Un contrat avec de vraies pénalités, et une couverture jusqu’à l’intérieur. Si vous faites les dépôts éloignés, on discute. »'), L('Real penalties and up-country coverage', 'De vraies pénalités et la couverture de l’intérieur')),
      tried(L('“Six months without a missed window. Prove it on one route first.”', '« Six mois sans créneau manqué. Prouvez-le d’abord sur un itinéraire. »'), L('Prove it on one route: six months without a miss', 'Le prouver sur un itinéraire : six mois sans raté')),
    ],
    deeper: L('What did that missed window cost you with your own customer?', 'Que vous a coûté ce créneau manqué auprès de votre propre client ?'),
    deeperWhy: L('Their customer’s penalty is the real price of unreliability, and the budget you’ll be paid from.', 'La pénalité de leur client est le vrai prix du manque de fiabilité, et le budget qui vous paiera.'),
    personas: [
      { job: L('Logistics manager, a cement maker · 10 years', 'Responsable logistique, un cimentier · 10 ans'), detail: L('200 truckloads a month · depots up-country', '200 camions par mois · dépôts à l’intérieur du pays'), greeting: L('“Visitor badge on, please. Safety first, then talk.”', '« Badge visiteur, s’il vous plaît. La sécurité d’abord, ensuite on parle. »'), pain: L('“Last month two trucks waited a day at a checkpoint. The building site stopped and billed us {lost}.”', '« Le mois dernier, deux camions ont attendu une journée à un barrage. Le chantier s’est arrêté et nous a facturé {lost}. »'), painNote: L('Trucks held a day: {lost} billed by the customer', 'Camions bloqués une journée : {lost} facturés par le client') },
      { job: L('Supply-chain head, a drinks bottler · 12 years', 'Directeur·rice supply chain, un embouteilleur · 12 ans'), detail: L('Ships to 40 distributors weekly', 'Livre 40 distributeurs chaque semaine'), greeting: L('“I read your email. Twice. Convince me in person.”', '« J’ai lu votre e-mail. Deux fois. Convainquez-moi en personne. »'), pain: L('“Festive season: three late loads, empty shelves, {lost} of sales our distributors blame us for.”', '« Période des fêtes : trois chargements en retard, rayons vides, {lost} de ventes que nos distributeurs nous reprochent. »'), painNote: L('Peak-season delays: {lost} of sales lost', 'Retards en haute saison : {lost} de ventes perdues') },
      { job: L('Operations director, an electronics importer · 6 years', 'Directeur·rice des opérations, un importateur d’électronique · 6 ans'), detail: L('Port to warehouse to 60 stores', 'Du port à l’entrepôt jusqu’à 60 magasins'), greeting: L('“My phone will ring. It’s always a truck. Ignore it.”', '« Mon téléphone va sonner. C’est toujours un camion. Ignorez-le. »'), pain: L('“A container cleared on Friday, the truck came on Wednesday. Storage fees and a missed promotion: {lost}.”', '« Un conteneur dédouané le vendredi, le camion est venu le mercredi. Frais de stockage et une promotion ratée : {lost}. »'), painNote: L('Truck 5 days late from port: {lost} in fees and sales', 'Camion avec 5 jours de retard au port : {lost} de frais et de ventes') },
    ],
  },
  // ---- Health
  'healthtech.families': {
    ask: L('Tell me about the last time someone at home was ill: what did you do first?', 'Racontez-moi la dernière fois que quelqu’un était malade à la maison : qu’avez-vous fait en premier ?'),
    benefit: L('puts you through to a doctor by phone', 'vous met en relation avec un médecin par téléphone'),
    tried: [
      tried(L('“We go to the clinic. Transport, the queue, the card: {spend} before anyone sees a doctor.”', '« On va au dispensaire. Le transport, la file, le carnet : {spend} avant de voir un médecin. »'), L('{spend} in transport and fees before seeing a doctor', '{spend} de transport et de frais avant de voir un médecin')),
      tried(L('“I tried a health app once. The ‘doctor’ answered after six hours. My son was already better, or worse, I don’t remember.”', '« J’ai essayé une appli de santé une fois. Le « médecin » a répondu au bout de six heures. Mon fils allait déjà mieux, ou plus mal, je ne sais plus. »'), L('Tried a health app: the doctor replied after 6 hours', 'A essayé une appli : le médecin a répondu au bout de 6 heures')),
    ],
    switchIf: [
      tried(L('“A real doctor, with a name and a licence I can check, in ten minutes. Then I trust it.”', '« Un vrai médecin, avec un nom et une licence que je peux vérifier, en dix minutes. Là, je fais confiance. »'), L('A named, licensed doctor within 10 minutes', 'Un médecin nommé et diplômé en 10 minutes')),
      tried(L('“If it costs less than one clinic trip a month, for the whole family.”', '« Si ça coûte moins qu’un passage au dispensaire par mois, pour toute la famille. »'), L('Less than one clinic trip a month, whole family', 'Moins qu’un passage au dispensaire par mois, toute la famille')),
    ],
    deeper: L('Who decided where to go, and why there?', 'Qui a décidé où aller, et pourquoi là ?'),
    deeperWhy: L('Finds who chooses healthcare at home and what they trust: that’s who you sell to.', 'Trouve qui choisit les soins à la maison et à qui il fait confiance : c’est à lui que vous vendez.'),
    personas: [
      { job: L('Mother of three · runs a hair salon', 'Mère de trois enfants · tient un salon de coiffure'), detail: L('Closes the salon when a child is ill', 'Ferme le salon quand un enfant est malade'), greeting: L('“My daughter’s at school, so I’m all yours till two.”', '« Ma fille est à l’école, alors je suis à vous jusqu’à deux heures. »'), pain: L('“My youngest had a fever at night. We waited till morning, then three hours at the clinic. The salon was closed: {lost} that day.”', '« Le petit avait de la fièvre la nuit. On a attendu le matin, puis trois heures au dispensaire. Le salon était fermé : {lost} ce jour-là. »'), painNote: L('A night fever: a day closed, {lost} lost', 'Une fièvre la nuit : une journée fermée, {lost} perdus') },
      { job: L('Taxi driver · cares for his parents', 'Chauffeur de taxi · s’occupe de ses parents'), detail: L('Parents live across town', 'Les parents vivent à l’autre bout de la ville'), greeting: L('“I’m parked outside, meter off. Go.”', '« Je suis garé devant, compteur éteint. Allez-y. »'), pain: L('“My father’s blood pressure. Every check-up is half a day off the road. That’s {lost} a month, just to be told ‘same tablets’.”', '« La tension de mon père. Chaque contrôle, c’est une demi-journée sans rouler. Ça fait {lost} par mois, juste pour entendre « mêmes comprimés ». »'), painNote: L('Routine check-ups cost {lost} a month in lost fares', 'Les contrôles de routine coûtent {lost} par mois en courses perdues') },
      { job: L('Teacher · young family', 'Enseignant·e · jeune famille'), detail: L('Two small children, one insurance card', 'Deux jeunes enfants, une carte d’assurance'), greeting: L('“I have marking to do, so let’s be efficient, yes?”', '« J’ai des copies à corriger, alors soyons efficaces, d’accord ? »'), pain: L('“We went to three pharmacies for one prescription, then paid {lost} at a private clinic because the public one was full.”', '« On a fait trois pharmacies pour une ordonnance, puis payé {lost} dans une clinique privée parce que le public était plein. »'), painNote: L('Three pharmacies, then {lost} at a private clinic', 'Trois pharmacies, puis {lost} dans une clinique privée') },
    ],
  },
  'healthtech.clinics': {
    ask: L('Walk me through what happened to a patient’s file yesterday, from the door to the bill.', 'Racontez-moi le parcours du dossier d’un patient hier, de l’entrée à la facture.'),
    benefit: L('keeps patient records and billing in one place', 'regroupe dossiers patients et facturation au même endroit'),
    tried: [
      tried(L('“Paper folders and a billing clerk. {spend} a month for her alone, and insurers still reject one claim in five.”', '« Des dossiers papier et une employée à la facturation. {spend} par mois pour elle seule, et les assureurs rejettent encore une demande sur cinq. »'), L('Paper files and a billing clerk at {spend} a month; 1 claim in 5 rejected', 'Dossiers papier et une employée à {spend} par mois ; 1 demande sur 5 rejetée')),
      tried(L('“We bought a foreign records system. The doctors refused it: too many clicks. It still runs, nobody uses it.”', '« On a acheté un logiciel étranger de dossiers. Les médecins l’ont refusé : trop de clics. Il tourne encore, personne ne s’en sert. »'), L('Bought a records system doctors refused: too many clicks', 'Ont acheté un logiciel refusé par les médecins : trop de clics')),
    ],
    switchIf: [
      tried(L('“If insurers accept the claims the first time. Every rejection is weeks of cash.”', '« Si les assureurs acceptent les demandes du premier coup. Chaque rejet, c’est des semaines de trésorerie. »'), L('Claims accepted first time: weeks of cash back', 'Demandes acceptées du premier coup : des semaines de trésorerie')),
      tried(L('“Patient data stays here, protected, and the doctors can use it with one hand.”', '« Les données des patients restent ici, protégées, et les médecins peuvent s’en servir d’une main. »'), L('Data stays protected locally; usable one-handed', 'Données protégées sur place ; utilisable d’une main')),
    ],
    deeper: L('What happened the last time an insurer rejected a claim?', 'Que s’est-il passé la dernière fois qu’un assureur a rejeté une demande ?'),
    deeperWhy: L('Rejections are cash they can count: the clearest value you can promise.', 'Les rejets, c’est de l’argent qu’ils peuvent compter : la valeur la plus claire à promettre.'),
    personas: [
      { job: L('Medical director, a 20-bed clinic · 9 years', 'Directeur·rice médical·e, une clinique de 20 lits · 9 ans'), detail: L('Five doctors · most patients insured', 'Cinq médecins · la plupart des patients assurés'), greeting: L('“I have a ward round in twenty minutes. Go.”', '« J’ai une visite dans vingt minutes. Allez-y. »'), pain: L('“A patient came back, nobody found his file, we repeated the tests. The insurer refused to pay twice: {lost}.”', '« Un patient est revenu, personne n’a trouvé son dossier, on a refait les examens. L’assureur a refusé de payer deux fois : {lost}. »'), painNote: L('Lost file, repeated tests, {lost} unpaid', 'Dossier perdu, examens refaits, {lost} impayés') },
      { job: L('Practice manager, a dental clinic · 4 years', 'Gérant·e d’un cabinet dentaire · 4 ans'), detail: L('Two dentists · appointments by phone', 'Deux dentistes · rendez-vous par téléphone'), greeting: L('“Excuse the drill noise. Coffee?”', '« Excusez le bruit de la fraise. Un café ? »'), pain: L('“Last month eleven patients didn’t show up. No reminders. That’s {lost} of empty chairs.”', '« Le mois dernier, onze patients ne sont pas venus. Aucun rappel. Ça fait {lost} de fauteuils vides. »'), painNote: L('11 no-shows last month: {lost} of empty chairs', '11 absences le mois dernier : {lost} de fauteuils vides') },
      { job: L('Owner, a diagnostic lab · 6 years', 'Propriétaire d’un laboratoire d’analyses · 6 ans'), detail: L('Results sent by phone and paper', 'Résultats envoyés par téléphone et sur papier'), greeting: L('“Gloves off, so this is a real break. Talk.”', '« Gants retirés, c’est une vraie pause. Parlez. »'), pain: L('“We sent a result to the wrong patient. Nothing terrible, but the complaint and the fix cost us {lost} and a lot of sleep.”', '« On a envoyé un résultat au mauvais patient. Rien de grave, mais la plainte et la correction nous ont coûté {lost} et beaucoup de sommeil. »'), painNote: L('A result sent to the wrong patient: {lost} and a complaint', 'Un résultat envoyé au mauvais patient : {lost} et une plainte') },
    ],
  },
  'healthtech.employers': {
    ask: L('Tell me about the last month staff sickness hurt the business.', 'Parlez-moi du dernier mois où les arrêts maladie ont pénalisé l’entreprise.'),
    benefit: L('gives your staff a doctor on the phone', 'donne à votre personnel un médecin au téléphone'),
    tried: [
      tried(L('“We pay a health insurance plan, {spend} a month. Staff still take a day off for every clinic visit.”', '« On paie une mutuelle, {spend} par mois. Le personnel prend quand même une journée pour chaque visite. »'), L('Insurance at {spend} a month; still a day off per clinic visit', 'Mutuelle à {spend} par mois ; toujours un jour d’absence par visite')),
      tried(L('“A nurse came twice a week. Staff liked her; finance cut her in the budget review.”', '« Une infirmière venait deux fois par semaine. Le personnel l’aimait ; la finance l’a supprimée lors de la revue du budget. »'), L('An on-site nurse, cut at the budget review', 'Une infirmière sur place, supprimée à la revue du budget')),
    ],
    switchIf: [
      tried(L('“A cost per employee finance can see, and a brand the staff already trust.”', '« Un coût par employé que la finance peut voir, et une marque à laquelle le personnel fait déjà confiance. »'), L('A clear cost per employee and a trusted brand', 'Un coût par employé clair et une marque de confiance')),
      tried(L('“Show me fewer sick days in three months, on one site. Then we roll it out.”', '« Montrez-moi moins d’arrêts en trois mois, sur un site. Ensuite on déploie. »'), L('Fewer sick days on one site within 3 months', 'Moins d’arrêts sur un site en 3 mois')),
    ],
    deeper: L('Who signs off on staff benefits, and what convinced them last time?', 'Qui valide les avantages du personnel, et qu’est-ce qui l’a convaincu la dernière fois ?'),
    deeperWhy: L('Finds the decision-maker and their test before you build the pitch.', 'Trouve le décideur et son critère avant de bâtir l’argumentaire.'),
    personas: [
      { job: L('HR manager, a factory · 7 years', 'Responsable RH, une usine · 7 ans'), detail: L('400 staff on two shifts', '400 employés en deux équipes'), greeting: L('“Visitor’s chair is the good one. Sit.”', '« La chaise visiteur, c’est la bonne. Asseyez-vous. »'), pain: L('“Malaria season: 30 people off in one week. We paid overtime to cover: {lost}.”', '« Saison du paludisme : 30 personnes absentes en une semaine. On a payé des heures sup pour couvrir : {lost}. »'), painNote: L('30 off sick in a week: {lost} in overtime', '30 absents en une semaine : {lost} d’heures sup') },
      { job: L('Office manager, a bank branch network · 5 years', 'Responsable administratif·ve, un réseau d’agences · 5 ans'), detail: L('120 staff in 8 branches', '120 employés dans 8 agences'), greeting: L('“Our benefits are up for renewal, so your timing is lucky.”', '« Nos avantages sont à renouveler, vous tombez bien. »'), pain: L('“A branch closed for a day because three tellers were at the clinic. The fine and lost business: {lost}.”', '« Une agence a fermé une journée parce que trois guichetiers étaient au dispensaire. L’amende et l’activité perdue : {lost}. »'), painNote: L('A branch closed a day: {lost} in fines and business', 'Une agence fermée une journée : {lost} d’amende et d’activité') },
      { job: L('Founder, a 60-person agency · 3 years', 'Fondateur·rice d’une agence de 60 personnes · 3 ans'), detail: L('Young team · competes for talent', 'Équipe jeune · en concurrence pour les talents'), greeting: L('“We lose people to companies with better perks. That’s why you’re here.”', '« On perd des gens au profit de boîtes avec de meilleurs avantages. C’est pour ça que vous êtes là. »'), pain: L('“Two designers left last quarter for a company with health cover. Replacing them cost {lost}.”', '« Deux designers sont partis le trimestre dernier pour une boîte avec une couverture santé. Les remplacer a coûté {lost}. »'), painNote: L('Lost two staff to better health cover: {lost} to replace', 'Deux départs pour une meilleure couverture : {lost} pour remplacer') },
    ],
  },
  // ---- Education
  'edtech.parents': {
    ask: L('Tell me how your child prepared for their last exam.', 'Racontez-moi comment votre enfant a préparé son dernier examen.'),
    benefit: L('helps your child practise for exams on a cheap phone', 'aide votre enfant à réviser ses examens sur un petit téléphone'),
    tried: [
      tried(L('“A lesson teacher comes three evenings a week: {spend} a month. When he travels, nothing.”', '« Un répétiteur vient trois soirs par semaine : {spend} par mois. Quand il voyage, rien. »'), L('A home tutor at {spend} a month; nothing when he travels', 'Un répétiteur à {spend} par mois ; rien quand il voyage')),
      tried(L('“We downloaded a learning app. It ate all the data in two days and the videos wouldn’t load.”', '« On a téléchargé une appli d’apprentissage. Elle a mangé tout le forfait en deux jours et les vidéos ne chargeaient pas. »'), L('A learning app used all the data in 2 days', 'Une appli a consommé tout le forfait en 2 jours')),
    ],
    switchIf: [
      tried(L('“If her marks go up. I don’t care how it works, show me the marks.”', '« Si ses notes montent. Peu importe comment ça marche, montrez-moi les notes. »'), L('Marks that go up: results, not features', 'Des notes qui montent : des résultats, pas des fonctions')),
      tried(L('“Works on my old phone, without data, for less than the lesson teacher.”', '« Ça marche sur mon vieux téléphone, sans données, pour moins cher que le répétiteur. »'), L('Works offline on an old phone, cheaper than the tutor', 'Marche hors connexion sur un vieux téléphone, moins cher que le répétiteur')),
    ],
    deeper: L('What happened when the last results came out?', 'Que s’est-il passé quand les derniers résultats sont tombés ?'),
    deeperWhy: L('The results day story shows what the family really fears and pays to avoid.', 'L’histoire du jour des résultats montre ce que la famille craint vraiment et paie pour éviter.'),
    personas: [
      { job: L('Parent · market trader', 'Parent · commerçant·e au marché'), detail: L('Daughter in her exam year · one shared phone', 'Fille en année d’examen · un téléphone partagé'), greeting: L('“My daughter is the clever one. I just pay.”', '« C’est ma fille la plus intelligente. Moi, je paie. »'), pain: L('“She failed maths by four marks. One more year of fees: {lost}. I cried more than she did.”', '« Elle a raté les maths à quatre points près. Une année de frais en plus : {lost}. J’ai pleuré plus qu’elle. »'), painNote: L('Failed maths by 4 marks: a repeat year costs {lost}', 'Maths ratées à 4 points : une année de plus coûte {lost}') },
      { job: L('Student · final school year', 'Élève · dernière année de lycée'), detail: L('Studies at night by a phone torch', 'Révise la nuit à la lampe du téléphone'), greeting: L('“Is this a survey? Do I get airtime?”', '« C’est un sondage ? J’ai du crédit en échange ? »'), pain: L('“I buy past papers from a man at the bus stop. {lost} a month, and half of them have no answers.”', '« J’achète les annales à un monsieur à l’arrêt de bus. {lost} par mois, et la moitié n’ont pas de corrigé. »'), painNote: L('{lost} a month on past papers, half without answers', '{lost} par mois d’annales, la moitié sans corrigé') },
      { job: L('Parent · civil servant', 'Parent · fonctionnaire'), detail: L('Two children in secondary school', 'Deux enfants au collège'), greeting: L('“I read every report card twice. Ask me anything.”', '« Je lis chaque bulletin deux fois. Demandez-moi ce que vous voulez. »'), pain: L('“Holiday lessons, {lost} for six weeks. Then the teacher stopped coming in week three.”', '« Des cours de vacances, {lost} pour six semaines. Puis le professeur a arrêté de venir la troisième semaine. »'), painNote: L('{lost} of holiday lessons; the teacher quit in week 3', '{lost} de cours de vacances ; le prof a arrêté en semaine 3') },
    ],
  },
  'edtech.schools': {
    ask: L('Walk me through how fees were collected last term.', 'Racontez-moi comment les frais de scolarité ont été encaissés le trimestre dernier.'),
    benefit: L('collects fees and sends reminders to parents', 'encaisse les frais et relance les parents'),
    tried: [
      tried(L('“A bursar and a big ledger. {spend} a month for her, and still a third of parents pay late.”', '« Une économe et un grand registre. {spend} par mois pour elle, et un tiers des parents paient encore en retard. »'), L('A bursar at {spend} a month; a third of parents still late', 'Une économe à {spend} par mois ; un tiers des parents toujours en retard')),
      tried(L('“The bank gave us a collection account. Parents pay, but the statement doesn’t say which child. Matching takes a week.”', '« La banque nous a donné un compte d’encaissement. Les parents paient, mais le relevé ne dit pas pour quel enfant. Le rapprochement prend une semaine. »'), L('Bank collection account: payments don’t say which child', 'Compte d’encaissement : les paiements ne disent pas quel enfant')),
    ],
    switchIf: [
      tried(L('“Every payment tied to a child, and polite reminders that aren’t from me. Then my teachers teach.”', '« Chaque paiement lié à un enfant, et des relances polies qui ne viennent pas de moi. Alors mes enseignants enseignent. »'), L('Payments tied to each child; reminders not from the head', 'Paiements liés à chaque enfant ; relances qui ne viennent pas du directeur')),
      tried(L('“If it saves my teachers the register and the report cards. Their time is what I’m short of.”', '« Si ça épargne à mes enseignants l’appel et les bulletins. C’est de leur temps que je manque. »'), L('Saves teachers’ time on registers and reports', 'Fait gagner du temps aux enseignants sur l’appel et les bulletins')),
    ],
    deeper: L('What happened with the family that paid latest last term?', 'Que s’est-il passé avec la famille qui a payé le plus tard le trimestre dernier ?'),
    deeperWhy: L('Shows how they chase today (and how awkward it is): your reminder feature in their words.', 'Montre comment ils relancent aujourd’hui (et la gêne que ça crée) : votre fonction de relance dans leurs mots.'),
    personas: [
      { job: L('Head teacher, a primary school · 12 years', 'Directeur·rice d’une école primaire · 12 ans'), detail: L('350 pupils · 14 teachers', '350 élèves · 14 enseignants'), greeting: L('“The bell rings in fifteen minutes. That’s your slot.”', '« La sonnerie est dans quinze minutes. C’est votre créneau. »'), pain: L('“End of term, {lost} still unpaid. I had to delay teachers’ salaries. Two of them left.”', '« Fin de trimestre, {lost} encore impayés. J’ai dû retarder les salaires des enseignants. Deux sont partis. »'), painNote: L('{lost} unpaid at term end; teachers’ pay delayed', '{lost} impayés en fin de trimestre ; salaires retardés') },
      { job: L('Proprietor, a secondary school · 8 years', 'Promoteur·rice d’un collège-lycée · 8 ans'), detail: L('Boarding and day students', 'Internes et externes'), greeting: L('“Welcome. Parents call me all day about money, so I hope you’re different.”', '« Bienvenue. Les parents m’appellent toute la journée pour l’argent, j’espère que vous êtes différent. »'), pain: L('“Two weeks matching bank slips to pupils. We still sent a reminder to a family that had paid. They moved their three children: {lost} a year.”', '« Deux semaines à rapprocher les bordereaux des élèves. On a quand même relancé une famille qui avait payé. Elle a retiré ses trois enfants : {lost} par an. »'), painNote: L('Wrong reminder lost a family: {lost} a year', 'Une relance erronée a fait partir une famille : {lost} par an') },
      { job: L('Bursar, a nursery and primary · 5 years', 'Économe, une maternelle et primaire · 5 ans'), detail: L('Handles fees, uniforms and the bus', 'Gère frais, uniformes et le bus'), greeting: L('“I’m the one who knows where every coin is. Mostly.”', '« C’est moi qui sais où est chaque pièce. En général. »'), pain: L('“I write receipts by hand. A parent said she paid, I had no copy. We lost {lost} because I couldn’t prove anything.”', '« J’écris les reçus à la main. Une mère a dit qu’elle avait payé, je n’avais pas de double. On a perdu {lost} faute de preuve. »'), painNote: L('Hand receipts, no copies: {lost} written off', 'Reçus manuscrits sans double : {lost} passés en perte') },
    ],
  },
  'edtech.corporate': {
    ask: L('Tell me about the last training programme you ran: how did you know it worked?', 'Parlez-moi du dernier programme de formation que vous avez mené : comment avez-vous su qu’il avait marché ?'),
    benefit: L('trains your staff and reports who finished', 'forme votre personnel et indique qui a terminé'),
    tried: [
      tried(L('“We fly in a trainer twice a year: {spend} a month averaged out. Attendance sheets are all we get.”', '« On fait venir un formateur deux fois par an : {spend} par mois en moyenne. On n’obtient que des feuilles de présence. »'), L('Visiting trainer, {spend} a month averaged; only attendance sheets', 'Formateur invité, {spend} par mois en moyenne ; seulement des feuilles de présence')),
      tried(L('“A big online course library. Staff started, nobody finished, and the regulator didn’t recognise the certificates.”', '« Une grosse bibliothèque de cours en ligne. Le personnel a commencé, personne n’a fini, et le régulateur n’a pas reconnu les certificats. »'), L('Online library: nobody finished, certificates not recognised', 'Bibliothèque en ligne : personne n’a fini, certificats non reconnus')),
    ],
    switchIf: [
      tried(L('“Certificates the regulator accepts, and a report I can hand the auditors.”', '« Des certificats que le régulateur accepte, et un rapport que je peux remettre aux auditeurs. »'), L('Regulator-accepted certificates and an audit report', 'Certificats acceptés par le régulateur et un rapport d’audit')),
      tried(L('“If people actually finish. Short, on the phone, in the downtime.”', '« Si les gens finissent vraiment. Court, sur le téléphone, pendant les temps morts. »'), L('Short courses on the phone that people actually finish', 'Des cours courts sur téléphone que les gens terminent vraiment')),
    ],
    deeper: L('What did the auditors ask for last time?', 'Qu’ont demandé les auditeurs la dernière fois ?'),
    deeperWhy: L('The audit request is the requirement they can’t say no to.', 'La demande d’audit est l’exigence à laquelle ils ne peuvent pas dire non.'),
    personas: [
      { job: L('Learning manager, an insurer · 6 years', 'Responsable formation, un assureur · 6 ans'), detail: L('900 staff · yearly compliance training', '900 employés · formation réglementaire annuelle'), greeting: L('“I’ve seen many demos. I want to see numbers.”', '« J’ai vu beaucoup de démos. Je veux voir des chiffres. »'), pain: L('“The regulator fined us {lost} because 40 agents hadn’t done the yearly course. We had the sheets, not the proof.”', '« Le régulateur nous a infligé {lost} d’amende parce que 40 agents n’avaient pas suivi le cours annuel. On avait les feuilles, pas la preuve. »'), painNote: L('Regulator fine: {lost} for 40 untrained agents', 'Amende du régulateur : {lost} pour 40 agents non formés') },
      { job: L('HR director, a telecoms reseller · 9 years', 'DRH, un revendeur télécom · 9 ans'), detail: L('Sales staff in 12 towns', 'Commerciaux dans 12 villes'), greeting: L('“My team is spread across the country. That’s my whole problem.”', '« Mon équipe est dispersée dans tout le pays. C’est tout mon problème. »'), pain: L('“Bringing everyone to the capital for training: {lost} in travel and hotels, and the shops closed for three days.”', '« Faire venir tout le monde dans la capitale pour la formation : {lost} de transport et d’hôtels, et les boutiques fermées trois jours. »'), painNote: L('Central training: {lost} in travel, shops shut 3 days', 'Formation centralisée : {lost} de déplacements, boutiques fermées 3 jours') },
      { job: L('Operations head, a hotel group · 4 years', 'Directeur·rice des opérations, un groupe hôtelier · 4 ans'), detail: L('Five hotels · high staff turnover', 'Cinq hôtels · fort turnover'), greeting: L('“Half my staff are new every year. Teach them for me.”', '« La moitié de mon personnel est nouveau chaque année. Formez-les pour moi. »'), pain: L('“A new receptionist overbooked a wedding. Refunds and a bad review: {lost}. She’d never been trained on the system.”', '« Une nouvelle réceptionniste a surréservé un mariage. Remboursements et mauvais avis : {lost}. Elle n’avait jamais été formée au système. »'), painNote: L('Untrained new hire: a {lost} overbooking', 'Recrue non formée : une surréservation à {lost}') },
    ],
  },
  // ---- Business software
  'saas.solo': {
    ask: L('Walk me through how you sent your last invoice.', 'Racontez-moi comment vous avez envoyé votre dernière facture.'),
    benefit: L('sends your invoices and reminders from your phone', 'envoie vos factures et relances depuis votre téléphone'),
    tried: [
      tried(L('“A word processor template. I copy, change the name, save as PDF. Half an hour each. Free, but I hate it.”', '« Un modèle de traitement de texte. Je copie, je change le nom, j’enregistre en PDF. Une demi-heure chacune. Gratuit, mais je déteste. »'), L('Free template, half an hour per invoice', 'Modèle gratuit, une demi-heure par facture')),
      tried(L('“I paid for an accounting app: {spend} a month. Made for big companies. Cancelled it after a month.”', '« J’ai payé une appli de compta : {spend} par mois. Faite pour les grandes boîtes. Résiliée au bout d’un mois. »'), L('Accounting app at {spend} a month, cancelled: built for big firms', 'Appli de compta à {spend} par mois, résiliée : faite pour les grandes boîtes')),
    ],
    switchIf: [
      tried(L('“From my phone, in a minute, after the job. And it reminds them so I don’t have to.”', '« Depuis mon téléphone, en une minute, après le travail. Et ça les relance pour que je n’aie pas à le faire. »'), L('One minute on the phone, reminders sent for them', 'Une minute sur le téléphone, relances envoyées à leur place')),
      tried(L('“Cheap. Cheaper than one lost invoice a year.”', '« Pas cher. Moins cher qu’une facture perdue par an. »'), L('Cheaper than one lost invoice a year', 'Moins cher qu’une facture perdue par an')),
    ],
    deeper: L('What happened the last time a client paid late?', 'Que s’est-il passé la dernière fois qu’un client a payé en retard ?'),
    deeperWhy: L('Late payment is where the money is lost, and where they feel awkward chasing.', 'C’est dans les retards de paiement que l’argent se perd, et que relancer est gênant.'),
    personas: [
      { job: L('Freelance photographer · 5 years', 'Photographe indépendant·e · 5 ans'), detail: L('Weddings and events · works from a phone', 'Mariages et événements · travaille sur téléphone'), greeting: L('“I have an edit due tonight, so let’s make this count.”', '« J’ai un montage à rendre ce soir, alors rendons ça utile. »'), pain: L('“I forgot to invoice a wedding. Found it four months later. The couple had moved abroad: {lost}, gone.”', '« J’ai oublié de facturer un mariage. Retrouvé quatre mois plus tard. Le couple était parti à l’étranger : {lost}, envolés. »'), painNote: L('A forgotten invoice: {lost} never paid', 'Une facture oubliée : {lost} jamais payés') },
      { job: L('Independent electrician · 10 years', 'Électricien·ne indépendant·e · 10 ans'), detail: L('Jobs all over town · paid on completion', 'Chantiers dans toute la ville · payé à la fin'), greeting: L('“Talk while I eat. Long day.”', '« Parlez pendant que je mange. Longue journée. »'), pain: L('“I write the bill on paper, the client says ‘I’ll transfer’. Last month three ‘I’ll transfer’ made {lost} I’m still waiting for.”', '« J’écris la facture sur papier, le client dit « je vais virer ». Le mois dernier, trois « je vais virer » font {lost} que j’attends encore. »'), painNote: L('{lost} of “I’ll transfer” still unpaid', '{lost} de « je vais virer » toujours impayés') },
      { job: L('Translator and tutor · 3 years', 'Traducteur·rice et professeur·e particulier·ère · 3 ans'), detail: L('Clients in three countries', 'Clients dans trois pays'), greeting: L('“I work from cafés, so this is my office. Welcome.”', '« Je travaille dans des cafés, alors c’est mon bureau. Bienvenue. »'), pain: L('“Foreign clients ask for a proper invoice with tax numbers. I made a mistake on one, they rejected it, I waited two months for {lost}.”', '« Les clients étrangers demandent une vraie facture avec les numéros fiscaux. Je me suis trompé sur une, ils l’ont rejetée, j’ai attendu deux mois pour {lost}. »'), painNote: L('A rejected invoice: 2 months’ wait for {lost}', 'Une facture rejetée : 2 mois d’attente pour {lost}') },
    ],
  },
  'saas.smes': {
    ask: L('Walk me through last Monday: where did your team’s time go?', 'Racontez-moi lundi dernier : où est passé le temps de votre équipe ?'),
    benefit: L('does your stock, sales and payroll in one place', 'gère stock, ventes et paie au même endroit'),
    tried: [
      tried(L('“Three tools that don’t talk: one for sales, one for stock, a spreadsheet for pay. {spend} a month, and someone retypes everything.”', '« Trois outils qui ne se parlent pas : un pour les ventes, un pour le stock, un tableur pour la paie. {spend} par mois, et quelqu’un ressaisit tout. »'), L('Three disconnected tools at {spend} a month; everything retyped', 'Trois outils non reliés à {spend} par mois ; tout est ressaisi')),
      tried(L('“We hired a developer to build our own. He left halfway. Nobody understands it now.”', '« On a embauché un développeur pour faire le nôtre. Il est parti au milieu. Plus personne ne le comprend. »'), L('A custom build abandoned halfway', 'Un développement sur mesure abandonné à mi-chemin')),
    ],
    switchIf: [
      tried(L('“It must connect to what we use, and someone must answer the phone when it breaks.”', '« Ça doit se connecter à ce qu’on utilise, et quelqu’un doit répondre au téléphone quand ça plante. »'), L('Connects to current tools; real support by phone', 'Se connecte aux outils actuels ; vrai support au téléphone')),
      tried(L('“If it gives my manager back her Mondays. She’s worth more than retyping.”', '« Si ça rend ses lundis à ma responsable. Elle vaut mieux que de la ressaisie. »'), L('Gives the manager back a day a week', 'Rend une journée par semaine à la responsable')),
    ],
    deeper: L('What did the last mistake from retyping cost you?', 'Combien vous a coûté la dernière erreur de ressaisie ?'),
    deeperWhy: L('A mistake with a price puts a number on “saves time”.', 'Une erreur chiffrée met un nombre sur « fait gagner du temps ».'),
    personas: [
      { job: L('Owner, a printing shop · 7 years', 'Propriétaire d’une imprimerie · 7 ans'), detail: L('9 staff · jobs for schools and churches', '9 employés · travaux pour écoles et églises'), greeting: L('“The machines are loud. Lean in.”', '« Les machines sont bruyantes. Rapprochez-vous. »'), pain: L('“Monday is stock day. My manager counts paper and ink by hand, then retypes the week’s orders. Last month she missed one: {lost} job, done twice.”', '« Le lundi, c’est l’inventaire. Ma responsable compte papier et encre à la main, puis ressaisit les commandes de la semaine. Le mois dernier, elle en a raté une : un travail de {lost}, fait deux fois. »'), painNote: L('Manual stock and retyping: a {lost} job done twice', 'Inventaire manuel et ressaisie : un travail de {lost} fait deux fois') },
      { job: L('Manager, a restaurant · 4 years', 'Gérant·e d’un restaurant · 4 ans'), detail: L('15 staff · two shifts', '15 employés · deux services'), greeting: L('“Before the lunch rush, please. After that I’m a waiter.”', '« Avant le coup de feu de midi, s’il vous plaît. Après, je suis serveur. »'), pain: L('“Pay day: I spend a whole day on the spreadsheet. I underpaid a cook by mistake, he quit. Hiring again cost {lost}.”', '« Jour de paie : je passe une journée entière sur le tableur. J’ai sous-payé un cuisinier par erreur, il est parti. Réembaucher a coûté {lost}. »'), painNote: L('A payroll mistake lost a cook: {lost} to rehire', 'Une erreur de paie a fait partir un cuisinier : {lost} pour réembaucher') },
      { job: L('Co-owner, a pharmacy · 6 years', 'Co-propriétaire d’une pharmacie · 6 ans'), detail: L('Two branches · expiry dates matter', 'Deux officines · les dates de péremption comptent'), greeting: L('“My partner thinks software is a waste. Convince me first.”', '« Mon associé pense que les logiciels, c’est du gaspillage. Convainquez-moi d’abord. »'), pain: L('“We threw out {lost} of expired stock last quarter. It was in the other branch’s system, which nobody checks.”', '« On a jeté {lost} de stock périmé le trimestre dernier. C’était dans le système de l’autre officine, que personne ne regarde. »'), painNote: L('{lost} of expired stock nobody saw', '{lost} de stock périmé que personne n’a vu') },
    ],
  },
  'saas.midmarket': {
    ask: L('Walk me through the last time a system went down here.', 'Racontez-moi la dernière fois qu’un système est tombé en panne ici.'),
    benefit: L('runs your operations with a guaranteed uptime', 'fait tourner vos opérations avec une disponibilité garantie'),
    tried: [
      tried(L('“A big international vendor, {spend} a month. Support is a ticket and a three-day wait, from another time zone.”', '« Un gros éditeur international, {spend} par mois. Le support, c’est un ticket et trois jours d’attente, depuis un autre fuseau horaire. »'), L('Global vendor at {spend} a month; support takes 3 days', 'Éditeur international à {spend} par mois ; support en 3 jours')),
      tried(L('“We had a local startup once. Great demo. They closed in a year and we lost our data export.”', '« On a pris une start-up locale une fois. Super démo. Ils ont fermé en un an et on a perdu nos exports de données. »'), L('A local startup vendor closed; data export lost', 'Un fournisseur start-up local a fermé ; export de données perdu')),
    ],
    switchIf: [
      tried(L('“Security our auditors sign off, uptime in the contract, and it plugs into our existing systems.”', '« Une sécurité validée par nos auditeurs, la disponibilité dans le contrat, et ça se branche sur nos systèmes existants. »'), L('Audited security, contracted uptime, integrations', 'Sécurité auditée, disponibilité contractuelle, intégrations')),
      tried(L('“Proof you’ll be here in five years. References, a known name, a data escrow.”', '« La preuve que vous serez là dans cinq ans. Des références, un nom connu, un séquestre des données. »'), L('Proof of staying power: references and data escrow', 'Preuve de pérennité : références et séquestre des données')),
    ],
    deeper: L('Who got the blame for that outage, and what did they have to report?', 'Qui a été tenu responsable de cette panne, et qu’a-t-il dû rapporter ?'),
    deeperWhy: L('The person who got blamed is your champion; their report is your feature list.', 'La personne blâmée sera votre alliée ; son rapport est votre liste de fonctions.'),
    personas: [
      { job: L('IT manager, a distribution company · 8 years', 'Responsable informatique, une société de distribution · 8 ans'), detail: L('350 staff · a warehouse system from 2014', '350 employés · un système d’entrepôt de 2014'), greeting: L('“Security questions first, then the pitch. Agreed?”', '« Les questions de sécurité d’abord, puis la présentation. D’accord ? »'), pain: L('“The warehouse system froze on a Friday. Trucks waited until Monday. The board saw {lost} of late orders.”', '« Le système d’entrepôt s’est figé un vendredi. Les camions ont attendu jusqu’au lundi. Le conseil a vu {lost} de commandes en retard. »'), painNote: L('A Friday outage: {lost} of late orders', 'Une panne un vendredi : {lost} de commandes en retard') },
      { job: L('Finance director, a manufacturer · 10 years', 'Directeur·rice financier·ère, un industriel · 10 ans'), detail: L('Three plants · monthly board reporting', 'Trois usines · rapport mensuel au conseil'), greeting: L('“Every system here ends up on my budget line. Go ahead.”', '« Chaque système finit sur ma ligne budgétaire. Allez-y. »'), pain: L('“Month-end close takes nine days because systems don’t talk. Last time we missed a covenant report and the bank charged {lost}.”', '« La clôture mensuelle prend neuf jours parce que les systèmes ne se parlent pas. La dernière fois, on a raté un rapport à la banque et elle a facturé {lost}. »'), painNote: L('9-day close; a late bank report cost {lost}', 'Clôture en 9 jours ; un rapport bancaire en retard a coûté {lost}') },
      { job: L('COO, a logistics group · 5 years', 'Directeur·rice des opérations, un groupe logistique · 5 ans'), detail: L('Five depots · 24/7 operations', 'Cinq dépôts · activité 24 h/24'), greeting: L('“We never close. Neither can your software.”', '« On ne ferme jamais. Votre logiciel non plus. »'), pain: L('“The dispatch tool went down for six hours at night. We paid drivers to wait: {lost}, and two clients complained.”', '« L’outil de répartition est tombé six heures la nuit. On a payé les chauffeurs à attendre : {lost}, et deux clients se sont plaints. »'), painNote: L('6-hour night outage: {lost} of idle drivers', 'Panne de 6 heures la nuit : {lost} de chauffeurs à l’arrêt') },
    ],
  },
  // ---- Agriculture
  'agritech.farmers': {
    ask: L('Tell me about your last harvest: how did you sell it?', 'Parlez-moi de votre dernière récolte : comment l’avez-vous vendue ?'),
    benefit: L('gets you seeds on credit and a fair price for your crop', 'vous donne des semences à crédit et un prix juste pour votre récolte'),
    tried: [
      tried(L('“The middleman comes with his truck. He names the price. I pay {spend} to the cooperative too, for nothing much.”', '« L’intermédiaire vient avec son camion. Il fixe le prix. Je paie aussi {spend} à la coopérative, pour pas grand-chose. »'), L('The middleman sets the price; {spend} to a cooperative', 'L’intermédiaire fixe le prix ; {spend} à une coopérative')),
      tried(L('“A program gave us a phone app for prices. In English, and the network here comes and goes. We stopped.”', '« Un programme nous a donné une appli de prix. En anglais, et le réseau ici va et vient. On a arrêté. »'), L('A price app: wrong language, no network; abandoned', 'Une appli de prix : mauvaise langue, pas de réseau ; abandonnée')),
    ],
    switchIf: [
      tried(L('“Seeds and fertiliser on credit at planting, paid back at harvest. That is the whole problem.”', '« Semences et engrais à crédit à la plantation, remboursés à la récolte. C’est tout le problème. »'), L('Inputs on credit at planting, repaid at harvest', 'Intrants à crédit à la plantation, remboursés à la récolte')),
      tried(L('“In my language, by voice, and cheaper than the middleman takes. My neighbours will follow.”', '« Dans ma langue, par la voix, et moins cher que ce que prend l’intermédiaire. Mes voisins suivront. »'), L('Voice, local language, cheaper than the middleman', 'Par la voix, en langue locale, moins cher que l’intermédiaire')),
    ],
    deeper: L('What price did the middleman pay, and what did it sell for in town that week?', 'Quel prix l’intermédiaire a-t-il payé, et à combien ça se vendait en ville cette semaine-là ?'),
    deeperWhy: L('The gap between the two prices is the value you can share with them.', 'L’écart entre les deux prix est la valeur que vous pouvez partager avec eux.'),
    personas: [
      { job: L('Maize farmer · 2 hectares', 'Cultivateur·rice de maïs · 2 hectares'), detail: L('Family farm · sells at harvest', 'Ferme familiale · vend à la récolte'), greeting: L('“You came all this way? Sit in the shade. My wife will bring water.”', '« Vous êtes venu jusqu’ici ? Asseyez-vous à l’ombre. On va vous apporter de l’eau. »'), pain: L('“Harvest time everybody sells, so the price falls. Two weeks later it doubled. I lost {lost} selling too early.”', '« À la récolte, tout le monde vend, alors le prix baisse. Deux semaines plus tard, il avait doublé. J’ai perdu {lost} en vendant trop tôt. »'), painNote: L('Sold at the harvest low: {lost} lost', 'Vendu au plus bas de la récolte : {lost} perdus') },
      { job: L('Vegetable grower · 1 hectare', 'Maraîcher·ère · 1 hectare'), detail: L('Tomatoes and peppers · near the road', 'Tomates et piments · près de la route'), greeting: L('“Tomatoes don’t wait. Neither do I. Ask.”', '« Les tomates n’attendent pas. Moi non plus. Demandez. »'), pain: L('“Last season the truck didn’t come for three days. A third of my tomatoes rotted: {lost}.”', '« La saison dernière, le camion n’est pas venu pendant trois jours. Un tiers de mes tomates a pourri : {lost}. »'), painNote: L('Truck 3 days late: a third of the crop, {lost}, rotted', 'Camion en retard de 3 jours : un tiers de la récolte, {lost}, pourri') },
      { job: L('Cassava farmer · cooperative member', 'Producteur·rice de manioc · membre d’une coopérative'), detail: L('Plants twice a year · borrows for seed', 'Plante deux fois par an · emprunte pour les semences'), greeting: L('“The cooperative said a city person would come. Welcome.”', '« La coopérative a dit qu’une personne de la ville viendrait. Bienvenue. »'), pain: L('“I borrowed for fertiliser from a lender at a terrible rate. After harvest, {lost} went to interest alone.”', '« J’ai emprunté pour l’engrais à un prêteur à un taux terrible. Après la récolte, {lost} sont partis rien qu’en intérêts. »'), painNote: L('Fertiliser loan: {lost} in interest alone', 'Prêt pour l’engrais : {lost} rien qu’en intérêts') },
    ],
  },
  'agritech.food-retail': {
    ask: L('Walk me through how you bought your fresh produce last week.', 'Racontez-moi comment vous avez acheté vos produits frais la semaine dernière.'),
    benefit: L('delivers fresh produce to your door every morning', 'livre des produits frais à votre porte chaque matin'),
    tried: [
      tried(L('“I go to the big market at 4am. {spend} a month in transport, plus what spoils on the way.”', '« Je vais au grand marché à 4 h du matin. {spend} de transport par mois, plus ce qui s’abîme en route. »'), L('4am market trips: {spend} a month plus spoilage', 'Marché à 4 h : {spend} par mois plus les pertes')),
      tried(L('“A supplier delivered for a month. Then the quality dropped and the prices rose. Back to the market.”', '« Un fournisseur a livré pendant un mois. Puis la qualité a baissé et les prix ont monté. Retour au marché. »'), L('A delivery supplier: quality fell, prices rose', 'Un fournisseur livreur : qualité en baisse, prix en hausse')),
    ],
    switchIf: [
      tried(L('“Fresh, every morning, same price as the market. If it’s bad once, I send it back and I don’t pay.”', '« Frais, chaque matin, au prix du marché. Si c’est mauvais une fois, je renvoie et je ne paie pas. »'), L('Fresh daily at market price; no pay for bad produce', 'Frais chaque jour au prix du marché ; rien à payer si c’est mauvais')),
      tried(L('“Reliable. I can’t open a restaurant with no onions.”', '« Fiable. Je ne peux pas ouvrir un restaurant sans oignons. »'), L('Reliable supply, every single day', 'Un approvisionnement fiable, chaque jour')),
    ],
    deeper: L('How much did you throw away last week, and why?', 'Combien avez-vous jeté la semaine dernière, et pourquoi ?'),
    deeperWhy: L('Waste is money they can count, and it tells you whether quality or timing is the problem.', 'Le gaspillage, c’est de l’argent qu’ils comptent, et il dit si le problème est la qualité ou les délais.'),
    personas: [
      { job: L('Restaurant owner · 6 years', 'Propriétaire d’un restaurant · 6 ans'), detail: L('Lunch for office workers · 120 plates a day', 'Déjeuners pour employés de bureau · 120 assiettes par jour'), greeting: L('“The kitchen is hot, the office is hotter. Stand here.”', '« La cuisine est chaude, le bureau encore plus. Restez là. »'), pain: L('“Last week the tomatoes were bad and I didn’t see until I cooked. Threw away {lost} of stew.”', '« La semaine dernière, les tomates étaient mauvaises et je ne l’ai vu qu’en cuisinant. J’ai jeté {lost} de ragoût. »'), painNote: L('Bad tomatoes: {lost} of food thrown away', 'Mauvaises tomates : {lost} de nourriture jetés') },
      { job: L('Supermarket produce buyer · 4 years', 'Acheteur·se produits frais, un supermarché · 4 ans'), detail: L('Two stores · fresh aisle', 'Deux magasins · rayon frais'), greeting: L('“My manager wants less waste. Help me and I like you.”', '« Mon responsable veut moins de pertes. Aidez-moi et je vous aimerai. »'), pain: L('“We wrote off {lost} of fruit last month. Half of it arrived bruised from the supplier.”', '« On a passé {lost} de fruits en perte le mois dernier. La moitié est arrivée abîmée du fournisseur. »'), painNote: L('{lost} of fruit written off; half arrived bruised', '{lost} de fruits en perte ; la moitié arrivée abîmée') },
      { job: L('Street food vendor · 9 years', 'Vendeur·se de rue · 9 ans'), detail: L('Grilled fish and plantain · evenings only', 'Poisson grillé et plantain · le soir seulement'), greeting: L('“Come back tonight and eat. Now, talk quickly.”', '« Revenez ce soir manger. Maintenant, parlez vite. »'), pain: L('“The fish man didn’t come on Friday, my best night. I stayed closed: {lost} gone.”', '« Le poissonnier n’est pas venu vendredi, ma meilleure soirée. Je suis resté fermé : {lost} envolés. »'), painNote: L('Supplier no-show on a Friday: {lost} lost', 'Fournisseur absent un vendredi : {lost} perdus') },
    ],
  },
  'agritech.processors': {
    ask: L('Walk me through your last month of raw material: where did it come from, and was it enough?', 'Racontez-moi votre dernier mois de matière première : d’où venait-elle, et y en avait-il assez ?'),
    benefit: L('supplies graded crops in steady volumes', 'fournit des récoltes calibrées en volumes réguliers'),
    tried: [
      tried(L('“Twenty aggregators, {spend} a month in their margins. Some weeks too much, some weeks nothing.”', '« Vingt collecteurs, {spend} par mois de marges. Certaines semaines trop, d’autres rien. »'), L('20 aggregators, {spend} a month in margins, volumes swing', '20 collecteurs, {spend} par mois de marges, volumes irréguliers')),
      tried(L('“We tried contract farming ourselves. Farmers side-sold to the highest bidder at harvest.”', '« On a essayé l’agriculture contractuelle nous-mêmes. Les agriculteurs ont vendu ailleurs au plus offrant à la récolte. »'), L('Own contract farming failed: farmers side-sold', 'Agriculture contractuelle en propre : les agriculteurs ont vendu ailleurs')),
    ],
    switchIf: [
      tried(L('“The same volume every week, graded before it reaches my gate. Then I can run the plant full.”', '« Le même volume chaque semaine, calibré avant d’arriver à ma porte. Alors je peux faire tourner l’usine à plein. »'), L('Steady weekly volume, graded before delivery', 'Volume hebdomadaire régulier, calibré avant livraison')),
      tried(L('“Traceability. My export buyer wants to know which farm every bag came from.”', '« La traçabilité. Mon acheteur à l’export veut savoir de quelle ferme vient chaque sac. »'), L('Traceability to the farm for the export buyer', 'Traçabilité jusqu’à la ferme pour l’acheteur export')),
    ],
    deeper: L('What did it cost the last time the plant stood idle?', 'Combien a coûté la dernière fois que l’usine s’est arrêtée ?'),
    deeperWhy: L('Idle-plant cost is the number their board already watches: tie your price to it.', 'Le coût d’une usine à l’arrêt est le chiffre que leur conseil surveille déjà : liez-y votre prix.'),
    personas: [
      { job: L('Plant manager, a cassava flour mill · 8 years', 'Directeur·rice d’usine, une minoterie de manioc · 8 ans'), detail: L('Runs two shifts when supply allows', 'Tourne en deux équipes quand l’approvisionnement le permet'), greeting: L('“Helmet on. The mill is loud, my office isn’t.”', '« Casque, s’il vous plaît. Le moulin est bruyant, mon bureau non. »'), pain: L('“Last month we stood idle nine days for lack of cassava. Staff still paid, orders late: {lost}.”', '« Le mois dernier, on est restés à l’arrêt neuf jours faute de manioc. Le personnel payé quand même, des commandes en retard : {lost}. »'), painNote: L('9 idle days for lack of supply: {lost}', '9 jours d’arrêt faute d’approvisionnement : {lost}') },
      { job: L('Procurement head, a juice factory · 5 years', 'Responsable des achats, une usine de jus · 5 ans'), detail: L('Buys mangoes and pineapples in season', 'Achète mangues et ananas en saison'), greeting: L('“In season I don’t sleep. Out of season I talk to people like you.”', '« En saison, je ne dors pas. Hors saison, je parle à des gens comme vous. »'), pain: L('“A third of the last mango delivery was under-ripe. We rejected it, the line stopped for two days: {lost}.”', '« Un tiers de la dernière livraison de mangues n’était pas mûr. On l’a refusé, la ligne s’est arrêtée deux jours : {lost}. »'), painNote: L('Ungraded delivery rejected; line stopped 2 days: {lost}', 'Livraison non calibrée refusée ; ligne arrêtée 2 jours : {lost}') },
      { job: L('Owner, a cocoa processor · 11 years', 'Propriétaire d’un transformateur de cacao · 11 ans'), detail: L('Exports to Europe · strict quality rules', 'Exporte vers l’Europe · règles de qualité strictes'), greeting: L('“My buyers audit everything. You’ll be audited too, if we work together.”', '« Mes acheteurs contrôlent tout. Vous aussi, vous le serez, si on travaille ensemble. »'), pain: L('“An export container was rejected: the buyer couldn’t trace the beans. We sold it locally at a loss of {lost}.”', '« Un conteneur à l’export a été refusé : l’acheteur ne pouvait pas tracer les fèves. On l’a vendu localement avec une perte de {lost}. »'), painNote: L('Untraceable beans: container sold at a {lost} loss', 'Fèves non traçables : conteneur vendu à perte, {lost}') },
    ],
  },
};

// ---------------------------------------------------------------- Sales conversations

export type LeadKind = 'fit' | 'price' | 'stars' | 'reliability' | 'tour';
export const LEAD_KINDS: readonly LeadKind[] = ['fit', 'price', 'stars', 'reliability', 'tour'];

/** What you lead with, per industry and need ("tour" is the same everywhere). */
// prettier-ignore
export const LEAD_LINES: Record<Industry, Record<Exclude<LeadKind, 'tour'>, Line>> = {
  fintech: {
    fit: L('“See who owes you, live, without chasing anyone by phone.”', '« Voyez qui vous doit, en direct, sans relancer personne au téléphone. »'),
    price: L('“We’re the cheapest option in town.”', '« Nous sommes l’option la moins chère de la ville. »'),
    stars: L('“We’re the fastest-growing fintech in the city.”', '« Nous sommes la fintech qui grandit le plus vite en ville. »'),
    reliability: L('“It works offline and never loses a record.”', '« Ça marche hors connexion et ne perd jamais une écriture. »'),
  },
  ecommerce: {
    fit: L('“Order in a minute, from your phone, the way you already buy.”', '« Commandez en une minute, depuis votre téléphone, comme vous achetez déjà. »'),
    price: L('“Market prices, delivered, with no fee.”', '« Les prix du marché, livrés, sans frais. »'),
    stars: L('“Everyone in your area already orders from us.”', '« Tout votre quartier commande déjà chez nous. »'),
    reliability: L('“It arrives when we say, or you don’t pay.”', '« Ça arrive à l’heure dite, ou vous ne payez pas. »'),
  },
  logistics: {
    fit: L('“One tracking link your customers can follow, so they stop calling you.”', '« Un lien de suivi pour vos clients, pour qu’ils arrêtent de vous appeler. »'),
    price: L('“A fixed price per trip, lower than you pay now.”', '« Un prix fixe par trajet, moins cher qu’aujourd’hui. »'),
    stars: L('“The biggest shippers in the city already use us.”', '« Les plus gros expéditeurs de la ville nous utilisent déjà. »'),
    reliability: L('“On time, every time, with penalties in the contract.”', '« À l’heure, à chaque fois, avec des pénalités au contrat. »'),
  },
  healthtech: {
    fit: L('“Records, bookings and billing in one place, built for how you work.”', '« Dossiers, rendez-vous et facturation au même endroit, pensés pour votre façon de travailler. »'),
    price: L('“Less than one clinic visit a month.”', '« Moins qu’une consultation par mois. »'),
    stars: L('“Licensed doctors, a name families already trust.”', '« Des médecins diplômés, un nom auquel les familles font déjà confiance. »'),
    reliability: L('“Your data stays protected, and it’s up day and night.”', '« Vos données restent protégées, et c’est disponible jour et nuit. »'),
  },
  edtech: {
    fit: L('“It saves your teachers hours, and parents pay on time.”', '« Ça fait gagner des heures à vos enseignants, et les parents paient à l’heure. »'),
    price: L('“Cheaper than one month of a lesson teacher.”', '« Moins cher qu’un mois de répétiteur. »'),
    stars: L('“Schools across the city already use us.”', '« Des écoles de toute la ville nous utilisent déjà. »'),
    reliability: L('“Works on any phone, even without data.”', '« Marche sur n’importe quel téléphone, même sans données. »'),
  },
  saas: {
    fit: L('“It connects to what you already use and gives your team its time back.”', '« Ça se connecte à ce que vous utilisez déjà et rend du temps à votre équipe. »'),
    price: L('“Half the price of the big vendors.”', '« Moitié prix par rapport aux gros éditeurs. »'),
    stars: L('“Companies like yours already run on us.”', '« Des entreprises comme la vôtre tournent déjà avec nous. »'),
    reliability: L('“Uptime in the contract, and a person on the phone when you need one.”', '« La disponibilité au contrat, et une vraie personne au téléphone quand il le faut. »'),
  },
  agritech: {
    fit: L('“Graded, traceable supply in the volumes you plan for.”', '« Un approvisionnement calibré et traçable, dans les volumes que vous prévoyez. »'),
    price: L('“Better prices than the middleman, every week.”', '« De meilleurs prix que l’intermédiaire, chaque semaine. »'),
    stars: L('“The biggest buyers in the region work with us.”', '« Les plus gros acheteurs de la région travaillent avec nous. »'),
    reliability: L('“Delivered every week, on the day, without fail.”', '« Livré chaque semaine, le jour prévu, sans faute. »'),
  },
};

export const TOUR_LINE = L(
  'A tour of every feature, one by one.',
  'Une visite de chaque fonction, une par une.',
);

/** How they react to your opening: right on their need, a need they have, a tour, or a miss. */
export const LEAD_REACTIONS: Record<'match' | 'partial' | 'tour' | 'miss', Line> = {
  match: L(
    '“That is exactly my problem. Show me.”',
    '« C’est exactement mon problème. Montrez-moi. »',
  ),
  partial: L(
    '“Hm. That matters, but it’s not what keeps me up at night.”',
    '« Hum. Ça compte, mais ce n’est pas ce qui m’empêche de dormir. »',
  ),
  tour: L(
    '“…OK. And what does all this do for me?”',
    '« … D’accord. Et tout ça, ça fait quoi pour moi ? »',
  ),
  miss: L('“Everybody says that.”', '« Tout le monde dit ça. »'),
};

export const LEAD_WHY: Record<'match' | 'partial' | 'tour' | 'miss', Line> = {
  match: L(
    'You led with what they need most.',
    'Vous avez commencé par ce dont ils ont le plus besoin.',
  ),
  partial: L(
    'It matters to them, but it isn’t what they need most.',
    'Ça compte pour eux, mais ce n’est pas leur premier besoin.',
  ),
  tour: L(
    'A feature tour talks about you. Lead with their problem.',
    'Une visite des fonctions parle de vous. Commencez par leur problème.',
  ),
  miss: L('That isn’t what they care about.', 'Ce n’est pas ce qui les intéresse.'),
};

export type PriceBand = 'below' | 'inside' | 'top' | 'above';

export const PRICE_REACTIONS: Record<PriceBand, Line> = {
  below: L('“That cheap? Is it any good?”', '« Si peu cher ? C’est sérieux ? »'),
  inside: L('“That I can work with.”', '« Ça, je peux travailler avec. »'),
  top: L(
    '“That’s the top of what we’d spend. It had better work.”',
    '« C’est le maximum de ce qu’on dépenserait. Il vaut mieux que ça marche. »',
  ),
  above: L(
    '“That’s more than we spend on this now.”',
    '« C’est plus que ce qu’on dépense pour ça aujourd’hui. »',
  ),
};

export const PRICE_WHY: Record<PriceBand, Line> = {
  below: L(
    'Below their band: you left money on the table and made them doubt the quality.',
    'Sous leur fourchette : vous avez laissé de l’argent sur la table et semé le doute sur la qualité.',
  ),
  inside: L(
    'Inside their budget band, without leaving money on the table.',
    'Dans leur fourchette de budget, sans laisser d’argent sur la table.',
  ),
  top: L(
    'At the top of their band: possible, but it costs you some chance.',
    'En haut de leur fourchette : possible, mais ça vous coûte des chances.',
  ),
  above: L(
    'Above what they can spend: a budget problem, not a haggle.',
    'Au-dessus de ce qu’ils peuvent dépenser : un problème de budget, pas de marchandage.',
  ),
};

export type TermsKind = 'pilot' | 'monthly' | 'annual' | 'usage';
export const TERMS_KINDS: readonly TermsKind[] = ['pilot', 'monthly', 'annual', 'usage'];

export const TERMS_LINES: Record<TermsKind, Line> = {
  pilot: L('A paid pilot for one month, then a year', 'Un pilote payant d’un mois, puis un an'),
  monthly: L('Month-to-month, cancel any time', 'Au mois, résiliable à tout moment'),
  annual: L('Annual, paid up front, 15% off', 'Annuel, payé d’avance, 15 % de remise'),
  usage: L(
    'Pay as you use it, billed monthly (10% less)',
    'Paiement à l’usage, facturé au mois (10 % de moins)',
  ),
};

export const TERMS_REACTIONS: Record<'good' | 'ok' | 'bad', Line> = {
  good: L('“Yes. That makes it easy to say yes.”', '« Oui. Comme ça, c’est facile de dire oui. »'),
  ok: L('“Could work. Let me think.”', '« Ça pourrait aller. Laissez-moi réfléchir. »'),
  bad: L('“That’s a big step for us right now.”', '« C’est un gros pas pour nous en ce moment. »'),
};

export const TERMS_WHY: Record<TermsKind, Line> = {
  pilot: L(
    'A paid pilot makes it safe to say yes when trust (or their authority to sign) is low.',
    'Un pilote payant rend le oui facile quand la confiance (ou le pouvoir de signer) est faible.',
  ),
  monthly: L(
    'Price-sensitive and in no hurry: no commitment wins.',
    'Sensibles au prix et pas pressés : l’absence d’engagement l’emporte.',
  ),
  annual: L(
    'They can sign alone, trust you and need it now: lock in the year.',
    'Ils signent seuls, vous font confiance et en ont besoin maintenant : verrouillez l’année.',
  ),
  usage: L(
    'Price-sensitive: paying as they use it feels fair.',
    'Sensibles au prix : payer à l’usage leur semble juste.',
  ),
};

export const TALK_GRADES: { min: number; label: Line }[] = [
  { min: 80, label: L('A strong conversation', 'Une conversation solide') },
  { min: 60, label: L('A decent conversation', 'Une conversation correcte') },
  { min: 40, label: L('A shaky conversation', 'Une conversation hésitante') },
  { min: 0, label: L('It never connected', 'Le courant n’est jamais passé') },
];
