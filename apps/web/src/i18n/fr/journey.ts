/** The founder journey: chapters, steps, the objective tracker and its inbox notes. */
const CHAPTERS: [string, string][] = [
  ['The Hustle', 'La débrouille'],
  ['The First Team', 'La première équipe'],
  ['The Fundraising Game', 'Le jeu de la levée de fonds'],
  ['The Growth Trap', 'Le piège de la croissance'],
  ['The Empire', 'L’empire'],
  ['The Exit', 'La sortie'],
  ['The Capital Allocator', 'L’investisseur'],
];

/** The engine's inbox notes when a chapter completes (exact text, via tx()). */
const notes: Record<string, string> = {};
CHAPTERS.forEach(([en, fr], i) => {
  const next = CHAPTERS.slice(i + 1);
  for (const [nen, nfr] of next)
    notes[`Chapter ${i + 1} complete: ${en}. Next: ${nen}.`] =
      `Chapitre ${i + 1} terminé : ${fr}. Ensuite : ${nfr}.`;
  // Chapters can finish out of order: the "next" may be an earlier one.
  for (const [nen, nfr] of CHAPTERS.slice(0, i))
    notes[`Chapter ${i + 1} complete: ${en}. Next: ${nen}.`] =
      `Chapitre ${i + 1} terminé : ${fr}. Ensuite : ${nfr}.`;
  notes[`Chapter ${i + 1} complete: ${en}. Every chapter of your journey is done.`] =
    `Chapitre ${i + 1} terminé : ${fr}. Tous les chapitres de votre parcours sont bouclés.`;
});

export const journey: Record<string, string> = {
  ...Object.fromEntries(CHAPTERS),
  ...notes,
  // ---- the sheet and the chip
  'Your journey': 'Votre parcours',
  Journey: 'Parcours',
  Opportunity: 'Opportunité',
  Personal: 'Personnel',
  'Chapter {n} · {title}': 'Chapitre {n} · {title}',
  'Journey complete': 'Parcours terminé',
  Unpin: 'Désépingler',
  'Pin: keep this one here': 'Épingler : garder celui-ci',
  'Not now: show me another': 'Pas maintenant : un autre',
  'Nothing for now.': 'Rien pour l’instant.',
  Objectives: 'Objectifs',
  'Suggestions, never chores: pin what matters, dismiss what doesn’t.':
    'Des suggestions, jamais des corvées : épinglez ce qui compte, écartez le reste.',
  'You chose to bootstrap: growing on your own revenue, no outside money.':
    'Vous avez choisi l’autofinancement : vous grandissez sur vos revenus, sans argent extérieur.',
  'Bootstrapping: no investors or loans; you keep all the company and grow on revenue. You can change your mind any time.':
    'L’autofinancement : ni investisseurs ni prêts ; vous gardez toute l’entreprise et grandissez sur vos revenus. Vous pouvez changer d’avis à tout moment.',
  'Undo bootstrap choice': 'Annuler l’autofinancement',
  'Choose to bootstrap': 'Choisir l’autofinancement',
  'Chapter {n}: {title}': 'Chapitre {n} : {title}',
  Complete: 'Terminé',
  'You are here': 'Vous êtes ici',
  'Any {n} of these finish the chapter.': '{n} au choix suffisent pour finir le chapitre.',
  optional: 'facultatif',
  done: 'fait',
  'to do': 'à faire',
  'The founder journey follows building a company. Start one any time and your chapters begin.':
    'Le parcours du fondateur suit la création d’une entreprise. Lancez-en une quand vous voulez et vos chapitres commencent.',
  'Chapter {n} complete: {title}': 'Chapitre {n} terminé : {title}',
  'Next: {title}': 'Ensuite : {title}',
  'See journey': 'Voir le parcours',
  // ---- chapter stories
  'Validate a problem and win your first customer.':
    'Validez un problème et gagnez votre premier client.',
  'Stop doing everything yourself: bring people in.':
    'Arrêtez de tout faire vous-même : faites entrer du monde.',
  'Choose how to fund the company: bootstrap, borrow, win or raise.':
    'Choisissez comment financer l’entreprise : autofinancement, emprunt, prix ou levée.',
  'Scale up without letting burn and churn sink you.':
    'Grandissez sans vous laisser couler par les dépenses et les départs de clients.',
  'Compete and expand: new cities, acquisitions, a real board.':
    'Affrontez la concurrence et étendez-vous : nouvelles villes, rachats, un vrai conseil.',
  'Turn what you built into money in your pocket.':
    'Transformez ce que vous avez bâti en argent dans votre poche.',
  'Back the next founders: invest, mentor, build a legacy.':
    'Soutenez les prochains fondateurs : investissez, accompagnez, laissez une trace.',
  // ---- steps
  'Start your company': 'Lancez votre entreprise',
  'Pick an idea, a name and how you’ll charge': 'Choisissez une idée, un nom et un modèle de prix',
  'Talk to customers about their problem': 'Parlez à des clients de leur problème',
  'At the Market: interviews show what they’d pay for':
    'Au marché : les entretiens montrent ce qu’ils paieraient',
  'Win your first paying customer': 'Gagnez votre premier client payant',
  'Sell at the Market, or pitch a local business':
    'Vendez au marché, ou démarchez un commerce local',
  'Reach {n} paying customers': 'Atteignez {n} clients payants',
  'Keep selling: each one proves the idea': 'Continuez à vendre : chacun prouve l’idée',
  'Make your first hire or bring in a co-founder':
    'Faites votre première embauche ou faites entrer un cofondateur',
  'The Hub has talent and the jobs board': 'Le Hub a des talents et le tableau des offres',
  'Marketing, outreach and word of mouth': 'Marketing, prospection et bouche-à-oreille',
  'Earn your first steady monthly revenue': 'Gagnez vos premiers revenus mensuels réguliers',
  'Set your price and grow customers on the Company tab':
    'Fixez votre prix et développez vos clients dans l’onglet Entreprise',
  'Pitch an investor, an accelerator, a grant or a competition':
    'Présentez-vous à un investisseur, un accélérateur, une subvention ou un concours',
  'The Investor Quarter, angels at cafés, the Events app':
    'Le quartier des investisseurs, les business angels aux cafés, l’app Événements',
  'Get funded, or choose to bootstrap': 'Obtenez un financement, ou choisissez l’autofinancement',
  'Equity, a loan, a grant, an accelerator or a prize all count':
    'Capital, prêt, subvention, accélérateur ou prix : tout compte',
  'Have {n}+ months of runway, or turn a profit':
    'Ayez {n} mois de trésorerie ou plus, ou devenez rentable',
  'Cash divided by monthly burn: watch it on the Money tab':
    'La trésorerie divisée par les dépenses mensuelles : suivez-la dans l’onglet Argent',
  'Grow monthly revenue': 'Augmentez le chiffre d’affaires mensuel',
  'More customers, better pricing, local business deals':
    'Plus de clients, de meilleurs prix, des contrats avec les commerces',
  'Build a team of {n}': 'Constituez une équipe de {n}',
  'Hire at the Hub; mind the payroll': 'Recrutez au Hub ; surveillez la masse salariale',
  'Have a profitable month': 'Réalisez un mois rentable',
  'Revenue above all costs: the burn trap beaten':
    'Des revenus au-dessus de tous les coûts : le piège évité',
  'Open in a second city': 'Ouvrez dans une deuxième ville',
  'Open a branch from the Company tab': 'Ouvrez une succursale depuis l’onglet Entreprise',
  'Buy another company': 'Rachetez une autre entreprise',
  'Make an offer to a rival': 'Faites une offre à un concurrent',
  'Raise a Series A': 'Levez une série A',
  'Pitch the funds with real traction': 'Présentez-vous aux fonds avec une vraie traction',
  'Have an investor on your board': 'Ayez un investisseur à votre conseil',
  'Negotiated with a round: governance grows up':
    'Négocié lors d’une levée : la gouvernance mûrit',
  'Reach a valuation worth selling': 'Atteignez une valorisation qui vaut la vente',
  'Set by your last priced round': 'Fixée par votre dernière levée valorisée',
  'Get an offer for your company': 'Recevez une offre pour votre entreprise',
  'Buyers find growing companies; deals land on the Money tab':
    'Les acheteurs trouvent les entreprises qui grandissent ; les offres arrivent dans l’onglet Argent',
  'Sell your company': 'Vendez votre entreprise',
  'Accept an acquisition offer: the cap table pays out':
    'Acceptez une offre de rachat : la table de capitalisation est payée',
  'Become an investor': 'Devenez investisseur',
  'From your profile, with a year of savings': 'Depuis votre profil, avec un an d’économies',
  'Invest in a startup': 'Investissez dans une startup',
  'Back a founder from the Invest app': 'Soutenez un fondateur depuis l’app Investir',
  'Raise a fund': 'Levez un fonds',
  'Pitch LPs and invest their money': 'Convainquez des LP et investissez leur argent',
  // ---- opportunity and personal prompts
  'A deal is waiting for your answer': 'Une offre attend votre réponse',
  'Enter {name}': 'Participer : {name}',
  'A pitch competition this month · prize pool {amount}':
    'Un concours de pitch ce mois-ci · dotation {amount}',
  'Rest at home': 'Reposez-vous chez vous',
  'Your energy is low: sleep it off': 'Votre énergie est basse : allez dormir',
  'Quiz night at {place}': 'Soirée quiz à {place}',
  'Play for the pot against other players': 'Jouez la cagnotte contre d’autres joueurs',
  'Take in the view from {name}': 'Admirez la vue depuis {name}',
  'Go up alone, or take someone special': 'Montez seul, ou avec quelqu’un de spécial',
  'Plan a hangout with friends': 'Organisez une sortie entre amis',
  'Friendships open doors, and lift your mood':
    'Les amitiés ouvrent des portes et remontent le moral',
  'Ask someone out on a date': 'Proposez un rendez-vous à quelqu’un',
  'From a chat: dinner, a view or your place': 'Depuis une discussion : dîner, une vue ou chez vous',
  'Make your home more comfortable': 'Rendez votre chez-vous plus confortable',
  'Better rest, better mood': 'Meilleur repos, meilleur moral',
};
